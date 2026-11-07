import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const checklist=readFileSync(new URL('../src/Checklists.jsx',import.meta.url),'utf8');
const history=readFileSync(new URL('../src/TriamicciHistory.jsx',import.meta.url),'utf8');
test('checklists: shared history preserves evidence and opening individual runs',()=>{
 assert.match(checklist,/<TriamicciHistory title="Histórico e arquivados"/);
 assert.match(checklist,/defaultPeriod="all"/);
 assert.match(checklist,/<ChecklistEvidence id=\{r\.evidence\[0\]\}/);
 assert.match(checklist,/onClick=\{\(\)=>open\(null,r\)\}/);
 assert.match(checklist,/Carregar anteriores/);
});
test('shared history defaults remain today outside dedicated archive',()=>{
 assert.match(history,/defaultPeriod='today'/);
 assert.match(history,/useState\(defaultPeriod\)/);
});
