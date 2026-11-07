import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/StockMovements.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/stock-movements-mobile.css',import.meta.url),'utf8');
test('movements: mobile cards and desktop table share filtered records',()=>{
 assert.match(src,/filtered=history\.filter/);
 assert.match(src,/className="ti-movements-cards"/);
 assert.match(src,/className="inventory-table-wrap ti-movement-desktop"/);
 assert.match(src,/filtered\.map\(m=><article/);
 assert.match(src,/filtered\.map\(m=><tr/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.ti-movement-desktop\{display:none!important\}/);
});
test('movements: accessible confirmation and API idempotency preserved',()=>{
 assert.doesNotMatch(src,/window\.confirm\(/);
 assert.match(src,/<ConfirmSheet open=\{!!pending\}/);
 assert.match(src,/requestId:action\.requestId/);
 assert.match(src,/await api\('create'/);
 assert.match(src,/setPending\(null\)/);
});
