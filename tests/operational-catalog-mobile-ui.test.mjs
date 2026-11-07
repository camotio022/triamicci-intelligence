import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/OperationalCatalogSetup.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/operational-catalog-mobile.css',import.meta.url),'utf8');

test('catalog: mobile comparison has card layout and desktop table',()=>{
 assert.match(src,/className="ti-catalog-comparison-mobile"/);
 assert.match(src,/className="ti-catalog-comparison-desktop"/);
 assert.match(src,/Object\.entries\(configLabels\)\.map/);
 assert.match(css,/\.ti-catalog-comparison-desktop\{display:none\}/);
 assert.match(css,/\.ti-catalog-comparison-mobile\{display:grid/);
});
test('catalog: technical IDs hidden but reconciliation keeps identifiers in payload',()=>{
 assert.doesNotMatch(src,/m\.name\+' \('\+m\.id/);
 assert.doesNotMatch(src,/>\{m\.name\} · \{m\.id\}/);
 assert.match(src,/existingProductId:match\.id/);
 assert.match(src,/request\('activate',\{id:selected,\.\.\.form\}\)/);
});
test('catalog: advanced stock controls must be opened before confirmation',()=>{
 assert.match(src,/setAdvancedReviewed\(false\)/);
 assert.match(src,/setAdvancedReviewed\(true\)/);
 assert.match(src,/disabled=\{!advancedReviewed\} checked=\{form\.reviewConfirmed\}/);
 assert.match(src,/disabled=\{busy\|\|!advancedReviewed\|\|!form\.reviewConfirmed/);
 assert.match(css,/\.ti-operational-advanced\[hidden\]\{display:none\}/);
});
test('catalog: mobile controls remain readable without changing stock mutation',()=>{
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/min-height:46px/);
 assert.match(src,/saldo inicial zero/);
});
