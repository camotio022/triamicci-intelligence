import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const member=readFileSync(new URL('../src/MemberDirectory.jsx',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/PeopleHub.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/people-hub.css',import.meta.url),'utf8');

test('people: role or status update requires an explicit review before invoking server',()=>{
 assert.doesNotMatch(member,/window\.confirm\(/);
 assert.match(member,/if \(!confirmAccess\) \{setConfirmAccess\(true\)/);
 assert.match(member,/confirmAccess\?'Confirmar alteração':'Revisar alteração'/);
 assert.match(member,/role="status" aria-live="polite"/);
 assert.match(member,/request\('update',\{uid:editing\.uid,role,status\}\)/);
 assert.match(member,/setConfirmAccess\(false\)/);
});
test('people: the compact entry point links to independent management routes',()=>{
 assert.match(hub,/aria-label="Áreas de gestão de pessoas"/);
 assert.doesNotMatch(hub,/CoverageConsole|SchedulePlanner|MasterRegistry|ti-people-selected/);
 for(const page of ['master-registry','schedule-planning','coverage','team-today','skills','shifts','people-access']){
  assert.ok(hub.includes("page:'"+page+"'"));
  assert.ok(app.includes('page === "'+page+'"'));
 }
 assert.match(app,/navigate\('coverage',null,null,\{coverage\}\)/);
 assert.match(app,/url\.searchParams\.set\('date',coverage\.date\)/);
 assert.match(css,/\.ti-people-actions\s*\{\s*display: grid/);
});
