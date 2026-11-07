import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/SchedulePlanner.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/roster-mobile-day.css',import.meta.url),'utf8');
test('roster: mobile day view and old desktop matrix coexist',()=>{
 assert.match(src,/className="ti-roster-mobile-day"/);
 assert.match(src,/className="ti-schedule-matrix"/);
 assert.match(src,/filteredPeople\.map\(person=>\{/);
 assert.match(src,/monthDates\(period\)\.includes\(date\)/);
 assert.match(css,/\.ti-planning \.ti-schedule-matrix\{display:none\}/);
});
test('roster: mobile filtering follows selected date and sector',()=>{
 assert.match(src,/value=\{dateSelected\}/);
 assert.match(src,/onChange=\{e=>setDate\(e\.target\.value\)\}/);
 assert.match(src,/entries\.find\(e=>e\.uid===person\.uid&&e\.date===dateSelected\)/);
 assert.match(src,/value=\{matrixSector\}/);
});
