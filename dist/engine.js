// Pure transition engine. UI, model tests and Python translations share contracts.
export const MODES = [
 {id:'exact_closed',name:'Find an exact match',group:'01 · Foundations',tag:'Inclusive [l, r]',kind:'exact',contract:'Return an index whose value equals the target, or −1 if absent. Any matching index is valid.',why:'Both endpoints are untested cards. A single remaining card still needs to be checked.',guard:'l <= r',range:'closed',returnText:'mid on equality; −1 after exhaustion'},
 {id:'exact_open',name:'Change the interval',group:'01 · Foundations',tag:'Half-open [l, r)',kind:'exact',contract:'Return any matching index, or −1. r is the first excluded index, so r may equal n.',why:'When l equals r there are no untested cards. After a failed comparison, mid has been tested and may be excluded.',guard:'l < r',range:'open',returnText:'mid on equality; −1 after exhaustion'},
 {id:'lower',name:'First ≥ target',group:'02 · Boundaries',tag:'Lower bound',kind:'first',contract:'Return the first index with a[i] ≥ target. Return n when no element qualifies. This is an insertion position.',why:'Equality qualifies, but an earlier card might also qualify. Keep mid as a possible boundary and search left.',guard:'l < r',range:'cut',returnText:'l (also r) · n is valid'},
 {id:'upper',name:'First > target',group:'02 · Boundaries',tag:'Upper bound',kind:'first',contract:'Return the first index with a[i] > target. Return n when no element qualifies.',why:'Equality does not qualify. All cards through mid are too small or equal, so discard them.',guard:'l < r',range:'cut',returnText:'l (also r) · n is valid'},
 {id:'last_le',name:'Last ≤ target',group:'02 · Boundaries',tag:'Last qualifying index',kind:'last',contract:'Return the last index with a[i] ≤ target, or −1 when none qualifies.',why:'Equality qualifies, but a later card may qualify too. Keep mid as a possible answer and search right.',guard:'l < r',range:'answer',returnText:'r (also l) · −1 is valid'},
 {id:'last_lt',name:'Last < target',group:'02 · Boundaries',tag:'Strict comparison',kind:'last',contract:'Return the last index with a[i] < target, or −1 when none qualifies.',why:'Equality does not qualify. Mid and all later cards are too large, so exclude mid.',guard:'l < r',range:'answer',returnText:'r (also l) · −1 is valid'},
 {id:'first_occ',name:'First occurrence',group:'03 · Repeated values',tag:'Lower bound + check',kind:'first',contract:'Return the first index equal to the target, or −1 if absent. First find the ≥ boundary, then check equality.',why:'A lower bound is only an insertion point. It could point to a larger value, or to n; validate before indexing.',guard:'l < r',range:'cut',returnText:'l if l < n and a[l] == target, else −1'},
 {id:'last_occ',name:'Last occurrence',group:'03 · Repeated values',tag:'Upper bound − 1 + check',kind:'first',contract:'Return the last index equal to the target, or −1 if absent. Find the > boundary, then inspect the previous index.',why:'The position before the upper bound is the last ≤ target. It still needs an equality check to be a match.',guard:'l < r',range:'cut',returnText:'l − 1 if valid and equal, else −1'},
 {id:'first_true',name:'First true',group:'04 · Beyond numbers',tag:'False → true',kind:'first',predicate:true,contract:'For a false…true monotone predicate, return the first true index or n if all are false.',why:'The comparison is only a predicate. False proves the answer is later; true keeps mid as a possible first true.',guard:'l < r',range:'cut',returnText:'l (also r) · n means no true'},
 {id:'last_true',name:'Last true',group:'04 · Beyond numbers',tag:'True → false',kind:'last',predicate:true,contract:'For a true…false monotone predicate, return the last true index or −1 if all are false.',why:'Retaining mid on the left requires an upper midpoint. On two answer positions, a lower midpoint could leave l unchanged.',guard:'l < r',range:'answer',returnText:'r (also l) · −1 means no true'},
 {id:'rotated',name:'Search a rotated array',group:'04 · Beyond numbers',tag:'Distinct values only',kind:'rotated',contract:'Return the target index or −1 in a rotation of a strictly increasing array. Values must be distinct.',why:'At least one half is sorted. Check whether the target lies inside that half before choosing which half to keep.',guard:'l <= r',range:'closed',returnText:'mid on equality; −1 after exhaustion'}
];
export const mode = id => { const m=MODES.find(m=>m.id===id);if(!m)throw new Error('Unknown lesson.');return m; };
export const conditions = ['l < r','l <= r','l > r'];
export const MOVES = [
 {id:'left_plus',label:'l = mid + 1',hint:'Discard mid and everything left'},
 {id:'right_minus',label:'r = mid − 1',hint:'Discard mid and everything right'},
 {id:'right_mid',label:'r = mid',hint:'Move the right boundary to mid'},
 {id:'left_mid',label:'l = mid',hint:'Keep mid; move the left boundary'},
 {id:'found',label:'return mid',hint:'Declare this matching index'}
];
export function validateInput(id,a,target=0) {
 if(!MODES.some(m=>m.id===id))return 'Unknown lesson.';
 const m=mode(id);
 if(!Array.isArray(a)||a.length>32)return 'Use at most 32 cards.';
 if(m.predicate){
  if(a.some(v=>typeof v!=='boolean'))return 'Use true/false (or T/F) cards.';
  const nums=a.map(Number);
  if(nums.some((v,i)=>i>0&&(id==='first_true'?v<nums[i-1]:v>nums[i-1])))return id==='first_true'?'First true needs false values followed by true values.':'Last true needs true values followed by false values.';
 }else{
  if(a.some(v=>!Number.isSafeInteger(v))||!Number.isSafeInteger(target))return 'Use safe whole numbers for cards and target.';
  if(id==='rotated'){
   if(new Set(a).size!==a.length)return 'This lesson requires distinct values. See the duplicates caveat for why.';
   let descents=0;for(let i=0;i<a.length;i++)if(a[i]>a[(i+1)%a.length])descents++;
   if(descents>1)return 'Use a rotation of a strictly increasing array (at most one circular descent).';
  }else if(a.some((v,i)=>i>0&&v<a[i-1]))return 'Keep the cards sorted in nondecreasing order; repeats are allowed.';
 }
 return null;
}
export function init(id,a,target=0){
 const error=validateInput(id,a,target);if(error)throw new Error(error);
 const m=mode(id);return {id:m.id,a:[...a],target,l:m.kind==='last'?-1:0,r:['closed','answer'].includes(m.range)?a.length-1:a.length,found:null,steps:0};
}
export function active(s){return s.found===null&&(mode(s.id).guard==='l <= r'?s.l<=s.r:s.l<s.r)}
export function midpoint(s){return Math.floor(s.l+(s.r-s.l+(mode(s.id).kind==='last'?1:0))/2)}
export function qualifies(s,v){if(mode(s.id).predicate)return v;return ['upper','last_occ'].includes(s.id)?v>s.target:s.id==='last_lt'?v<s.target:s.id==='last_le'?v<=s.target:v>=s.target}
export function relation(s){const v=s.a[midpoint(s)];return mode(s.id).predicate?(v?'true':'false'):v<s.target?'less':v>s.target?'greater':'equal'}
export function expectedMove(s){
 if(!active(s))return null;const m=mode(s.id),mid=midpoint(s),v=s.a[mid];
 if(m.kind==='first')return qualifies(s,v)?'right_mid':'left_plus';
 if(m.kind==='last')return qualifies(s,v)?'left_mid':'right_minus';
 if(v===s.target)return 'found';
 if(m.kind==='rotated'){
  if(s.a[s.l]<=v)return s.a[s.l]<=s.target&&s.target<v?'right_minus':'left_plus';
  return v<s.target&&s.target<=s.a[s.r]?'left_plus':'right_minus';
 }
 return v<s.target?'left_plus':m.range==='closed'?'right_minus':'right_mid';
}
export function rawMove(s,move){
 const n={...s,a:[...s.a],steps:s.steps+1},mid=midpoint(s);
 if(move==='left_plus')n.l=mid+1;else if(move==='left_mid')n.l=mid;else if(move==='right_minus')n.r=mid-1;else if(move==='right_mid')n.r=mid;else if(move==='found')n.found=mid;return n;
}
export function cutOracle(s){const i=s.a.findIndex(v=>qualifies(s,v));return i<0?s.a.length:i}
export function oracle(id,a,target){
 const m=mode(id);if(m.kind==='exact'||m.kind==='rotated')return a.indexOf(target);
 if(m.kind==='last'){for(let i=a.length-1;i>=0;i--)if(qualifies({id,target},a[i]))return i;return -1}
 const cut=cutOracle({id,a,target});if(id==='first_occ')return cut<a.length&&a[cut]===target?cut:-1;
 if(id==='last_occ')return cut>0&&a[cut-1]===target?cut-1:-1;return cut;
}
export function result(s){
 if(active(s))return null;const m=mode(s.id);
 if(m.kind==='exact'||m.kind==='rotated')return s.found??-1;
 if(m.kind==='last')return s.r;
 if(s.id==='first_occ')return s.l<s.a.length&&s.a[s.l]===s.target?s.l:-1;
 if(s.id==='last_occ')return s.l>0&&s.a[s.l-1]===s.target?s.l-1:-1;
 return s.l;
}
export function invariant(s){
 const m=mode(s.id);if(s.found!==null)return s.a[s.found]===s.target&&(m.kind==='exact'||m.kind==='rotated');
 if(m.kind==='first'){const cut=cutOracle(s);return s.l<=cut&&cut<=s.r&&s.l>=0&&s.r<=s.a.length}
 if(m.kind==='last'){const ans=oracle(s.id,s.a,s.target);return s.l<=ans&&ans<=s.r&&s.l>=-1&&s.r<s.a.length}
 const hits=s.a.flatMap((v,i)=>v===s.target?[i]:[]);return !hits.length||hits.some(i=>i>=s.l&&(m.range==='open'?i<s.r:i<=s.r));
}
export function problemWith(s,move){
 const n=rawMove(s,move);
 if(move==='found'){
  if(!['exact','rotated'].includes(mode(s.id).kind))return 'A qualifying mid is not proof that it is the first or last. This boundary search must finish narrowing.';
  if(s.a[midpoint(s)]!==s.target)return 'mid does not equal the target.';
 }
 if(!invariant(n))return 'This discards a possible answer (or the boundary needed for the final check).';
 if(n.found===null&&n.r-n.l>=s.r-s.l)return 'The interval does not shrink. Repeating this move can loop forever.';
 return null;
}
export function explainMove(s){
 const m=mode(s.id),mid=midpoint(s),v=s.a[mid],move=expectedMove(s);
 if(m.kind==='rotated'){
  if(move==='found')return `a[${mid}] equals ${s.target}; this contract accepts any exact match.`;
  const leftSorted=s.a[s.l]<=v;
  return `${leftSorted?'The left half is sorted':'The right half is sorted'}. ${leftSorted?`${s.a[s.l]} ≤ target < ${v}`:`${v} < target ≤ ${s.a[s.r]}`} is ${leftSorted?(s.a[s.l]<=s.target&&s.target<v?'true':'false'):(v<s.target&&s.target<=s.a[s.r]?'true':'false')}. ${move==='right_minus'?'Keep the left side':'Keep the right side'}; mid is not a match.`;
 }
 if(m.kind==='exact')return move==='found'?`Equality proves an exact match. Return index ${mid}.`:move==='left_plus'?`a[mid] is below the target. Sorted order proves every card through mid is too small.`:`a[mid] is above the target. Sorted order proves mid and every later card is too large. ${m.range==='open'?'Setting r = mid excludes mid because r is exclusive.':'Setting r = mid − 1 excludes mid because r is inclusive.'}`;
 const yes=qualifies(s,v);
 if(m.kind==='first')return yes?'mid qualifies, but the first qualifying position could be earlier. r = mid retains mid as a possible boundary, even though it is excluded from the next scan.':'mid does not qualify. Sorted/monotone order rules out every position through mid, so l = mid + 1.';
 return yes?'mid qualifies. A later position could also qualify, so l = mid keeps this candidate. The upper midpoint makes progress.':'mid does not qualify, and neither can any later position. r = mid − 1 excludes them all.';
}
export function applyMove(s,move){
 if(!active(s))return {ok:false,state:s,reason:'This search has stopped. Check the return value or start another case.'};
 if(!MOVES.some(m=>m.id===move))return {ok:false,state:s,reason:'Choose one of the displayed moves.'};
 if(move!==expectedMove(s))return {ok:false,state:s,reason:problemWith(s,move)||'This happens to preserve this example, but it does not implement the chosen contract for every input.',counterexample:smallestCounterexample(s.id,move,relation(s))};
 return {ok:true,state:rawMove(s,move),reason:explainMove(s)};
}
function* arrays(n,values,min=0,p=[]){if(!n){yield p;return}for(let i=min;i<values.length;i++)yield* arrays(n-1,values,i,[...p,values[i]])}
export function smallestCounterexample(id,move,branch){
 const m=mode(id);
 for(let n=1;n<=4;n++){
  let inputs=[];
  if(m.predicate){for(let k=0;k<=n;k++)inputs.push(Array.from({length:n},(_,i)=>id==='first_true'?i>=k:i<k))}
  else if(id==='rotated'){const a=Array.from({length:n},(_,i)=>i);for(let k=0;k<n;k++)inputs.push([...a.slice(k),...a.slice(0,k)])}
  else inputs=[...arrays(n,[0,1,2])];
  for(const a of inputs)for(const target of m.predicate?[0]:[-1,0,1,2,3,4]){
   let s=init(id,a,target);
   while(active(s)){
    if(relation(s)===branch&&expectedMove(s)!==move){const reason=problemWith(s,move);if(reason)return {a,target,l:s.l,r:s.r,mid:midpoint(s),reason,scope:'Smallest by length among arrays of 0…2 (distinct rotations use 0…n−1), through length 4, on the same comparison branch.'}}
    s=rawMove(s,expectedMove(s));
   }
  }
 }
 return null;
}
export function guardFeedback(id,chosen){
 const m=mode(id);if(chosen===m.guard)return {ok:true,text:m.why};
 if(chosen==='l > r')return {ok:false,text:'On [2, 4], the initial left endpoint is below the right one. This guard skips the entire search.'};
 if(m.guard==='l <= r')return {ok:false,text:'Smallest counterexample: [2], target 2. l = r = 0 still contains one untested card. l < r would skip the match.'};
 return {ok:false,text:m.kind==='last'?'Smallest counterexample: []. l = r = −1 is already the sentinel answer. l <= r tries to inspect a non-card and cannot shrink.':'Smallest counterexample: []. l = r = 0 means no untested cards. l <= r tries a[0], which does not exist. For a boundary search, l = r already identifies the answer position.'};
}
export function generateCases(id){
 const m=mode(id);if(m.predicate)return [{name:'A transition',a:id==='first_true'?[false,false,false,true,true,true]:[true,true,true,true,false,false],target:0},{name:'Empty',a:[],target:0},{name:'One true',a:[true],target:0},{name:'One false',a:[false],target:0},{name:'Two cards',a:id==='first_true'?[false,true]:[true,false],target:0},{name:'All true',a:[true,true,true,true],target:0},{name:'All false',a:[false,false,false,false],target:0}];
 if(id==='rotated')return [{name:'Across the pivot',a:[8,11,14,1,3,5,6],target:3},{name:'Empty',a:[],target:5},{name:'One match',a:[3],target:3},{name:'Two rotated',a:[4,1],target:1},{name:'Absent',a:[6,9,1,3],target:5},{name:'First endpoint',a:[6,9,1,3],target:6},{name:'Last endpoint',a:[6,9,1,3],target:3},{name:'Unrotated',a:[1,3,6,9],target:6}];
 return [{name:'The first crossing',a:[2,4,7,9,12,15,18],target:m.kind==='exact'?12:9},{name:'Empty',a:[],target:3},{name:'One match',a:[3],target:3},{name:'One miss',a:[3],target:4},{name:'Two cards',a:[2,5],target:5},{name:'Repeated target',a:[1,3,3,3,6,8],target:3},{name:'All equal',a:[4,4,4,4],target:4},{name:'Absent between',a:[2,4,8,10],target:6},{name:'Below everything',a:[2,4,8],target:0},{name:'Above everything',a:[2,4,8],target:10},{name:'First endpoint',a:[2,4,8],target:2},{name:'Last endpoint',a:[2,4,8],target:8}];
}
export function python(id){
 const m=mode(id),pred=m.predicate;const start=`def search(${pred?'p':'a, target'}):\n    n = len(${pred?'p':'a'})\n`;
 if(m.kind==='exact')return start+`    l, r = 0, ${m.range==='closed'?'n - 1':'n'}\n    while ${m.guard}:\n        mid = l + (r - l) // 2\n        if a[mid] == target:\n            return mid\n        if a[mid] < target:\n            l = mid + 1\n        else:\n            r = ${m.range==='closed'?'mid - 1':'mid'}\n    return -1`;
 if(m.kind==='rotated')return start+`    l, r = 0, n - 1\n    while l <= r:\n        mid = l + (r - l) // 2\n        if a[mid] == target:\n            return mid\n        if a[l] <= a[mid]:\n            if a[l] <= target < a[mid]:\n                r = mid - 1\n            else:\n                l = mid + 1\n        else:\n            if a[mid] < target <= a[r]:\n                l = mid + 1\n            else:\n                r = mid - 1\n    return -1`;
 if(m.kind==='last')return start+`    l, r = -1, n - 1\n    while l < r:\n        mid = l + (r - l + 1) // 2\n        if ${pred?'p[mid]':`a[mid] ${id==='last_le'?'<=':'<'} target`}:\n            l = mid\n        else:\n            r = mid - 1\n    return r`;
 return start+`    l, r = 0, n\n    while l < r:\n        mid = l + (r - l) // 2\n        if ${pred?'p[mid]':`a[mid] ${['upper','last_occ'].includes(id)?'>':'>='} target`}:\n            r = mid\n        else:\n            l = mid + 1\n`+(id==='first_occ'?'    return l if l < n and a[l] == target else -1':id==='last_occ'?'    i = l - 1\n    return i if i >= 0 and a[i] == target else -1':'    return l');
}
