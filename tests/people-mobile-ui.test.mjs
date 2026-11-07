import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const member=readFileSync(new URL('../src/MemberDirectory.jsx',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/PeopleHub.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/people-hub.css',import.meta.url),'utf8');

test('people: role or status update requires an explicit review before invoking server',()=>{
 assert.doesNotMatch(member,/window\.confirm\(/);
 assert.match(member,/if \(!confirmAccess\) \{setConfirmAccess\(true\)/);
 assert.match(member,/confirmAccess\?'Confirmar alteração':'Revisar alteração'/);
 assert.match(member,/role="status" aria-live="polite"/);
 assert.match(member,/request\('update',\{uid:editing\.uid,role,status\}\)/);
 assert.match(member,/setConfirmAccess\(false\)/);
});
test('people: all management sections share the same compact mobile navigation',()=>{
 assert.match(hub,/aria-label="Áreas de gestão de pessoas"/);
 assert.match(hub,/className="ti-people-selected"/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.ti-people-nav\{display:flex;flex-wrap:nowrap/);
 assert.doesNotMatch(css,/\.ti-people-hub:has\(\.ti-master\)/);
});
