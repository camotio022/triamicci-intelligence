import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/triamicci-history.css',import.meta.url),'utf8');
const leave=readFileSync(new URL('../src/LeaveRequests.jsx',import.meta.url),'utf8');
const shared=readFileSync(new URL('../src/TriamicciHistory.jsx',import.meta.url),'utf8');
test('shared history: compact cards and mobile scroll within filters',()=>{
 assert.match(css,/Shared history visual language/);
 assert.match(css,/\.ti-history-shell \.ti-history-card\{border:/);
 assert.match(css,/\.ti-history-shell \.ti-history-periods\{display:flex;overflow-x:auto/);
 assert.match(shared,/HistoryPeriod/);
});
test('shared history: leave records preserve stable IDs without exposing them',()=>{
 assert.match(leave,/getId=\{x=>x\.id\}/);
 assert.doesNotMatch(leave,/ · ID: \{x\.id\}/);
});
