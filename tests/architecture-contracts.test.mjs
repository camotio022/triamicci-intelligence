import test from 'node:test';import assert from 'node:assert/strict';
import {createJsonClient,ApiError} from '../src/json-client.js';
import {hasArchiveStock} from '../server/operations/stock-scope.js';
import {restaurantDay as sharedDay} from '../shared/operation-day.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import {unitDay} from '../server/schedules/temporal-policy.js';
const snap=data=>({exists:data!==undefined,data:()=>data}),missing=snap();
test('one calendar handles UTC/BRT midnight, invalid dates and all public aliases',()=>{
 assert.equal(restaurantDay,sharedDay);assert.equal(unitDay,sharedDay);
 assert.equal(sharedDay('2026-11-10T01:00:00Z'),'2026-11-09');assert.equal(sharedDay('2026-11-10T03:00:00Z'),'2026-11-10');assert.throws(()=>sharedDay('not a date'),/INVALID_DATE/);
});
test('archive checks legacy fallback, current precedence and independent storage without adding balances',()=>{
 assert.equal(hasArchiveStock({quantity:0},missing,snap({total:5}),missing),true);
 assert.equal(hasArchiveStock({quantity:0},snap({total:0}),snap({total:5}),missing),false);
 assert.equal(hasArchiveStock({quantity:0},snap({total:0}),missing,snap({total:7,byStorage:{one:7}})),true);
 assert.equal(hasArchiveStock({quantity:0},snap({total:0,reserve:0,rotation:0}),missing,snap({total:0,byStorage:{one:0}})),false);
});
test('unknown and inconsistent existing balances cannot be archived as zero',()=>{
 for(const b of [{},{total:NaN},{total:-1},{total:0,byStorage:{one:2}},{total:0,reserve:-2},{total:'0'}])assert.equal(hasArchiveStock({quantity:0},snap(b),missing,missing),true);
 assert.equal(hasArchiveStock({quantity:NaN},missing,missing,missing),true);
});
test('shared client acquires fresh identity/token per call and preserves payload',async()=>{
 let calls=0;const seen=[];const request=createJsonClient({getUser:()=>({getIdToken:async()=> 'token'+(++calls)}),fetcher:async(path,init)=>{seen.push({path,init});return new Response(JSON.stringify({ok:true}))}});
 await request('/api/products/manage',{action:'list'});await request('/api/products/manage',{action:'update',quantity:2});
 assert.equal(seen[0].init.headers.Authorization,'Bearer token1');assert.equal(seen[1].init.headers.Authorization,'Bearer token2');assert.deepEqual(JSON.parse(seen[1].init.body),{action:'update',quantity:2});
});
test('shared client never sends unauthenticated requests or retries mutations',async()=>{
 let hits=0;const missingUser=createJsonClient({getUser:()=>null,fetcher:async()=>{hits++}});await assert.rejects(missingUser('/api/x',{action:'list'}),e=>e.status===401);assert.equal(hits,0);
 const request=createJsonClient({getUser:()=>({getIdToken:async()=> 'token'}),fetcher:async()=>{hits++;throw Error('network')}});await assert.rejects(request('/api/x',{action:'save'}),/network/);assert.equal(hits,1);
});
test('shared errors preserve API details/status/code and safe fallback for invalid JSON',async()=>{
 const user=()=>({getIdToken:async()=> 'token'});
 const request=createJsonClient({getUser:user,fetcher:async()=>new Response(JSON.stringify({code:'STALE',message:'Outdated',issues:['Review unit']}),{status:409})});
 await assert.rejects(request('/api/x',{}, {formatError:d=>[d.message,...d.issues].join(' · ')}),e=>e instanceof ApiError&&e.status===409&&e.code==='STALE'&&e.message==='Outdated · Review unit'&&e.data.issues.length===1);
 const invalid=createJsonClient({getUser:user,fetcher:async()=>new Response('not json',{status:503})});await assert.rejects(invalid('/api/x',{}, {errorMessage:'Unavailable'}),e=>e.status===503&&e.message==='Unavailable');
});
