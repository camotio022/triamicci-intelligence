import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuestion,summarizeTasks,summarizeStock,operationalContext} from '../server/ai/operational-context.js';
const doc=(id,data)=>({id,data:()=>data});
test('intent detects production and stock in pt-BR, avoiding unrelated requests',()=>{
 assert.deepEqual(classifyQuestion('Sugira uma organização para a produção'),{production:true,stock:false});
 assert.deepEqual(classifyQuestion('Como está o estoque?'),{production:false,stock:true});
 assert.deepEqual(classifyQuestion('Preciso comprar insumos para a produção'),{production:true,stock:true});
 assert.deepEqual(classifyQuestion('Oi'),{production:false,stock:false});
});
test('production summaries never invent quantities or personnel and mark partial data',()=>{
 const result=summarizeTasks([doc('x',{recipeId:'abc',recipeName:'Frango a passarinho',status:'pending',plannedQuantity:20})],
  [doc('abc',{name:'Frango a passarinho',lines:[{productId:'p'}]})],'2026-11-14',true);
 assert.equal(result.hasMore,true);
 assert.deepEqual(result.tasks,[{preparation:'Frango a passarinho',status:'pending',planned:20,completed:null,unit:'un',recipeKnown:true,ingredients:1}]);
});
test('physical stock missing or mismatched is unknown rather than zero',()=>{
 const result=summarizeStock([doc('a',{status:'active',name:'Tilápia',unit:'kg',minStock:3}),doc('b',{status:'active',name:'Frango',unit:'kg',minStock:2})],
  [doc('a',{total:0,unit:'kg'}),doc('b',{total:13,unit:'un'})]);
 assert.equal(result.items[0].quantity,0);
 assert.equal(result.items[1].quantity,null);
});
test('generic questions do not trigger firestore reads',async()=>{
 const context=await operationalContext({collection(){throw Error('unexpected read')}},'unit-a','Olá!');
 assert.equal(context.sections.length,0);
});
