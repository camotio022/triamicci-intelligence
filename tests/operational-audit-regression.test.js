import test from 'node:test';
import assert from 'node:assert/strict';
import {receivingUnit,receivingLineError} from '../server/operations/receiving-input.js';
import {executionQuantity} from '../server/production/daily-task.js';
import {suggestedQuantity} from '../server/production/logic.js';
import {todayCountPage} from '../server/operations/today-count-page.js';
test('embalagem descritiva não vira unidade comercial; peso e unidades físicas são independentes',()=>{
 const profile={receivingPresentation:'Saco grande',countUnit:'un',controlMode:'quantitative',locations:['giro']};
 assert.equal(receivingUnit(profile),'un');
 assert.equal(receivingLineError({commercialQuantity:1,commercialUnit:'Saco grande',stockQuantity:1,location:'giro'},profile),'Informe uma quantidade válida e uma unidade de medida para a entrega.');
 assert.equal(receivingLineError({commercialQuantity:2.5,commercialUnit:'kg',stockQuantity:1,location:'giro'},profile),null);
 assert.match(receivingLineError({commercialQuantity:2.5,commercialUnit:'kg',stockQuantity:1,location:'reserva'},profile),/destino/);
 assert.match(receivingLineError({commercialQuantity:2.5,commercialUnit:'kg',stockQuantity:1.5,location:'giro'},profile),/física/);
});
test('execução respeita meta e restante; escala ingredientes conforme rendimento',()=>{
 const recipe={yieldQuantity:50};
 const quantity=executionQuantity({plannedQuantity:1},recipe);
 assert.equal(quantity,1);assert.equal(suggestedQuantity(50,quantity,50),1);
 assert.equal(executionQuantity({plannedQuantity:10,completedQuantity:4},recipe),6);
 assert.equal(executionQuantity({plannedQuantity:null},recipe),50);
});
function collection(docs){return {orderBy(field){assert.equal(field,'__name__');let after='';return {startAfter(id){after=id;return this},limit(limit){return {async get(){const selected=docs.filter(d=>d.id>after).slice(0,limit);return {docs:selected,size:selected.length}}}}}}}}
const doc=(id,date)=>({id,data:()=>({at:{toDate:()=>new Date(date)}})});
const range={start:new Date('2026-10-28T03:00:00Z'),end:new Date('2026-10-29T03:00:00Z')};
test('contagens do dia respeitam fuso e paginação sem índices compostos',async()=>{
 const docs=[doc('a','2026-10-28T02:59:59Z'),doc('b','2026-10-28T03:00:00Z'),doc('c','2026-10-29T02:59:59Z'),doc('d','2026-10-29T03:00:00Z')];
 const first=await todayCountPage(collection(docs),{...range,pageSize:1});assert.deepEqual(first.selected.map(d=>d.id),['b']);
 const second=await todayCountPage(collection(docs),{...range,before:first.nextCursor,pageSize:1});assert.deepEqual(second.selected.map(d=>d.id),['c']);
 const last=await todayCountPage(collection(docs),{...range,before:second.nextCursor});assert.equal(last.selected.length,0);assert.equal(last.nextCursor,null);
});
test('limite de leitura preserva cursor em página vazia para alcançar registros posteriores',async()=>{
 const docs=[doc('a','2026-10-27T12:00:00Z'),doc('b','2026-10-28T12:00:00Z')];
 const first=await todayCountPage(collection(docs),{...range,scanLimit:1});assert.equal(first.nextCursor,'a');assert.equal(first.selected.length,0);
 const next=await todayCountPage(collection(docs),{...range,before:first.nextCursor});assert.equal(next.selected[0].id,'b');
});
