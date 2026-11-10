import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiFetch} from '../src/api-fetch.js';

const identity='person:unit';
const initial={protocolVersion:2,revision:'initial',domains:{stock:'0',catalog:'0',production:'0',notifications:'0'}};
const req=(path,action,extra={},init={})=>[path,{method:'POST',headers:{Authorization:'Bearer person'},body:JSON.stringify({action,...extra}),...init}];
function setup(){
 let clock=Date.parse('2026-11-10T12:00:00Z'),scope=identity+':manager:active',hits=0;
 const api=createApiFetch(async()=>new Response(JSON.stringify({seq:++hits})),{now:()=>clock,scope:()=>scope});
 const emit=data=>api.observeLive(identity,{connected:true,data});
 return {api,emit,hits:()=>hits,advance:ms=>{clock+=ms},scope:s=>{scope=s;api.resetScope()}};
}
test('98 navigations beyond 12 seconds reuse the confirmed live revision with a bounded maximum age',async()=>{
 const s=setup();s.emit(initial);
 for(let n=0;n<98;n++){
  await s.api(...req('/api/production/manage','list',{includeProducts:true}));
  await s.api(...req('/api/production/manage','dayList'));
  s.advance(30000);
 }
 assert.equal(s.hits(),20,'ten workspace loads and ten task loads over 49 minutes');
});
test('stock changes invalidate products and workspace without evicting tasks or notifications',async()=>{
 const s=setup();s.emit(initial);
 const requests=[req('/api/products/manage','list'),req('/api/production/manage','list',{includeProducts:true}),req('/api/production/manage','dayList'),req('/api/members/manage','notifications')];
 for(const r of requests)await s.api(...r);
 s.emit({...initial,revision:'stock1',domains:{...initial.domains,stock:'1'}});
 for(const r of requests)await s.api(...r);
 assert.equal(s.hits(),6);
 s.emit({...initial,revision:'production1',domains:{...initial.domains,stock:'1',production:'1'}});
 await s.api(...requests[2]);assert.equal(s.hits(),7,'tasks refresh on production changes');
});
test('metadata deliveries do not invalidate responses or extend their original maximum age',async()=>{
 const s=setup();s.emit(initial);const r=req('/api/products/manage','list');await s.api(...r);
 for(let n=0;n<10;n++){s.advance(30000);s.emit(initial)}
 await s.api(...r);assert.equal(s.hits(),2);
});
test('unrelated attendance revisions preserve operational cache',async()=>{
 const s=setup();s.emit(initial);const r=req('/api/products/manage','list');await s.api(...r);
 s.emit({...initial,revision:'attendance1',domains:{...initial.domains,attendance:'1'}});
 await s.api(...r);assert.equal(s.hits(),1);
});
test('legacy/global changes conservatively invalidate all affected snapshots',async()=>{
 const s=setup();s.emit(initial);const r=req('/api/products/manage','list');await s.api(...r);
 s.emit({...initial,allRevision:'global'});await s.api(...r);assert.equal(s.hits(),2);
 s.emit({revision:'legacy'});await s.api(...r);assert.equal(s.hits(),3);
 s.advance(12001);await s.api(...r);assert.equal(s.hits(),4,'legacy signals cannot enable extended reuse');
});
for(const failure of [{connected:false},{error:{code:'permission-denied'}}])test('connection loss/error removes extended reuse: '+JSON.stringify(failure),async()=>{
 const s=setup();s.emit(initial);const r=req('/api/products/manage','list');await s.api(...r);
 s.api.observeLive(identity,failure);await s.api(...r);assert.equal(s.hits(),2);
 s.advance(12001);await s.api(...r);assert.equal(s.hits(),3);
 s.emit(initial);await s.api(...r);assert.equal(s.hits(),4,'reconnection revalidates even unchanged revisions');
});
test('new scopes reject old listener deliveries and keep responses isolated',async()=>{
 const s=setup();s.emit(initial);const r=req('/api/products/manage','list');await s.api(...r);
 s.scope('person:other:manager:active');s.emit(initial);
 await s.api(...r);s.advance(12001);await s.api(...r);assert.equal(s.hits(),3);
});
test('explicit no-store refresh bypasses cache and next callers fetch a fresh snapshot',async()=>{
 const s=setup();s.emit(initial);const r=req('/api/products/manage','list');await s.api(...r);
 await s.api(...req('/api/products/manage','list',{}, {cache:'no-store'}));
 await s.api(...r);assert.equal(s.hits(),3);
});
test('day rollover cannot reuse yesterday tasks even with a connected listener',async()=>{
 let clock=Date.parse('2026-11-11T02:59:00Z'),hits=0;
 const api=createApiFetch(async()=>new Response(JSON.stringify({seq:++hits})),{now:()=>clock,scope:()=>identity+':manager:active'});
 api.observeLive(identity,{connected:true,data:initial});const r=req('/api/production/manage','dayList');
 await api(...r);clock+=61000;await api(...r);assert.equal(hits,2);
});
test('a response from an invalidated in-flight read cannot replace the new revision',async()=>{
 let release,hits=0;
 const api=createApiFetch(async()=>{const seq=++hits;if(seq===1)await new Promise(r=>release=r);return new Response(JSON.stringify({seq}))},{scope:()=>identity+':manager:active'});
 api.observeLive(identity,{connected:true,data:initial});const r=req('/api/products/manage','list');const old=api(...r);await Promise.resolve();
 api.observeLive(identity,{connected:true,data:{...initial,domains:{...initial.domains,stock:'new'}}});
 assert.equal((await (await api(...r)).json()).seq,2);release();await old;
 assert.equal((await (await api(...r)).json()).seq,2);assert.equal(hits,2);
});
for(const status of [200,500])test('reads during a '+status+' mutation cannot seed post-mutation cache',async()=>{
 let release,value=0,hits=0;
 const api=createApiFetch(async(_path,init)=>{
  hits++;
  if(JSON.parse(init.body).action==='storageCount'){await new Promise(r=>release=r);value=1;return new Response('{}',{status})}
  return new Response(JSON.stringify({value}));
 });
 const mutation=api(...req('/api/operations/stock','storageCount'));await Promise.resolve();
 assert.equal((await (await api(...req('/api/operations/stock','storageList'))).json()).value,0);
 release();await mutation;
 assert.equal((await (await api(...req('/api/operations/stock','storageList'))).json()).value,1);assert.equal(hits,3);
});
test('network failure completes mutation invalidation and preserves write errors',async()=>{
 let fail=true,hits=0;
 const api=createApiFetch(async(_path,init)=>{hits++;if(JSON.parse(init.body).action==='update'&&fail)throw Error('network');return new Response('{}')});
 const r=req('/api/products/manage','list');await api(...r);
 await assert.rejects(api(...req('/api/products/manage','update')),/network/);fail=false;
 await api(...r);assert.equal(hits,3);
});
