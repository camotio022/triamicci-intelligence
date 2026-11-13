import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreparation,suggestRecipe,parseProductionNote,validImportRows,reviewPhotoLines} from '../src/production-photo-parse.js';
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

const line=(name,quantity='',quantityUnclear=false)=>({name,quantity,quantityUnclear,dateNote:''});

test('Gemini sugere somente itens ligados ao catálogo, com números para revisão',()=>{
 const rows=reviewPhotoLines([line('Batata pure'),line('Batata palha'),line('Talheres'),line('frango','40'),line('alcatra','30')],recipes);
 assert.deepEqual(rows.map(({recipeId,selected,quantityHint,quantity})=>[recipeId,selected,quantityHint,quantity]),[
  ['batata-pure',true,'',''],['batata-palha',true,'',''],['',false,'40',''],['',false,'30','']
 ]);
});
test('quantidade ilegível não descarta o nome e quantidade com unidade não vira meta',()=>{
 const rows=reviewPhotoLines([line('Batata purê','',true),line('Alcatra porção','2 kg')],recipes);
 assert.equal(rows[0].quantityUnclear,true);
 assert.equal(rows[1].quantityHint,'2 kg');
 assert.equal(rows[1].quantity,'');
});
test('nomes normalizados duplicados exigem vínculo humano',()=>{
 const [row]=reviewPhotoLines([line('Batata purê')],[...recipes,{id:'pure-2',name:'BATATA PURE'}]);
 assert.equal(row.recipeId,'');
 assert.equal(row.selected,false);
});
