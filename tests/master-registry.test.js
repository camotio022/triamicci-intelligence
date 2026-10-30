import test from 'node:test';
import assert from 'node:assert/strict';
import {staffSeed,reconcileStaff,normalizeStaffName,defaultStaffAvailability} from '../server/team/master-registry.js';
test('levantamento contém doze colaboradores e exclui desligados',()=>{
 assert.equal(staffSeed.length,12);
 assert.equal(staffSeed.some(x=>['Daniel','Geraldo'].includes(x.name)),false);
 assert.equal(staffSeed.find(x=>x.name==='Judson').jobTitle,'Subgerente');
 assert.equal(staffSeed.find(x=>x.name==='Edielson').jobTitle,'Gerente');
});
test('acentos e espaços são normalizados para sinalização, não para vínculo',()=>{
 assert.equal(normalizeStaffName('  SUBERLÂNIO '),'suberlanio');
 const results=reconcileStaff(staffSeed,[],[{uid:'u123',name:'Temotio'}]);
 assert.equal(results.find(x=>x.name==='Temotio').state,'needs_review');
 assert.equal(results.find(x=>x.name==='Temotio').accountMatches,1);
 assert.equal(results.find(x=>x.name==='Temotio').registryId,null);
});
test('fichas existentes e ambiguidades bloqueiam nova importação',()=>{
 const one=reconcileStaff(staffSeed,[{id:'abc',name:'Patricia'}],[]);
 assert.equal(one.find(x=>x.name==='Patrícia').state,'existing');
 const multiple=reconcileStaff(staffSeed,[{id:'a',name:'Francisco'},{id:'b',name:'Francisco'}],[]);
 assert.equal(multiple.find(x=>x.name==='Francisco').state,'ambiguous');
});

test('nome completo de conta existente bloqueia importação do primeiro nome',()=>{
 const record=reconcileStaff(staffSeed,[],[{uid:'abc',name:'Temotio Luis Bernardo'}]).find(p=>p.name==='Temotio');
 assert.equal(record.state,'needs_review');
});
test('jornada padrão respeita pausas diferentes no domingo e a folga semanal',()=>{
 const morning=defaultStaffAvailability('manha',2);
 assert.equal(morning.find(x=>x.day==='dom').breakStart,'10:30');
 assert.equal(morning.find(x=>x.day==='seg').breakStart,'14:00');
 assert.equal(morning.some(x=>x.day==='ter'),false);
 const night=defaultStaffAvailability('noite',1);
 assert.equal(night.find(x=>x.day==='dom').start,'12:00');
 assert.equal(night.find(x=>x.day==='dom').end,'20:20');
 assert.equal(night.find(x=>x.day==='sab').end,'22:20');
});
