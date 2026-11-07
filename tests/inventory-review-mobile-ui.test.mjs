import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/DailyInventory.jsx',import.meta.url),'utf8');
test('inventory closure: identifiers and native prompt hidden from operator',()=>{
 assert.doesNotMatch(source,/window\.prompt\(/);
 assert.doesNotMatch(source,/Identificador da contagem:/);
 assert.match(source,/className="ti-inventory-reject"/);
});
test('inventory closure: approval, rejection and API error semantics',()=>{
 assert.match(source,/action:'closeApprove'/);
 assert.match(source,/action:'closeReject'/);
 assert.match(source,/<ConfirmSheet open=\{!!reviewAction\}/);
 assert.match(source,/const ok=await decide/);
 assert.match(source,/if\(ok\)\{setReviewAction\(null\)/);
 assert.match(source,/return false\}finally/);
});
