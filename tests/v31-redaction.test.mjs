import test from 'node:test';import assert from 'node:assert/strict';
import {redactFinancial} from '../server/permissions/v31-redaction.js';
test('remove financial fields recursively but preserve operational quantities',()=>{
 const source={id:'a',quantity:12,unit:'kg',cost:23,unitCost:9,price:40,profile:{countUnit:'kg',financialValue:90},orders:[{received:10,practicePayment:20}]};
 const x=redactFinancial(source);
 assert.equal(x.quantity,12);assert.equal(x.unit,'kg');assert.equal(x.orders[0].received,10);
 assert.equal(x.cost,undefined);assert.equal(x.unitCost,undefined);assert.equal(x.price,undefined);assert.equal(x.profile.financialValue,undefined);assert.equal(x.orders[0].practicePayment,undefined);
 assert.equal(source.cost,23);
});
