import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import * as engine from "../dist/engine.js";

const REQUIRED_MODES = [
  "exact_closed",
  "exact_open",
  "lower",
  "upper",
  "first_occ",
  "last_occ",
  "last_le",
  "last_lt",
  "first_true",
  "last_true",
  "rotated",
];

const NUMERIC_MODES = REQUIRED_MODES.slice(0, 8);
const UPPER_MID_MODES = new Set(["last_le", "last_lt", "last_true"]);
const HALF_OPEN_MODES = new Set([
  "exact_open",
  "lower",
  "upper",
  "first_occ",
  "last_occ",
  "first_true",
]);
const ANSWER_INCLUSIVE_MODES = new Set(["last_le", "last_lt", "last_true"]);

const stats = {
  stateCases: 0,
  acceptedMoves: 0,
  rejectedMoves: 0,
  oracleChecks: 0,
  validationChecks: 0,
  generatedCases: 0,
  pythonPrograms: 0,
  pythonCases: 0,
  guardChecks: 0,
  knownWrongMoves: 0,
  coincidentalRejections: 0,
  assertions: 0,
};

function check(value, message) {
  stats.assertions += 1;
  assert.ok(value, message);
}

function equal(actual, expected, message) {
  stats.assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function snapshot(value) {
  return structuredClone(value);
}

function modeIds(modes) {
  return modes.map((mode) => (typeof mode === "string" ? mode : mode?.id));
}

function sortedArrays(maxLength, values) {
  const out = [];
  function visit(prefix, start, remaining) {
    out.push(prefix.slice());
    if (remaining === 0) return;
    for (let i = start; i < values.length; i += 1) {
      prefix.push(values[i]);
      visit(prefix, i, remaining - 1);
      prefix.pop();
    }
  }
  // `visit` already emits every prefix, so a single depth-limited traversal
  // creates each nondecreasing array exactly once.
  visit([], 0, maxLength);
  return out;
}

function allArrays(maxLength, values) {
  const out = [];
  function visit(prefix, remaining) {
    out.push(prefix.slice());
    if (remaining === 0) return;
    for (const value of values) {
      prefix.push(value);
      visit(prefix, remaining - 1);
      prefix.pop();
    }
  }
  visit([], maxLength);
  return out;
}

function subsets(values) {
  const out = [];
  for (let mask = 0; mask < 2 ** values.length; mask += 1) {
    const subset = [];
    for (let bit = 0; bit < values.length; bit += 1) {
      if (mask & (1 << bit)) subset.push(values[bit]);
    }
    out.push(subset);
  }
  return out;
}

function rotatedArrays(values) {
  const unique = new Map();
  for (const base of subsets(values)) {
    if (base.length === 0) {
      unique.set("[]", []);
      continue;
    }
    for (let cut = 0; cut < base.length; cut += 1) {
      const rotated = base.slice(cut).concat(base.slice(0, cut));
      unique.set(JSON.stringify(rotated), rotated);
    }
  }
  return [...unique.values()];
}

function linearOracle(mode, array, target) {
  switch (mode) {
    case "exact_closed":
    case "exact_open":
    case "rotated":
      return array.indexOf(target);
    case "lower": {
      const found = array.findIndex((value) => value >= target);
      return found < 0 ? array.length : found;
    }
    case "upper": {
      const found = array.findIndex((value) => value > target);
      return found < 0 ? array.length : found;
    }
    case "first_occ":
      return array.indexOf(target);
    case "last_occ":
      return array.lastIndexOf(target);
    case "last_le":
      return array.reduce((answer, value, index) => (value <= target ? index : answer), -1);
    case "last_lt":
      return array.reduce((answer, value, index) => (value < target ? index : answer), -1);
    case "first_true": {
      const found = array.findIndex(Boolean);
      return found < 0 ? array.length : found;
    }
    case "last_true":
      return array.reduce((answer, value, index) => (value ? index : answer), -1);
    default:
      throw new Error(`No independent oracle for ${mode}`);
  }
}

function resultMatches(mode, array, target, actual) {
  const expected = linearOracle(mode, array, target);
  if ((mode === "exact_closed" || mode === "exact_open") && expected >= 0) {
    return Number.isInteger(actual) && actual >= 0 && actual < array.length && array[actual] === target;
  }
  return Object.is(actual, expected);
}

function boundaryOracle(mode, array, target) {
  let predicate;
  if (mode === "lower" || mode === "first_occ") predicate = (value) => value >= target;
  else if (mode === "upper" || mode === "last_occ") predicate = (value) => value > target;
  else if (mode === "first_true") predicate = Boolean;
  else throw new Error(`No boundary oracle for ${mode}`);
  const found = array.findIndex(predicate);
  return found < 0 ? array.length : found;
}

function bounds(state) {
  const l = Number.isInteger(state?.l) ? state.l : state?.left;
  const r = Number.isInteger(state?.r) ? state.r : state?.right;
  return { l, r };
}

function assertInitialBounds(mode, state, n, label) {
  const { l, r } = bounds(state);
  check(Number.isInteger(l) && Number.isInteger(r), `${label}: state must expose integer l/r bounds`);
  if (ANSWER_INCLUSIVE_MODES.has(mode)) equal([l, r], [-1, n - 1], `${label}: answer-inclusive initial bounds`);
  else if (HALF_OPEN_MODES.has(mode)) equal([l, r], [0, n], `${label}: half-open initial bounds`);
  else equal([l, r], [0, n - 1], `${label}: inclusive initial bounds`);
}

function assertMidpoint(mode, state, actual, label) {
  const { l, r } = bounds(state);
  const expected = UPPER_MID_MODES.has(mode)
    ? Math.floor((l + r + 1) / 2)
    : Math.floor((l + r) / 2);
  equal(actual, expected, `${label}: midpoint rounding`);
  check(Number.isInteger(actual), `${label}: midpoint is integer`);
  if (ANSWER_INCLUSIVE_MODES.has(mode)) check(actual > l && actual <= r, `${label}: upper midpoint is in (l,r]`);
  else if (HALF_OPEN_MODES.has(mode)) check(actual >= l && actual < r, `${label}: midpoint is in [l,r)`);
  else check(actual >= l && actual <= r, `${label}: midpoint is in [l,r]`);
}

function assertInvariant(mode, state, array, target, label) {
  const { l, r } = bounds(state);
  const n = array.length;
  check(Number.isInteger(l) && Number.isInteger(r), `${label}: bounds remain integers`);
  if (ANSWER_INCLUSIVE_MODES.has(mode)) {
    check(l >= -1 && l <= r && r < n, `${label}: answer-inclusive bounds stay within [-1,n-1]`);
  } else if (HALF_OPEN_MODES.has(mode)) {
    check(l >= 0 && l <= r && r <= n, `${label}: half-open bounds stay within [0,n]`);
  } else {
    check(l >= 0 && l <= n && r >= -1 && r < n, `${label}: inclusive bounds stay within sentinels`);
  }

  const answer = linearOracle(mode, array, target);
  if (mode === "lower" || mode === "upper" || mode === "first_occ" || mode === "last_occ" || mode === "first_true") {
    // Cut-position invariants: every index before l is known false for the
    // boundary predicate and no index at/after r can precede the answer.
    const cut = boundaryOracle(mode, array, target);
    check(l <= cut, `${label}: l does not pass cut`);
    check(r >= cut, `${label}: r does not precede cut`);
  }
  if (ANSWER_INCLUSIVE_MODES.has(mode)) {
    check(l <= answer && answer <= r, `${label}: inclusive answer stays in [l,r]`);
  }
  if ((mode === "exact_closed" || mode === "exact_open" || mode === "rotated") && answer >= 0 && engine.active(state)) {
    const rightIncluded = mode !== "exact_open";
    check(array.some((value, index) => value === target && index >= l && (rightIncluded ? index <= r : index < r)), `${label}: present target is not discarded`);
  }
  if (typeof engine.invariant === "function") check(engine.invariant(state), `${label}: exported invariant agrees`);
}

function invalidMove(expected) {
  if (typeof expected === "string") return "__invalid_move__";
  if (typeof expected === "number") return Number.NaN;
  if (expected && typeof expected === "object") {
    const copy = snapshot(expected);
    const key = ["type", "kind", "move", "action", "id"].find((candidate) => candidate in copy);
    if (key) copy[key] = "__invalid_move__";
    else copy.__invalid_move__ = true;
    return copy;
  }
  return { type: "__invalid_move__" };
}

function qualifyingOracle(mode, value, target) {
  if (mode === "first_true" || mode === "last_true") return value;
  if (mode === "upper" || mode === "last_occ") return value > target;
  if (mode === "last_lt") return value < target;
  if (mode === "last_le") return value <= target;
  return value >= target;
}

function expectedMoveOracle(mode, state, mid) {
  const value = state.a[mid];
  if (["lower", "upper", "first_occ", "last_occ", "first_true"].includes(mode)) {
    return qualifyingOracle(mode, value, state.target) ? "right_mid" : "left_plus";
  }
  if (["last_le", "last_lt", "last_true"].includes(mode)) {
    return qualifyingOracle(mode, value, state.target) ? "left_mid" : "right_minus";
  }
  if (value === state.target) return "found";
  if (mode === "rotated") {
    if (state.a[state.l] <= value) {
      return state.a[state.l] <= state.target && state.target < value ? "right_minus" : "left_plus";
    }
    return value < state.target && state.target <= state.a[state.r] ? "left_plus" : "right_minus";
  }
  if (value < state.target) return "left_plus";
  return mode === "exact_closed" ? "right_minus" : "right_mid";
}

function expectedRelation(state, mid) {
  const value = state.a[mid];
  if (state.id === "first_true" || state.id === "last_true") return value ? "true" : "false";
  return value < state.target ? "less" : value > state.target ? "greater" : "equal";
}

function runCase(mode, array, target, label) {
  let state = engine.init(mode, array, target);
  stats.stateCases += 1;
  equal(state.id, mode, `${label}: init preserves mode id`);
  check(state.a !== array, `${label}: init clones the caller array`);
  assertInitialBounds(mode, state, array.length, label);
  assertInvariant(mode, state, array, target, `${label}/initial`);

  let steps = 0;
  const maxSteps = 4 + Math.ceil(Math.log2(array.length + 1));
  while (engine.active(state)) {
    check(steps < maxSteps, `${label}: termination budget exceeded`);
    equal(engine.result(state), null, `${label}: active state has no result yet`);
    const before = snapshot(state);
    const beforeBounds = bounds(before);
    const mid = engine.midpoint(state);
    assertMidpoint(mode, state, mid, `${label}/step-${steps}`);

    const move = engine.expectedMove(state);
    check(move !== undefined && move !== null, `${label}: active state has an expected move`);
    equal(move, expectedMoveOracle(mode, state, mid), `${label}: expected move follows the mathematical branch`);
    if (typeof engine.relation === "function") equal(engine.relation(state), expectedRelation(state, mid), `${label}: relation reports the midpoint comparison`);
    if (typeof engine.qualifies === "function" && !["exact_closed", "exact_open", "rotated"].includes(mode)) {
      equal(engine.qualifies(state, state.a[mid]), qualifyingOracle(mode, state.a[mid], target), `${label}: qualifies reports the boundary predicate`);
    }

    const rejected = engine.applyMove(state, invalidMove(move));
    check(rejected && rejected.ok === false, `${label}: unknown move is rejected`);
    check(typeof rejected.reason === "string" && rejected.reason.length > 0, `${label}: rejection explains why`);
    equal(state, before, `${label}: rejected move does not mutate caller state`);
    if (rejected.state !== undefined) equal(rejected.state, before, `${label}: rejection returns unchanged state`);
    stats.rejectedMoves += 1;

    const applied = engine.applyMove(state, move);
    check(applied && applied.ok === true, `${label}: expected move is accepted`);
    check(applied.state && typeof applied.state === "object", `${label}: accepted move returns state`);
    equal(state, before, `${label}: accepted move does not mutate caller state`);
    state = applied.state;
    stats.acceptedMoves += 1;
    equal(state.steps, before.steps + 1, `${label}: accepted move increments step count once`);

    assertInvariant(mode, state, array, target, `${label}/after-${steps}`);
    const afterBounds = bounds(state);
    if (move === "left_plus") equal(afterBounds.l, mid + 1, `${label}: l = mid + 1 transition`);
    else if (move === "left_mid") equal(afterBounds.l, mid, `${label}: l = mid transition`);
    else if (move === "right_minus") equal(afterBounds.r, mid - 1, `${label}: r = mid - 1 transition`);
    else if (move === "right_mid") equal(afterBounds.r, mid, `${label}: r = mid transition`);
    else if (move === "found") equal(state.found, mid, `${label}: equality records midpoint`);
    if (engine.active(state)) {
      check(afterBounds.r - afterBounds.l < beforeBounds.r - beforeBounds.l, `${label}: active move strictly shrinks interval`);
    }
    steps += 1;
  }

  const actual = engine.result(state);
  check(resultMatches(mode, array, target, actual), `${label}: result ${actual} disagrees with linear oracle ${linearOracle(mode, array, target)}`);
  const advertised = engine.oracle(mode, array, target);
  check(resultMatches(mode, array, target, advertised), `${label}: exported oracle disagrees with independent oracle`);
  stats.oracleChecks += 1;
  equal(engine.expectedMove(state), null, `${label}: terminal state has no expected move`);
  const terminalBefore = snapshot(state);
  const afterStop = engine.applyMove(state, "left_plus");
  check(afterStop.ok === false, `${label}: move after termination is rejected`);
  equal(state, terminalBefore, `${label}: move after termination does not mutate caller state`);
  equal(afterStop.state, terminalBefore, `${label}: terminal rejection returns unchanged state`);
  stats.rejectedMoves += 1;
}

function validationAccepted(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return true;
  if (typeof value === "string") return value.length === 0;
  if (typeof value === "object" && "ok" in value) return value.ok === true;
  if (typeof value === "object" && "valid" in value) return value.valid === true;
  return Boolean(value);
}

function validate(mode, array, target, expected, label) {
  let answer;
  let threw = false;
  try {
    answer = engine.validateInput(mode, array, target);
  } catch {
    threw = true;
  }
  check(!threw, `${label}: validateInput should report rather than throw`);
  equal(validationAccepted(answer), expected, `${label}: validation outcome`);
  stats.validationChecks += 1;
}

function verifySurface() {
  for (const name of ["init", "active", "midpoint", "expectedMove", "applyMove", "result", "oracle", "validateInput", "generateCases", "python"]) {
    check(typeof engine[name] === "function", `${name} must be exported as a function`);
  }
  check(Array.isArray(engine.MODES), "MODES must be an array");
  const ids = modeIds(engine.MODES);
  equal([...ids].sort(), [...REQUIRED_MODES].sort(), "MODES must contain every required mode exactly once");
  check(new Set(ids).size === ids.length, "MODES contains no duplicate ids");
  check(engine.conditions && (typeof engine.conditions === "object" || typeof engine.conditions === "function"), "conditions must be exposed");
}

function verifyValidation() {
  for (const mode of NUMERIC_MODES) validate(mode, [-2, -1, -1, 2], 0, true, `${mode}/valid`);
  validate("first_true", [false, false, true, true], null, true, "first_true/valid");
  validate("last_true", [true, true, false, false], null, true, "last_true/valid");
  validate("rotated", [1, 3, 7, -4, -1], 3, true, "rotated/valid");

  for (const mode of NUMERIC_MODES) validate(mode, [0, -1], 0, false, `${mode}/unsorted`);
  validate("first_true", [false, true, false], null, false, "first_true/nonmonotone");
  validate("last_true", [true, false, true], null, false, "last_true/nonmonotone");
  validate("rotated", [1, 1], 1, false, "rotated/duplicates");
  validate("rotated", [1, 3, 2, 4], 2, false, "rotated/multiple-drops");
  validate("exact_closed", "not an array", 1, false, "input/non-array");
  validate("exact_closed", [0, Number.NaN], 1, false, "input/nan");
  validate("exact_closed", [0, Number.POSITIVE_INFINITY], 1, false, "input/infinity");
  validate("not_a_mode", [], 1, false, "input/unknown-mode");

  const arbitraryNumeric = allArrays(4, [-2, -1, 0, 1, 2]);
  for (const mode of NUMERIC_MODES) {
    for (const array of arbitraryNumeric) {
      const sorted = array.every((value, index) => index === 0 || array[index - 1] <= value);
      validate(mode, array, 0, sorted, `${mode}/validation-exhaustive/${JSON.stringify(array)}`);
    }
  }
  for (const array of allArrays(7, [false, true])) {
    const falseTrue = array.every((value, index) => index === 0 || Number(array[index - 1]) <= Number(value));
    const trueFalse = array.every((value, index) => index === 0 || Number(array[index - 1]) >= Number(value));
    validate("first_true", array, null, falseTrue, `first_true/validation-exhaustive/${JSON.stringify(array)}`);
    validate("last_true", array, null, trueFalse, `last_true/validation-exhaustive/${JSON.stringify(array)}`);
  }
  for (const array of arbitraryNumeric) {
    const distinct = new Set(array).size === array.length;
    const descents = array.reduce((count, value, index) => count + (value > array[(index + 1) % array.length] ? 1 : 0), 0);
    validate("rotated", array, 0, distinct && descents <= 1, `rotated/validation-exhaustive/${JSON.stringify(array)}`);
  }
  validate("exact_closed", Array(33).fill(0), 0, false, "input/too-many-cards");
  validate("exact_closed", [0, 1], 0.5, false, "input/fractional-target");
  validate("exact_closed", [Number.MAX_SAFE_INTEGER + 1], 0, false, "input/unsafe-integer");
}

function verifyGeneratedCases() {
  for (const mode of REQUIRED_MODES) {
    const cases = engine.generateCases(mode);
    check(Array.isArray(cases) && cases.length > 0, `${mode}: generateCases returns a nonempty array`);
    for (const [index, item] of cases.entries()) {
      const array = item.array ?? item.values ?? item.a;
      const target = item.target ?? null;
      check(Array.isArray(array), `${mode}/generated-${index}: case contains an array`);
      validate(mode, array, target, true, `${mode}/generated-${index}`);
      runCase(mode, array, target, `${mode}/generated-${index}`);
      stats.generatedCases += 1;
    }
  }
}

function verifyPython(corpora) {
  for (const mode of REQUIRED_MODES) {
    const source = engine.python(mode);
    check(typeof source === "string" && source.trim().length > 0, `${mode}: python returns source`);
    const compiled = spawnSync("python3", ["-c", "import sys; compile(sys.stdin.read(), '<engine>', 'exec')"], {
      input: source,
      encoding: "utf8",
    });
    equal(compiled.status, 0, `${mode}: generated Python compiles: ${compiled.stderr}`);
    const cases = corpora[mode];
    const call = mode === "first_true" || mode === "last_true"
      ? "search(case['a'])"
      : "search(case['a'], case['target'])";
    const runner = `${source}\n\nimport json, sys\ncases = json.loads(sys.stdin.read())\nprint(json.dumps([${call} for case in cases]))\n`;
    const executed = spawnSync("python3", ["-c", runner], {
      input: JSON.stringify(cases),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    equal(executed.status, 0, `${mode}: generated Python executes: ${executed.stderr}`);
    let results;
    try {
      results = JSON.parse(executed.stdout);
    } catch (error) {
      assert.fail(`${mode}: Python output is JSON: ${error.message}; output=${executed.stdout}`);
    }
    equal(results.length, cases.length, `${mode}: Python returns one result per case`);
    results.forEach((actual, index) => {
      const item = cases[index];
      check(resultMatches(mode, item.a, item.target, actual), `${mode}/python-${index}: ${actual} disagrees with linear oracle`);
    });
    stats.pythonPrograms += 1;
    stats.pythonCases += cases.length;
  }
}

function verifyGuardFeedback() {
  check(Array.isArray(engine.conditions) && engine.conditions.length >= 3, "conditions lists guard choices");
  for (const descriptor of engine.MODES) {
    for (const guard of engine.conditions) {
      const feedback = engine.guardFeedback(descriptor.id, guard);
      equal(feedback.ok, guard === descriptor.guard, `${descriptor.id}/${guard}: guard verdict`);
      check(typeof feedback.text === "string" && feedback.text.length > 20, `${descriptor.id}/${guard}: guard explanation`);
      if (guard !== descriptor.guard) {
        if (guard === "l > r") check(feedback.text.includes("[2, 4]"), `${descriptor.id}/${guard}: skipped-search counterexample`);
        else if (descriptor.guard === "l <= r") check(feedback.text.includes("[2]") && feedback.text.includes("l = r = 0"), `${descriptor.id}/${guard}: singleton counterexample`);
        else check(feedback.text.includes("[]") && feedback.text.includes("l = r"), `${descriptor.id}/${guard}: empty-input counterexample`);
      }
      stats.guardChecks += 1;
    }
  }
}

function verifyKnownWrongMoves(mode, array, target) {
  let state = engine.init(mode, array, target);
  while (engine.active(state)) {
    const expected = engine.expectedMove(state);
    for (const move of engine.MOVES.map((item) => item.id).filter((item) => item !== expected)) {
      const before = snapshot(state);
      const rejected = engine.applyMove(state, move);
      check(rejected.ok === false, `${mode}/${move}: known wrong move rejected`);
      equal(state, before, `${mode}/${move}: wrong move does not mutate caller state`);
      equal(rejected.state, before, `${mode}/${move}: wrong move returns unchanged state`);
      check(typeof rejected.reason === "string" && rejected.reason.length > 0, `${mode}/${move}: wrong move is explained`);
      check("counterexample" in rejected, `${mode}/${move}: wrong move includes counterexample field`);
      if (rejected.counterexample) {
        const example = rejected.counterexample;
        check(Array.isArray(example.a), `${mode}/${move}: counterexample contains array`);
        check(typeof example.reason === "string" && example.reason.length > 0, `${mode}/${move}: counterexample explains failure`);
        const exampleState = engine.init(mode, example.a, example.target);
        exampleState.l = example.l;
        exampleState.r = example.r;
        equal(engine.midpoint(exampleState), example.mid, `${mode}/${move}: counterexample midpoint is reproducible`);
        check(Boolean(engine.problemWith(exampleState, move)), `${mode}/${move}: counterexample reproduces a safety/progress failure`);
      }
      stats.knownWrongMoves += 1;
    }
    state = engine.applyMove(state, expected).state;
  }
}

function verifyCoincidentalWrongMoveFeedback() {
  for (const mode of REQUIRED_MODES) {
    let witness = null;
    for (const item of engine.generateCases(mode)) {
      let state = engine.init(mode, item.a, item.target);
      while (engine.active(state) && !witness) {
        for (const move of engine.MOVES.map((entry) => entry.id)) {
          if (move === engine.expectedMove(state)) continue;
          const rejected = engine.applyMove(state, move);
          if (rejected.reason.startsWith("This happens to preserve this example")) {
            witness = rejected;
            break;
          }
        }
        if (!witness) state = engine.applyMove(state, engine.expectedMove(state)).state;
      }
      if (witness) break;
    }
    check(witness !== null, `${mode}: has a coincidentally safe wrong-move teaching example`);
    check(witness.ok === false, `${mode}: coincidentally safe wrong move is still rejected`);
    check(Boolean(witness.counterexample), `${mode}: coincidentally safe wrong move includes a counterexample`);
    stats.coincidentalRejections += 1;
  }
}

verifySurface();

const corpora = Object.fromEntries(REQUIRED_MODES.map((id) => [id, []]));
const allSorted = sortedArrays(7, [-2, -1, 0, 1, 2]);
equal(allSorted.length, 792, "sorted exhaustive corpus size");
for (const mode of NUMERIC_MODES) {
  for (const array of allSorted) {
    for (let target = -3; target <= 3; target += 1) {
      corpora[mode].push({ a: array, target });
      runCase(mode, array, target, `${mode}/${JSON.stringify(array)}/t=${target}`);
    }
  }
}

for (let n = 0; n <= 7; n += 1) {
  for (let cut = 0; cut <= n; cut += 1) {
    const first = Array(cut).fill(false).concat(Array(n - cut).fill(true));
    const last = Array(cut).fill(true).concat(Array(n - cut).fill(false));
    corpora.first_true.push({ a: first, target: null });
    corpora.last_true.push({ a: last, target: null });
    runCase("first_true", first, null, `first_true/n=${n}/cut=${cut}`);
    runCase("last_true", last, null, `last_true/n=${n}/cut=${cut}`);
  }
}

const allRotated = rotatedArrays([-3, -2, -1, 0, 1, 2, 3]);
equal(allRotated.length, 449, "rotated exhaustive corpus size");
for (const array of allRotated) {
  for (let target = -4; target <= 4; target += 1) {
    corpora.rotated.push({ a: array, target });
    runCase("rotated", array, target, `rotated/${JSON.stringify(array)}/t=${target}`);
  }
}

verifyValidation();
verifyGeneratedCases();
verifyGuardFeedback();
verifyKnownWrongMoves("exact_closed", [1, 3, 5, 7], 4);
verifyKnownWrongMoves("exact_open", [1, 3, 5, 7], 4);
verifyKnownWrongMoves("lower", [1, 3, 3, 5], 3);
verifyKnownWrongMoves("upper", [1, 3, 3, 5], 3);
verifyKnownWrongMoves("first_occ", [1, 3, 3, 5], 3);
verifyKnownWrongMoves("last_occ", [1, 3, 3, 5], 3);
verifyKnownWrongMoves("last_le", [1, 3, 3, 5], 3);
verifyKnownWrongMoves("last_lt", [1, 3, 3, 5], 3);
verifyKnownWrongMoves("first_true", [false, false, true, true], null);
verifyKnownWrongMoves("last_true", [true, true, false, false], null);
verifyKnownWrongMoves("rotated", [5, 7, 1, 3], 2);
verifyCoincidentalWrongMoveFeedback();
verifyPython(corpora);

process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
