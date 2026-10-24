# Bisect — Keep the Answer Alive

An interactive binary-search learning game. Learn why a loop condition, equality branch, midpoint update and return contract work by keeping the answer inside the candidate region.

Play at **https://bisect.mingli.world**. The game is a static website with no account requirement, learner backend, analytics, paid API, external fonts or external assets. Practice progress stays in this browser under the localStorage key `bisect.learning.v1`.

## Explore

- Exact search with inclusive `[l, r]` and half-open `[l, r)` intervals.
- Lower bound (first ≥), upper bound (first >), last ≤ and last <.
- First and last occurrence, including absent targets and duplicates.
- Monotone predicates: first true and last true.
- Rotated distinct search, with a separate explanation of the duplicates/complexity caveat.
- Empty, one- and two-element inputs, endpoints, insertion sentinels `n` and `-1`, and custom arrays of up to 32 cards.

Choose the loop guard, propose a boundary move and choose the return index. Feedback explains unsafe discards and nontermination; the small-counterexample finder states its finite search scope. Correct moves use a separate Apply control. Python blanks, translations, traces and undo connect the visual reasoning to code. There is no default time pressure. Practice history does not certify mastery, and examples are not represented as employer interview questions.

## Run locally

Requirements: Node.js 22 or later and Python 3. No dependency installation is required.

```sh
npm run serve
```

Open http://127.0.0.1:5384. Source is in `dist/`: `engine.js` is the pure algorithm state machine and `app.js` owns the interface and browser-local progress.

## Verify

```sh
npm test
```

The regression suite covers 118 generated cases and 1,286 feedback checks. The independent exhaustive suite compares small sorted arrays, monotone predicates and distinct rotations against linear reference oracles, tests rejected moves and validation, and executes every Python translation. The reviewed corpus covers 48,583 state cases and 48,465 Python executions.

Desktop and mobile-emulated browser learning flows have been exercised. Physical-phone testing and completed touch-tap testing have not been verified. Local progress is specific to the browser/origin and is cleared when site storage is cleared.

## Deploy

Import this dedicated repository into Vercel with the Other preset. `vercel.json` serves `dist/` directly, with no install or build command. Only the five files in `dist/` need to be served. Tests, repository metadata and documentation are not production assets. See [Vercel static project configuration](https://vercel.com/docs/project-configuration/vercel-json).

For rollback, redeploy a previously verified commit or promote its existing Vercel deployment. Keep an existing working deployment available until its replacement has passed HTTPS, asset and gameplay checks. No authentication or server secrets are needed by the application.
