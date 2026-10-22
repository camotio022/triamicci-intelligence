import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageTimeline} from '../server/schedules/coverage-timeline.js';
import {intervalFromBalance,reportFromSnapshot} from '../server/operations/inventory-summary.js';
import {transformationPreview} from '../server/production/transformation.js';
const date='2026-10-25',entries=[{uid:'a',date,type:'work'},{uid:'b',date,type:'work'}];
const person=(uid,start,end,breakStart,breakEnd)=>({uid,status:'active',professional:{sector:'cozinha',certifications:['chapa'],availability:[{day:'dom',start,end,breakStart,breakEnd}]}});
test('coverage sweeps actual Sunday hours, pauses and certified skills',()=>{
 const people=[person('a','10:00','18:00','12:00','13:00'),person('b','13:00','20:00')];
 const rows=coverageTimeline({date,entries,people,requirements:[{weekday:0,sector:'cozinha',skill:'chapa',start:'11:00',end:'14:00',minimum:1}]});
 assert.deepEqual(rows.map(r=>[r.start,r.end,r.covered,r.deficit]),[['11:00','12:00',1,0],['12:00','13:00',0,1],['13:00','14:00',2,0]]);
 people[1].professional.certifications=[];
 assert.equal(coverageTimeline({date,entries,people,requirements:[{weekday:0,sector:'cozinha',skill:'chapa',start:'13:00',end:'14:00',minimum:2}]})[0].deficit,1);
});
test('overnight coverage accounts for the actual pause after midnight',()=>{
 const rows=coverageTimeline({date,entries,people:[person('a','20:00','04:00','00:00','01:00')],requirements:[{weekday:0,sector:'cozinha',start:'22:00',end:'03:00',minimum:1}]});
 assert.deepEqual(rows.map(r=>[r.start,r.end,r.deficit]),[['22:00','00:00',0],['00:00','01:00',1],['01:00','03:00',0]]);
});
test('inventory summary is based on count snapshots and recorded movements without inventing a latest receipt',()=>{
 const previousAt='2026-10-21T12:00:00Z',at='2026-10-22T12:00:00Z';
 const balance={countId:'previous',at:previousAt,unit:'kg',countedReserve:10,countedRotation:2,entriesSinceCount:4,exitsSinceCount:3};
 const inventorySummary=intervalFromBalance(balance);
 assert.equal(intervalFromBalance({...balance,at:null}),null);
 const report=reportFromSnapshot({id:'now',data:()=>({unit:'kg',at,reserve:10,rotation:3,inventorySummary})},'product','Molho');
 assert.equal(report.divergence,null);assert.equal(report.entriesTotal,4);assert.equal(report.recordedOutflows,3);assert.equal(report.latestEntry,null);
});
test('decimal outputs retain recipe ratio and ingredient location',()=>{
 const a='a'.repeat(40),b='b'.repeat(40);
 const result=transformationPreview({outputProductId:b,outputUnit:'kg',yieldQuantity:2.5,lines:[{productId:a,quantity:1.25,location:'giro'}]},1.5,{[a]:'kg'});
 assert.equal(result.valid,true);assert.equal(result.inputs[0].quantity,.75);assert.equal(result.inputs[0].location,'giro');
});
