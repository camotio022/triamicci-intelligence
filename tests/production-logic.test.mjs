import test from 'node:test';
import assert from 'node:assert/strict';
import {validProductionSelection,suggestedQuantity} from '../server/production/logic.js';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
const recipe=[{productId:a,substitutes:[b]},{productId:c,substitutes:[]}];
test('permite somente substituições autorizadas na linha correta',()=>{
 assert.equal(validProductionSelection(recipe,[{productId:b,quantity:3},{productId:c,quantity:2}]),true);
 assert.equal(validProductionSelection(recipe,[{productId:c,quantity:3},{productId:b,quantity:2}]),false);
});
test('impede baixa parcial ou em duplicidade',()=>{
 assert.equal(validProductionSelection(recipe,[{productId:b,quantity:3}]),false);
 assert.equal(validProductionSelection(recipe,[{productId:b,quantity:3},{productId:b,quantity:2}]),false);
 assert.equal(validProductionSelection(recipe,[{productId:b,quantity:0},{productId:c,quantity:2}]),false);
});
test('quantidade sugerida não inventa frações de peças',()=>{
 assert.equal(suggestedQuantity(5,3,2,{individual:true}),8);
 assert.equal(suggestedQuantity(1.25,3,2),1.875);
 assert.equal(suggestedQuantity(1,2,0),null);
});
