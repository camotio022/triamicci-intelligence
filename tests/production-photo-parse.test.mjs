import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreparation,suggestRecipe,parseProductionNote,validImportRows,evaluatePhotoRecognition} from '../src/production-photo-parse.js';
const recipes=[{id:'batata-pure',name:'Batata purê',outputUnit:'kg'},{id:'frango',name:'Frango a passarinho',outputUnit:'porcao'},{id:'alcatra',name:'Alcatra porção',outputUnit:'porcao'},{id:'batata-palha',name:'Batata palha',outputUnit:'kg'}];
test('normalização preserva identificação sem adivinhar nomes',()=>{
 assert.equal(normalizePreparation('Batata PURÊ!'),'batata pure');
 assert.equal(suggestRecipe('Batata purê',recipes),'batata-pure');
 assert.equal(suggestRecipe('Frango',recipes),'');
 assert.equal(suggestRecipe('Molho branco',recipes),'');
});
test('lista manuscrita interpretada com números no início ou no fim',()=>{
 const rows=parseProductionNote('Molho branco\nBatata purê\nBatata palha\nSegunda-feira\n30 Alcatra\nFrango - 40',recipes);
 assert.equal(rows.length,5);
 assert.deepEqual(rows.map(r=>r.quantity),['','','','30','40']);
 assert.equal(rows[1].recipeId,'batata-pure');
 assert.equal(rows[2].recipeId,'batata-palha');
 assert.equal(rows[3].dateNote,'Segunda-feira');
 assert.equal(rows[4].recipeId,'');
});
test('nunca permite pedido de produção sem produto selecionado nem quantidade incompatível',()=>{
 const good=[{recipeId:'frango',quantity:'12'}];
 assert.equal(validImportRows(good,recipes),true);
 assert.equal(validImportRows([{recipeId:'',quantity:'12'}],recipes),false);
 assert.equal(validImportRows([{recipeId:'frango',quantity:'1.5'}],recipes),false);
 assert.equal(validImportRows([{recipeId:'batata-pure',quantity:'1.5'}],recipes),true);
 assert.equal(validImportRows([{recipeId:'batata-pure',quantity:''}],recipes),true);
 assert.equal(validImportRows(Array.from({length:13},()=>good[0]),recipes),false);
});

test('OCR ilegível não gera 20 preparações fictícias',()=>{
 const garbage='o ao ita : = so o\nsie ess = : E\n1a o SR\nCAES A: OS S Po ;\nà oo.\nio >\nxx xx ;';
 const report=evaluatePhotoRecognition(garbage,recipes,24);
 assert.equal(report.reliable,false);
 assert.equal(report.rows.length,0);
 const unrelated=evaluatePhotoRecognition('TRIAMICCI\nMolho ketchup\nBandeja\nEtiqueta\nTalheres',recipes,79);
 assert.equal(unrelated.reliable,false);
 assert.equal(unrelated.rows.length,0);
});
test('OCR reconhecido mantém só itens vinculados ao catálogo',()=>{
 const report=evaluatePhotoRecognition('Batata purê\nBatata palha\ntexto impossível',recipes,80);
 assert.equal(report.reliable,true);
 assert.deepEqual(report.rows.map(x=>x.recipeId),['batata-pure','batata-palha']);
});
test('OCR sem confiança suficiente impede sugestão automática',()=>{
 const report=evaluatePhotoRecognition('Batata purê',recipes,31);
 assert.equal(report.reliable,false);
 assert.equal(report.rows.length,0);
});
