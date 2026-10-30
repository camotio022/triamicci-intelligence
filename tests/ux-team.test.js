import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DAY,defaultAvailability,profileChanges,professionalNotice} from '../server/team/ux-rules.js';
import {validateProfessionalProfile} from '../server/team/profile-rules.js';
test('modelo semanal inicia segunda a sábado sem domingo, com pausa exigida',()=>{
 const days=defaultAvailability();
 assert.equal(days.length,6);assert.equal(days[0].day,'seg');assert.equal(days[5].day,'sab');
 assert.equal(days[0].start,'08:00');assert.equal(days[0].end,'16:20');
 assert.equal(days[0].breakStart,'14:00');assert.equal(days[0].breakEnd,'15:00');
 assert.ok(days.every(day=>day.day!=='dom'));
 assert.notEqual(days[0],days[1]);
 assert.deepEqual(DEFAULT_DAY,{start:'08:00',end:'16:20',breakStart:'14:00',breakEnd:'15:00'});
});
test('jornada padrão valida e pode ser alterada',()=>{
 const profile={sector:'cozinha',jobTitle:'Auxiliar',skills:['preparo'],certifications:[],shift:'manha',availability:defaultAvailability(),notes:''};
 assert.ok(validateProfessionalProfile(profile));
 profile.availability[0].end='16:40';
 assert.ok(validateProfessionalProfile(profile));
});
test('uma alteração de múltiplos campos gera um resumo único',()=>{
 const before={jobTitle:'Auxiliar',sector:'cozinha',skills:['preparo']};
 const after={jobTitle:'Cozinheiro',sector:'cozinha',skills:['preparo','montagem']};
 assert.deepEqual(profileChanges(before,after),['Cargo operacional','Habilidades']);
 assert.equal(professionalNotice(profileChanges(before,after)),'Sua ficha profissional foi atualizada: Cargo operacional, Habilidades.');
 assert.deepEqual(profileChanges(after,{...after}),[]);
});
