import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiFetch} from '../src/api-fetch.js';
const request=(action,actor='Bearer person')=>['/api/operations/stock',{method:'POST',headers:{Authorization:actor,'Content-Type':'application/json'},body:JSON.stringify({action})}];
test('expensive stock reads reuse successful responses for a short interval',async()=>{
 let clock=1000,hits=0;const api=createApiFetch(async()=>new Response(JSON.stringify({seq:++hits}),{status:200}),{now:()=>clock,cacheMs:12000});
 assert.equal((await (await api(...request('storageList'))).json()).seq,1);
 assert.equal((await (await api(...request('storageList'))).json()).seq,1);
 assert.equal((await (await api(...request('v3Dashboard'))).json()).seq,2);
 assert.equal((await (await api(...request('v3Dashboard'))).json()).seq,2);
 assert.equal(hits,2);clock+=12001;
 assert.equal((await (await api(...request('storageList'))).json()).seq,3);
});
test('stock mutation invalidates stale cache',async()=>{
 let hits=0;const api=createApiFetch(async()=>new Response(JSON.stringify({seq:++hits})),{cacheMs:30000});
 await api(...request('storageList'));await api(...request('storageList'));assert.equal(hits,1);
 await api(...request('storageCount'));assert.equal(hits,2);
 assert.equal((await (await api(...request('storageList'))).json()).seq,3);
});
test('Firestore quota cooldown covers all new storage reads',async()=>{
 let clock=1000,hits=0;const api=createApiFetch(async()=>{hits++;return new Response(JSON.stringify(hits===1?{code:'DATA_QUOTA_EXHAUSTED'}:{ok:true}),{status:hits===1?503:200})},{now:()=>clock,cooldownMs:60000});
 assert.equal((await api(...request('storageList'))).status,503);
 const stopped=await api(...request('storageHistory'));
 assert.equal(stopped.status,503);assert.equal((await stopped.json()).code,'DATA_QUOTA_EXHAUSTED');
 assert.equal(hits,1);clock+=60001;
 assert.equal((await api(...request('storageHistory'))).status,200);assert.equal(hits,2);
});
test('503 on mutation protects subsequent reads',async()=>{
 let hits=0;const api=createApiFetch(async()=>{hits++;return new Response(JSON.stringify({code:'DATA_QUOTA_EXHAUSTED'}),{status:503})});
 assert.equal((await api(...request('storageCount'))).status,503);
 assert.equal((await api(...request('storageList'))).status,503);assert.equal(hits,1);
});
test('memory cache is isolated by bearer authorization and can be invalidated',async()=>{
 let hits=0;const api=createApiFetch(async()=>new Response(JSON.stringify({seq:++hits})));
 await api(...request('v3Alerts','Bearer a'));await api(...request('v3Alerts','Bearer b'));
 await api(...request('v3Alerts','Bearer a'));assert.equal(hits,2);
 api.clearCache();await api(...request('v3Alerts','Bearer a'));assert.equal(hits,3);
});

test('in-flight reads started before a mutation cannot repopulate cache',async()=>{
 let release;let hits=0;
 const api=createApiFetch(async(_url,init)=>{
  hits++;
  if(JSON.parse(init.body).action==='storageList'&&hits===1){
   await new Promise(resolve=>{release=resolve});
  }
  return new Response(JSON.stringify({seq:hits}),{status:200});
 },{cacheMs:30000});
 const old=api(...request('storageList'));
 await Promise.resolve();
 await api(...request('storageCount'));
 release();
 await old;
 const fresh=await api(...request('storageList'));
 assert.equal(fresh.status,200);
 assert.equal(hits,3);
});
