import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateInvestigation} from '../server/operations/investigation-rules.js';
const report={unit:'un',divergence:{kind:'UNEXPLAINED_DIFFERENCE',quantity:10}};
const item=(quantity,reason='loss')=>({quantity,reason,notes:'Conferência da supervisão'});
test('claims can explain part or all of a discrepancy, never more or fractional pieces',()=>{
 assert.equal(validateInvestigation(report,[item(4),item(6,'staff_meal')]),true);
 assert.equal(validateInvestigation(report,[item(4)]),true);
 assert.equal(validateInvestigation(report,[item(11)]),false);
 assert.equal(validateInvestigation(report,[item(0.5)]),false);
 assert.equal(validateInvestigation(report,[item(NaN)]),false);
 assert.equal(validateInvestigation(report,[item(2,'unknown')]),false);
});
test('surplus cannot be justified by loss',()=>{
 const surplus={unit:'kg',divergence:{kind:'POSITIVE_ADJUSTMENT',quantity:2}};
 assert.equal(validateInvestigation(surplus,[item(1,'loss')]),false);
 assert.equal(validateInvestigation(surplus,[item(1.5,'count_error')]),true);
});
