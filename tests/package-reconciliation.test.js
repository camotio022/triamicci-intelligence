import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePackageCount} from '../server/operations/package-reconciliation.js';
const rule={presentation:'pacote',validated:true,fixed:true,contentQuantity:2,contentUnit:'kg'};
const base={presentation:'pacote',rule,profileVersion:3,stockUnit:'kg'};
test('contagem só reconciliável com conteúdo verificado e abertos medidos',()=>{
 assert.deepEqual(reconcilePackageCount({...base,closed:3,opened:1,openedMeasurements:[{quantity:0.7,unit:'kg'}]}),{ok:true,status:'READY_FOR_REVIEW',quantity:6.7,unit:'kg',profileVersion:3,requiresReview:true});
 assert.equal(reconcilePackageCount({...base,closed:3,opened:1}).status,'NEEDS_MEASUREMENT');
 assert.equal(reconcilePackageCount({...base,closed:3,opened:1,openedMeasurements:[{quantity:0,unit:'kg'}]}).status,'ZERO_REMAINDER_REQUIRES_CLOSURE');
});
test('não inventa conversão do peito variável nem de kg para un',()=>{
 assert.equal(reconcilePackageCount({...base,closed:2,opened:0,rule:{...rule,validated:false}}).status,'NEEDS_VERIFIED_CONVERSION');
 assert.equal(reconcilePackageCount({...base,closed:2,opened:0,stockUnit:'un'}).status,'NEEDS_VERIFIED_CONVERSION');
 assert.equal(reconcilePackageCount({...base,closed:0,opened:1,openedMeasurements:[{quantity:1,unit:'un'}]}).status,'INCOMPATIBLE_REMAINDER');
});
test('rejeita medições incompletas ou valores não confiáveis',()=>{
 assert.equal(reconcilePackageCount({...base,closed:2.2}).status,'INVALID_INPUT');
 assert.equal(reconcilePackageCount({...base,closed:2,opened:1,openedMeasurements:[{quantity:NaN,unit:'kg'}]}).status,'INVALID_MEASUREMENTS');
});
