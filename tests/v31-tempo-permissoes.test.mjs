import test from 'node:test';import assert from 'node:assert/strict';
import {can,isManagement} from '../server/permissions/v31-policy.js';
import {restaurantDay,dayKind,rosterToday} from '../server/schedules/restaurant-today.js';
test('gerente e subgerente têm decisões de gestão idênticas',()=>{
 for(const cap of ['stock.count.official','receiving.approve','orders.create','attendance.correct','coverage.approve','reports.financial.view'])assert.equal(can('manager',cap),can('submanager',cap));
 assert.equal(isManagement('submanager'),true);
});
test('equipe inspeciona recebimento, mas não credita estoque',()=>{assert.equal(can('auxiliar','receiving.inspect'),true);assert.equal(can('auxiliar','receiving.approve'),false);assert.equal(can('cook','stock.count.official'),false);assert.equal(can('auxiliar','stock.transfer'),true);});
test('capacidade desconhecida falha fechada',()=>assert.equal(can('admin','unknown'),false));
test('dia do restaurante segue São Paulo, não UTC',()=>{assert.equal(restaurantDay('2026-10-22T01:00:00Z'),'2026-10-21');assert.equal(dayKind('2026-10-21','2026-10-21'),'today');});
test('escala não presume presença em serviço',()=>{const r=rosterToday({entries:[{uid:'a',date:'2026-10-21',type:'work'},{uid:'b',date:'2026-10-21',type:'off'}]},'2026-10-21');assert.equal(r[0].operationalStatus,'scheduled_unconfirmed');assert.equal(r[1].operationalStatus,'day_off');});
