import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/PreparationSetup.jsx',import.meta.url),'utf8');
test('preparations: native confirms replaced with shared accessible sheet',()=>{
 assert.doesNotMatch(source,/window\.confirm\(/);
 assert.match(source,/<ConfirmSheet open=\{!!confirmation\}/);
 assert.match(source,/kind:'switch'/);
 assert.match(source,/kind:'archive'/);
 assert.match(source,/applySelection\(confirmation\.next\)/);
});
test('preparations: archive still preserves server contract and clears modal after API',()=>{
 assert.match(source,/await call\('\/api\/production\/manage','archiveRecipe'/);
 assert.match(source,/setConfirmation\(null\);\s*setId\(''\)/);
 assert.match(source,/expectedVersion:selected\.version/);
});
