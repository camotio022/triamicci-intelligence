import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const prep=readFileSync(new URL('../src/PreparationSetup.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/preparation-mobile-polish.css',import.meta.url),'utf8');
test('preparation: confirm discard and archive with accessible sheet',()=>{
 assert.doesNotMatch(prep,/window\.(confirm|prompt)\s*\(/);
 assert.match(prep,/const selectNow=next=>/);
 assert.match(prep,/setConfirmation\(\{kind:'discard',next\}\)/);
 assert.match(prep,/setConfirmation\(\{kind:'archive',id,version:selected\.version/);
 assert.match(prep,/<ConfirmSheet open=\{!!confirmation\}/);
 assert.match(prep,/if\(action\.kind==='discard'\)/);
});
test('preparation: archive uses same expected revision and error does not close confirmation',()=>{
 assert.match(prep,/call\('\/api\/production\/manage','archiveRecipe',\{id:action\.id,expectedVersion:action\.version\}\)/);
 assert.match(prep,/setConfirmation\(null\);\}catch\(e\)\{setError\(e\.message\)\}/);
 assert.match(prep,/call\('\/api\/production\/manage','savePreparation'/);
});
test('preparation: mobile fields are 16px and no global overflow introduced',()=>{
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.prep-setup \.prep-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/font-size:16px;min-height:44px/);
 assert.match(css,/\.prep-setup :is\(button,input,select,textarea\):focus-visible/);
});
