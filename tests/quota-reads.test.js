import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiFetch} from '../src/api-fetch.js';
import {createLiveHub,liveRevision,changedLiveDomains} from '../src/live-hub.js';
import {signalUnitChange} from '../server/live-signal.js';
import {isQuotaError,sendQuotaError} from '../server/quota-error.js';
import {todayCountPage} from '../server/operations/today-count-page.js';
const options=(action='list',token='user-a')=>({method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({action})});
const response=()=>new Response(JSON.stringify({products:[{id:'test'}]}),{headers:{'content-type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
test('parallel read callers share transport but each can consume its Response',async()=>{
 let calls=0;const pending=deferred();const fetcher=createApiFetch(async()=>{calls++;await pending.promise;return response()});
 const a=fetcher('/api/products/manage',options()),b=fetcher('/api/products/manage',options());assert.equal(calls,1);pending.resolve();
 const [r,s]=await Promise.all([a,b]);assert.deepEqual(await r.json(),await s.json());
 await fetcher('/api/products/manage',options());assert.equal(calls,2,'Settled responses are not reused as current balances');
});
test('account, context and payload isolate pending reads',async()=>{
 let calls=0,scope='barigui:admin';const pending=deferred();const fetcher=createApiFetch(async()=>{calls++;await pending.promise;return response()},{scope:()=>scope});
 const a=fetcher('/api/products/manage',options()),b=fetcher('/api/products/manage',options('list','user-b'));
 scope='other-unit:cook';const c=fetcher('/api/products/manage',options());assert.equal(calls,3);pending.resolve();await Promise.all([a,b,c]);
});
test('writes are never coalesced and break pending read reuse',async()=>{
 let calls=0;const pending=deferred();const fetcher=createApiFetch(async()=>{calls++;await pending.promise;return response()});
 const tasks=[fetcher('/api/products/manage',options()),fetcher('/api/products/manage',options('update')),fetcher('/api/products/manage',options('update')),fetcher('/api/products/manage',options())];
 assert.equal(calls,4);pending.resolve();await Promise.all(tasks);
});
test('quota pauses automatic reads for sixty seconds without caching an empty result',async()=>{
 let calls=0,clock=0;const fetcher=createApiFetch(async()=>{calls++;return new Response(JSON.stringify({code:'DATA_QUOTA_EXHAUSTED'}),{status:503})},{now:()=>clock});
 assert.equal((await fetcher('/api/products/manage',options())).status,503);
 assert.equal((await fetcher('/api/operations/stock',options())).status,503);assert.equal(calls,1);
 clock=60001;await fetcher('/api/products/manage',options());assert.equal(calls,2);
});
test('ordinary service errors do not create a quota cooldown',async()=>{
 let calls=0;const fetcher=createApiFetch(async()=>{calls++;return new Response('{}',{status:503})});
 await fetcher('/api/products/manage',options());await fetcher('/api/products/manage',options());assert.equal(calls,2);
});
test('shared hub uses one listener per account/unit and disposes after last consumer',()=>{
 let starts=0,stops=0;const emits=[];const hub=createLiveHub((unit,emit)=>{starts++;emits.push(emit);return()=>{stops++}}),a=[],b=[];
 const stopA=hub.subscribe('a:barigui','barigui',e=>a.push(e)),stopB=hub.subscribe('a:barigui','barigui',e=>b.push(e));
 assert.equal(starts,1);emits[0]({data:{revision:'r1'},connected:true});assert.equal(a.length,1);assert.equal(b.length,1);
 const stopOther=hub.subscribe('b:barigui','barigui',()=>{});assert.equal(starts,2);
 stopA();assert.equal(stops,0);stopB();assert.equal(stops,1);stopOther();assert.equal(stops,2);
});
test('domain merge preserves stock revision when another person clocks in',()=>{
 let data={};const tx={set(ref,next,options){assert.equal(options.merge,true);data={...data,...next,domains:{...data.domains,...next.domains}}}};
 const db={collection(){return {doc(){return {collection(){return {doc(){return {}}}}}}}}};
 signalUnitChange(tx,db,'barigui',['stock','catalog']);const stock=liveRevision(data,['stock']),attendance=liveRevision(data,['attendance']);
 signalUnitChange(tx,db,'barigui',['attendance']);assert.equal(liveRevision(data,['stock']),stock);assert.notEqual(liveRevision(data,['attendance']),attendance);
 signalUnitChange(tx,db,'barigui');assert.notEqual(liveRevision(data,['stock']),stock,'Unknown/global changes still invalidate all consumers');
 assert.throws(()=>signalUnitChange(tx,db,'other/path',['stock']),/INVALID_UNIT/);
});
test('legacy snapshots remain compatible and reconnect metadata alone does not alter revisions',()=>{
 assert.notEqual(liveRevision({revision:'a'},['stock']),liveRevision({revision:'b'},['stock']));
 const data={protocolVersion:2,domains:{stock:'s',attendance:'p'}};assert.equal(liveRevision(data,['stock']),liveRevision({...data,revision:'unrelated'},['stock']));
});
test('a shared page can refresh presence without rereading its roster and notices',()=>{
 const previous={protocolVersion:2,domains:{attendance:'old',team:'same',mural:'same'}};
 const next={protocolVersion:2,domains:{attendance:'new',team:'same',mural:'same'}};
 assert.deepEqual(changedLiveDomains(previous,next,['attendance','team','mural']),['attendance']);
 assert.equal(changedLiveDomains(previous,{...next,allRevision:'global'},['attendance']),null);
});
test('today page returns twelve documents for twelve matching balances without losing following rows',async()=>{
 const docs=Array.from({length:56},(_,i)=>({id:String(i).padStart(40,'0'),data:()=>({at:new Date('2026-10-29T12:00:00Z')})}));let returned=0;
 const collection={orderBy(){let after='';return {startAfter(id){after=id;return this},limit(limit){return {async get(){const page=docs.filter(d=>d.id>after).slice(0,limit);returned+=page.length;return {docs:page,size:page.length}}}}}}};
 const range={start:new Date('2026-10-29T03:00:00Z'),end:new Date('2026-10-30T03:00:00Z')};const seen=[];let before;
 do{const result=await todayCountPage(collection,{...range,before});seen.push(...result.selected.map(d=>d.id));before=result.nextCursor;if(seen.length===12)assert.equal(returned,12)}while(before);
 assert.equal(seen.length,56);assert.equal(new Set(seen).size,56);assert.equal(returned,56);
});
test('quota error is distinguished from authorization, ordinary failures and conflicts',()=>{
 assert.equal(isQuotaError({code:8}),true);assert.equal(isQuotaError({message:'8 RESOURCE_EXHAUSTED: Quota exceeded.'}),true);assert.equal(isQuotaError({code:7,message:'FORBIDDEN'}),false);
 let code,payload;const res={setHeader(){},status(c){code=c;return this},json(p){payload=p}};
 assert.equal(sendQuotaError(res,{code:8}),true);assert.equal(code,503);assert.equal(payload.code,'DATA_QUOTA_EXHAUSTED');assert.equal(sendQuotaError(res,Error('FORBIDDEN')),false);
});
