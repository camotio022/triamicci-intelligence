import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../data/triamicci-product-catalog-v2.proposal.json',import.meta.url)));
const by=id=>c.products.find(p=>p.id===id);
test('carnes recebidas prontas são materiais distintos',()=>{
 for(const id of ['alcatra-bife','alcatra-cubos','frango-file-120g']){
  assert.ok(by(id));assert.equal(by(id).type,'raw');assert.equal(by(id).source,'supplier');
  assert.equal(by(id).operationalUnit,'un');
  assert.deepEqual(by(id).countLocations,['reserva','giro']);
 }
 assert.equal(by('alcatra-bife').receivingUnit,'kg');
 assert.equal(by('alcatra-cubos').receivingUnit,'kg');
 assert.equal(by('frango-file-120g').receivingUnit,'un');
});
test('strogonoff respeita insumos preferenciais e alternativas e não baixa estoque',()=>{
 const meat=c.productionRules.find(r=>r.resultProductId==='strogonoff-carne');
 const chicken=c.productionRules.find(r=>r.resultProductId==='strogonoff-frango');
 assert.equal(meat.preferredInputId,'alcatra-cubos');
 assert.deepEqual(meat.alternativeInputIds,['alcatra-bife']);
 assert.equal(chicken.preferredInputId,'peito-frango');
 assert.deepEqual(chicken.alternativeInputIds,['frango-file-120g']);
 for(const rule of [meat,chicken]){assert.equal(rule.autoDeduct,false);assert.equal(rule.manualConfirmationRequired,true)}
});
