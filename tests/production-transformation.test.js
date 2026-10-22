import test from 'node:test';
import assert from 'node:assert/strict';
import {transformationPreview,validateTransformationRecipe} from '../server/production/transformation.js';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
const recipe={outputProductId:b,yieldQuantity:1,lines:[{productId:a,quantity:1}]};
test('transformação reconhece origem de 30 parmegianas sem gravar estoque',()=>{
 const result=transformationPreview(recipe,30,{[a]:'un'});
 assert.equal(result.valid,true);assert.deepEqual(result.inputs,[{productId:a,quantity:30,unit:'un'}]);
 assert.deepEqual(result.output,{productId:b,quantity:30});
 assert.equal(result.sourceArea,'reserva');assert.equal(result.destinationArea,'reserva');
});
test('não aceita receita cujo ingrediente é o próprio produto final',()=>{
 assert.equal(validateTransformationRecipe({...recipe,outputProductId:a}).valid,false);
});
test('não aceita fração de peça',()=>{
 assert.equal(transformationPreview({...recipe,yieldQuantity:2},3,{[a]:'un'}).reason,'FRACTIONAL_PIECES');
});
test('não inventa conversão quando a unidade não está validada',()=>{
 assert.equal(transformationPreview(recipe,5,{}).reason,'UNCONFIRMED_UNIT');
});
test('não duplica ingredientes dentro da mesma receita',()=>{
 assert.equal(validateTransformationRecipe({...recipe,lines:[{productId:a,quantity:1},{productId:a,quantity:1}]}).valid,false);
});
test('calcula ingredientes por rendimento declarado',()=>{
 const result=transformationPreview({outputProductId:c,yieldQuantity:10,lines:[{productId:a,quantity:2.5}]},20,{[a]:'kg'});
 assert.equal(result.inputs[0].quantity,5);
});
