import assert from 'node:assert/strict';
import {MODES,MOVES,init,active,midpoint,expectedMove,applyMove,result,generateCases,guardFeedback,validateInput} from '../dist/engine.js';
let completed=0,feedback=0;
for(const m of MODES)for(const c of generateCases(m.id)){
 let s=init(m.id,c.a,c.target),steps=0;
 assert(guardFeedback(m.id,m.guard).ok);
 for(const wrong of ['l < r','l <= r','l > r'].filter(g=>g!==m.guard)){const f=guardFeedback(m.id,wrong);assert(!f.ok&&f.text.length>30);feedback++}
 while(active(s)){
  assert(midpoint(s)>=0&&midpoint(s)<s.a.length);
  const before=JSON.stringify(s),good=expectedMove(s);
  for(const move of MOVES){const a=applyMove(s,move.id);assert.equal(a.ok,move.id===good);assert(a.reason.length>10);assert.equal(JSON.stringify(s),before);if(!a.ok)assert.equal(a.state,s);feedback++}
  s=applyMove(s,good).state;assert(++steps<=Math.ceil(Math.log2(c.a.length+1))+1);
 }
 assert(Number.isInteger(result(s)));const ended=applyMove(s,'left_plus');assert(!ended.ok);assert.equal(ended.state,s);completed++;
}
assert(validateInput('rotated',[2,2,1],1));assert(validateInput('first_true',[false,true,false],0));assert(validateInput('last_true',[true,false,true],0));assert(validateInput('lower',[3,2],2));assert(validateInput('lower',[Number.MAX_SAFE_INTEGER+1],1));
console.log(JSON.stringify({generatedCasesCompleted:completed,feedbackChecks:feedback,regressions:'passed'}));
