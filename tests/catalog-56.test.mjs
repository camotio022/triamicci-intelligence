import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8')).products;
const operational=read('../data/triamicci-catalogo-operacional-56.revisao.json');
const staging=read('../data/triamicci-product-catalog-56.staging.json');
test('catálogo revisado contém exatamente os 56 nomes sem repetições',()=>{
 assert.equal(operational.length,56);
 assert.equal(new Set(operational.map(p=>p.name)).size,56);
});
test('arquivo técnico corresponde à lista operacional, sem itens experimentais',()=>{
 assert.equal(staging.length,56);
 assert.deepEqual(new Set(staging.map(p=>p.name)),new Set(operational.map(p=>p.name)));
 for(const removed of ['Frango em cubos para strogonoff','Queijos (tipo a definir)','Massas (tipo a definir)'])
  assert.ok(!staging.some(p=>p.name===removed));
});
test('IDs e unidades técnicas não podem colidir ou estar ausentes',()=>{
 assert.equal(new Set(staging.map(p=>p.id)).size,56);
 for(const p of staging){
  assert.match(p.id,/^[a-z0-9-]+$/);
  assert.ok(['kg','L','un'].includes(p.stockUnit),p.name);
  assert.ok(['kg','L','un'].includes(p.operationalUnit),p.name);
  assert.ok(p.source==='internal'||['kg','L','un'].includes(p.receivingUnit),p.name);
  assert.equal(p.active,false,'Itens de staging não devem nascer ativos');
 }
});

test('cadastro manual não pode se declarar parte dos 56 sem conciliação',()=>{
 const source=readFileSync(new URL('../api/products/manage.js',import.meta.url),'utf8');
 assert.match(source,/status:'inactive',countFrequency:'weekly',critical:false,reviewRequired:true/);
 assert.match(source,/previous\.operationalCatalogVersion!=='56-v1'/);
 assert.doesNotMatch(source,/tx\.create\(ref,\{\.\.\.payload,quantity:0,status:'active',operationalCatalogVersion:'56-v1'/);
});
test('conciliação detecta aliases, acentos e nomes antigos sem confundir cortes',async()=>{
 const {matchesCatalogProduct}=await import('../server/operations/catalog-identity.js');
 assert.equal(matchesCatalogProduct({name:' FEIJAO '},{id:'feijao',name:'Feijão'}),true);
 assert.equal(matchesCatalogProduct({name:'Noisettes'},{id:'batata-noisette',name:'Batata noisette'}),true);
 assert.equal(matchesCatalogProduct({name:'Outro',profile:{aliases:['Feijão']}},{id:'feijao',name:'Feijão'}),true);
 assert.equal(matchesCatalogProduct({name:'Alcatra'},{id:'bife-de-alcatra',name:'Bife de alcatra'}),false);
 assert.equal(matchesCatalogProduct({name:'Cubos de alcatra'},{id:'bife-de-alcatra',name:'Bife de alcatra'}),false);
});
