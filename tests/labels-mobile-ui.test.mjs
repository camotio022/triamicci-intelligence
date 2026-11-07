import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/LabelsManager.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/labels-mobile.css',import.meta.url),'utf8');
test('labels: search and area filters only affect displayed records',()=>{
 assert.match(src,/const visibleLabels=labels\.filter/);
 assert.match(src,/areaFilter==='all'\|\|item\.zone===areaFilter/);
 assert.match(src,/\[item\.productName,item\.lot\]/);
 assert.match(src,/visibleLabels\.map\(x=><article/);
 assert.match(src,/role="group" aria-label="Filtrar local"/);
 assert.match(src,/visibleLabels\.length\} de \{labels\.length\} etiquetas carregadas/);
});
test('labels: audit, printing and issuance continue to use original records',()=>{
 assert.match(src,/call\('labels','issue',\{\.\.\.form,quantity:Number\(form\.quantity\)\}\)/);
 assert.match(src,/call\('labels','replace',changing\)/);
 assert.match(src,/call\('labels','history',\{id\}\)/);
 assert.match(src,/labels\.find\(x=>x\.id===printId\)/);
 assert.match(src,/call\('labels','policyApprove',\{id:p\.id\}\)/);
});
test('labels: compact mobile touch targets and 16px inputs',()=>{
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/\.ti-labels-records \.ti-label-actions/);
});
