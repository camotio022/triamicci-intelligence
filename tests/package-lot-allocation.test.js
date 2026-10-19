import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLotAllocation} from '../server/operations/package-lot-allocation.js';
const lots=[{id:'a',unit:'kg',reserva:3,giro:2,expiryDate:'2026-11-01'},{id:'b',unit:'kg',reserva:2,giro:1,expiryDate:'2026-12-01'}];
test('explicit count allocation must match area total and lot identities',()=>{
 const r=validateLotAllocation({area:'giro',quantity:2.5,unit:'kg',allocations:[{id:'a',quantity:1.5},{id:'b',quantity:1}],lots});
 assert.equal(r.ok,true);assert.equal(r.stockEffect,'NONE');
});
test('refuses unidentified lots, duplicated entries and mismatch',()=>{
 const base={area:'giro',quantity:2,unit:'kg',lots};
 for(const allocations of [[{id:'z',quantity:2}],[{id:'a',quantity:1},{id:'a',quantity:1}],[{id:'a',quantity:1}]]){
  assert.equal(validateLotAllocation({...base,allocations}).ok,false);
 }
 assert.equal(validateLotAllocation({...base,unit:'un',allocations:[{id:'a',quantity:2}]}).ok,false);
});
