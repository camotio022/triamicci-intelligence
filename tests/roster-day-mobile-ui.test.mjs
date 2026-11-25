import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const planner=readFileSync(new URL('../src/SchedulePlanner.jsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../src/RosterBoard.jsx',import.meta.url),'utf8');
const rosterCss=readFileSync(new URL('../src/roster-board.css',import.meta.url),'utf8');
const mobileCss=readFileSync(new URL('../src/roster-mobile-day.css',import.meta.url),'utf8');

test('roster: mobile day view and desktop month/week board coexist',()=>{
 assert.match(planner,/RosterBoard/, 'planner should render the shared roster board');
 assert.match(board,/className="mobile-date"/);
 assert.match(board,/className=\{isSunday\?'month-grid':'week-grid'\}/);
 assert.match(board,/className=\{'day'\+\(active\?' active':''\)\}/);
 assert.match(rosterCss,/\.roster-board \.mobile-date\b/);
 assert.match(rosterCss,/\.roster-board \.day\b[\s\S]*?display:\s*none/);
 assert.match(rosterCss,/\.roster-board \.day\.active\b[\s\S]*?display:\s*block/);
 assert.match(mobileCss,/\.ti-planning \.ti-schedule-matrix\{display:none\}/);
});

test('roster: mobile filtering follows the selected day and person context',()=>{
 assert.match(board,/className="mobile-date"[\s\S]*?aria-pressed=\{isSunday\?date===sunday:index===pair\}/);
 assert.match(board,/onClick=\{\(\)=>isSunday\?setSunday\(date\):setPair\(index\)\}/);
 assert.match(board,/const active=isSunday\?date===sunday:index===pair/);
 assert.match(board,/className=\{'day'\+\(active\?' active':''\)\}/);
 assert.match(board,/mobile-people/);
 assert.match(board,/personCards\(people,'mobile-person'\)/);
 assert.match(board,/\[personId,setPerson\]=useState/);
});
