import test from 'node:test';
import assert from 'node:assert/strict';
import {planPackageAdjustment} from '../server/operations/package-adjustment-plan.js';
const balance={unit:'kg',reserve:5,rotation:3,total:8};
const lots=[{id:'a',unit:'kg',reserva:2,giro:2},{id:'b',unit:'kg',reserva:3,giro:1}];
test('planned adjustment preserves other area and reconciles both lot totals',()=>{
 const r=planPackageAdjustment({balance,area:'giro',quantity:2.5,unit:'kg',lots,allocation:[{id:'a',quantity:1.5},{id:'b',quantity:1}]});
 assert.equal(r.ok,true);assert.equal(r.after.reserve,5);assert.equal(r.after.rotation,2.5);assert.equal(r.after.total,7.5);
 assert.equal(r.lotUpdates[0].reserva,2);assert.equal(r.lotUpdates[1].availableQuantity,4);
});
test('rejects mismatched lots, negative quantities and fractional unit count',()=>{
 assert.equal(planPackageAdjustment({balance,area:'giro',quantity:2.5,unit:'kg',lots,allocation:[{id:'a',quantity:2}]}).ok,false);
 assert.equal(planPackageAdjustment({balance,area:'giro',quantity:-1,unit:'kg'}).ok,false);
 assert.equal(planPackageAdjustment({balance:{unit:'un',reserve:2,rotation:2,total:4},area:'reserva',quantity:1.5,unit:'un'}).ok,false);
 assert.equal(planPackageAdjustment({balance:{...balance,total:9},area:'giro',quantity:2,unit:'kg'}).ok,false);
});
