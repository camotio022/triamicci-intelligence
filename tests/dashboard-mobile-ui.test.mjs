import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/Dashboard.jsx',import.meta.url),'utf8'),css=readFileSync(new URL('../src/dashboard-mobile.css',import.meta.url),'utf8');
test('dashboard low-stock cards and desktop table use identical returned records',()=>{
 assert.match(src,/className="ti-dashboard-low-cards"/);
 assert.match(src,/className="table-wrap ti-dashboard-low-table"/);
 assert.match(src,/data\.lowProducts\.map\(p=><article/);
 assert.match(src,/data\.lowProducts\.map\(p=><tr/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.ti-dashboard-low-table\{display:none!important\}/);
});
test('dashboard does not aggregate incompatible units or introduce mutations',()=>{
 assert.match(src,/\{format\(p\.quantity\)\} \{p\.unit\}/);
 assert.match(src,/\{format\(p\.minStock\)\} \{p\.unit\}/);
 assert.match(src,/Operações: últimos 7 dias/);
 assert.match(src,/\/api\/dashboard\/summary/);
 assert.doesNotMatch(src,/\/api\/dashboard\/update/);
});
