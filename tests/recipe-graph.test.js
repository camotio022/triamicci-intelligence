import {test} from 'node:test';import assert from 'node:assert/strict';import {hasRecipeCycle} from '../server/production/recipe-graph.js';
test('intermediate preparations may chain, but direct and indirect recipe cycles are rejected',()=>{
 const recipe=(out,input)=>({outputProductId:out,lines:[{productId:input}]});
 assert.equal(hasRecipeCycle([recipe('breaded','grilled'),recipe('grilled','raw')]),false);
 assert.equal(hasRecipeCycle([recipe('breaded','grilled'),recipe('grilled','breaded')]),true);
 assert.equal(hasRecipeCycle([recipe('breaded','breaded')]),true);
});
