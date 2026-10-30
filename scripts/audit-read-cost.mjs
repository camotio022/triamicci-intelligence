// Read-only, synthetic diagnostics. Does not initialize or contact Firebase.
import {readdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {todayCountPage} from '../server/operations/today-count-page.js';
const names=(await readdir(new URL('../src/',import.meta.url))).filter(n=>/\.(jsx|js)$/.test(n));
const files=await Promise.all(names.map(async name=>({name,text:await readFile(new URL('../src/'+name,import.meta.url),'utf8')})));
const consumers=files.filter(f=>f.name!=='useUnitLive.js'&&/\buseUnitLive\(/.test(f.text)).map(f=>f.name).sort();
const metrics={sourceFiles:files.length,fetchSites:files.reduce((sum,f)=>sum+(f.text.match(/\bfetch\(/g)||[]).length,0),liveConsumers:consumers.length,consumers};
// Model the documents returned by Firestore, not just the rows visited by the loop.
function syntheticCollection(docs,counter,after=null,limit=Infinity){
 return {orderBy(){return this},startAfter(id){return syntheticCollection(docs,counter,id,limit)},limit(n){return syntheticCollection(docs,counter,after,n)},async get(){counter.calls++;const page=docs.filter(d=>!after||d.id>after).slice(0,limit);counter.returned+=page.length;return {docs:page,size:page.length}}};
}
const start=new Date('2026-10-29T03:00:00Z'),end=new Date('2026-10-30T03:00:00Z');
const docs=Array.from({length:56},(_,i)=>({id:String(i).padStart(40,'0'),data:()=>({at:new Date('2026-10-29T12:00:00Z')})}));
const counter={calls:0,returned:0};
const page=await todayCountPage(syntheticCollection(docs,counter),{start,end});
assert.equal(page.selected.length,12);assert.equal(counter.returned,12);
const audit={metrics,syntheticTodayCounts:{storedBalances:56,returnedDocuments:counter.returned,visibleRows:page.selected.length,queryCalls:counter.calls,note:'Actual helper with synthetic documents. Not production billing.'},limits:{productionReadAttribution:'unavailable',globalSavingsPercent:'not measured',productionRequests:0}};
console.log(JSON.stringify(audit,null,2));
