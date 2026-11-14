import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberRoute,recallRoute,selectInitialRoute} from '../src/pwa-resume.js';
const makeStore=()=>{const m=new Map();return {setItem:(key,value)=>m.set(key,value),getItem:key=>m.get(key)}};
const allowed=name=>['kitchen','production','assistant-ai'].includes(name);
test('installed app restores last allowed route for same user and unit only',()=>{
 const storage=makeStore();
 rememberRoute(storage,{uid:'user1',unitId:'barigui',page:'assistant-ai',scroll:380,at:1000});
 const saved=recallRoute(storage,{uid:'user1',unitId:'barigui',allowed,now:1500});
 assert.deepEqual(saved,{page:'assistant-ai',scroll:380});
 assert.equal(selectInitialRoute({params:new URLSearchParams(''),allowed,stored:saved,standalone:true,unitId:'barigui'}),'assistant-ai');
 assert.equal(selectInitialRoute({params:new URLSearchParams(''),allowed,stored:saved,standalone:false,unitId:'barigui'}),'kitchen');
 assert.equal(recallRoute(storage,{uid:'user2',unitId:'barigui',allowed,now:1500}),null);
 assert.equal(recallRoute(storage,{uid:'user1',unitId:'palladium',allowed,now:1500}),null);
});
test('explicit deep links override saved route and invalid routes fall back',()=>{
 const stored={page:'assistant-ai'};
 assert.equal(selectInitialRoute({params:new URLSearchParams('page=production'),allowed,stored,standalone:true,unitId:'barigui'}),'production');
 assert.equal(selectInitialRoute({params:new URLSearchParams('page=private'),allowed,stored,standalone:true,unitId:'barigui'}),'kitchen');
 assert.equal(selectInitialRoute({params:new URLSearchParams('pushUnit=other'),allowed,stored,standalone:true,unitId:'barigui'}),'kitchen');
});
test('expired and unauthorized stored pages are never restored',()=>{
 const storage=makeStore();
 rememberRoute(storage,{uid:'u',unitId:'b',page:'assistant-ai',at:0});
 assert.equal(recallRoute(storage,{uid:'u',unitId:'b',allowed,now:86400001}),null);
 rememberRoute(storage,{uid:'u',unitId:'b',page:'admin-only',at:1000});
 assert.equal(recallRoute(storage,{uid:'u',unitId:'b',allowed,now:2000}),null);
});
