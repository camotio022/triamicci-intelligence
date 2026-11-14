import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationGroups,notificationTime,notificationDestination} from '../src/notifications-model.js';
test('notification groups use restaurant date at midnight, keep newest first and preserve input',()=>{
 const records=[{id:'old',at:'2026-11-08T23:00:00Z'},{id:'today',at:'2026-11-09T03:10:00Z'},{id:'yesterday',at:'2026-11-09T02:59:00Z'},{id:'missing',at:null}];
 const groups=notificationGroups(records,new Date('2026-11-09T03:30:00Z'));
 assert.deepEqual(groups.map(g=>g.label),['Hoje','Ontem','Sem data']);
 assert.deepEqual(groups[1].items.map(n=>n.id),['yesterday','old']);assert.equal(records[0].id,'old');
 assert.equal(notificationTime('2026-11-09T03:10:00Z'),'00:10');assert.equal(notificationTime('bad'),'Sem horário');
});
test('notification destination rejects external/unknown destinations and supports existing notices',()=>{
 assert.equal(notificationDestination({page:'https://evil.test',title:'Acesso atualizado'}),'my-profile');
 assert.equal(notificationDestination({page:'people'}),'people');
 assert.equal(notificationDestination({title:'Recebimento aguardando aprovação',page:'kitchen-v3'}),'receiving');
 assert.equal(notificationDestination({title:'Solicitação de folga analisada'}),'leave-requests');
 assert.equal(notificationDestination({title:'Nova escala publicada'}),'mural');
});
