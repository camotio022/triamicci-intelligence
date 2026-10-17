import test from 'node:test';
import assert from 'node:assert/strict';
import {countUnit,validQuantity,reconcile} from '../api/operations/logic.js';

test('alcatra e filé de frango 120g são contados individualmente',()=>{
 for(const catalogId of ['alcatra-bife','alcatra-cubos','frango-file-120g']){
  assert.equal(countUnit({catalogId,unit:'kg'}),'un');
 }
 assert.equal(countUnit({catalogId:'peito-frango',unit:'kg'}),'kg');
});
test('unidades são indivisíveis, kg permitem até três decimais',()=>{
 assert.equal(validQuantity(2.5,{unit:'un'}),false);
 assert.equal(validQuantity(3,{unit:'un'}),true);
 assert.equal(validQuantity(0,{unit:'un',allowZero:true}),true);
 assert.equal(validQuantity(0,{unit:'un'}),false);
 assert.equal(validQuantity(1.2315,{unit:'kg'}),false);
 assert.equal(validQuantity(1.231,{unit:'kg'}),true);
 assert.equal(validQuantity(-1,{unit:'kg'}),false);
 assert.equal(validQuantity(Infinity,{unit:'kg'}),false);
});
test('saída física estimada soma todas as entradas desde última contagem',()=>{
 assert.equal(reconcile({previousTotal:25,currentTotal:17,entries:4,
  allUnitsCompatible:true,historyComplete:true}),12);
 assert.equal(reconcile({previousTotal:25,currentTotal:29,entries:4,
  allUnitsCompatible:true,historyComplete:true}),0);
});
test('não calcula quando unidades não batem ou histórico incompleto',()=>{
 const base={previousTotal:25,currentTotal:17,entries:4,allUnitsCompatible:true,historyComplete:true};
 assert.equal(reconcile({...base,allUnitsCompatible:false}),null);
 assert.equal(reconcile({...base,historyComplete:false}),null);
 assert.equal(reconcile({...base,previousTotal:null}),null);
});
