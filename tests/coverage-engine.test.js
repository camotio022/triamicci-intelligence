import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RATES,paymentFor,rateRoleFor,checkDoubleShift,evaluateCoverage,coversWindow} from '../server/coverage/engine.js';
test('tabela pratica: cargos e convocacao externa tem prioridade',()=>{
 assert.equal(paymentFor({role:'manager'}),150);
 assert.equal(paymentFor({role:'submanager'}),120);
 assert.equal(paymentFor({role:'head_cook'}),150);
 assert.equal(paymentFor({role:'cook'}),120);
 assert.equal(paymentFor({role:'auxiliar'}),100);
 assert.equal(paymentFor({role:'manager',external:true}),100);
 assert.equal(DEFAULT_RATES.external,100);
});
test('jornada em dois turnos nao recebe liberacao automatica',()=>{
 assert.equal(checkDoubleShift({first:{start:'08:00',end:'12:00'},second:{start:'13:00',end:'17:00'}}).state,'review');
 assert.equal(checkDoubleShift({first:{start:'07:00',end:'15:00'},second:{start:'16:00',end:'22:00'}}).state,'blocked');
 assert.equal(checkDoubleShift({first:{start:'08:00',end:'14:00'},second:{start:'13:00',end:'17:00'}}).state,'blocked');
 assert.equal(checkDoubleShift({first:{start:'22:00',end:'06:00'},second:{start:'15:00',end:'23:00'}}).state,'blocked');
});
test('cobertura conta somente escalados e destaca competencia confirmada',()=>{
 const people=[{uid:'a',name:'A',status:'active',professional:{sector:'cozinha',certifications:['chapa']}},{uid:'b',name:'B',role:'cook',status:'active',professional:{sector:'cozinha',certifications:['chapa']}},{uid:'c',name:'C',status:'active',professional:{sector:'cozinha',certifications:[]}}];
 const r=evaluateCoverage({people,entries:[{uid:'a',date:'2026-10-20',type:'work'}],date:'2026-10-20',requiredSkill:'chapa',required:2});
 assert.equal(r.covered,1);assert.equal(r.shortage,1);assert.equal(r.candidates[0].uid,'b');assert.equal(r.candidates[0].eligibility,'review');
});

test('categoria de pagamento deriva do cargo real',()=>{
 assert.equal(rateRoleFor({jobTitle:'Gerente'}),'manager');
 assert.equal(rateRoleFor({jobTitle:'Subgerente'}),'submanager');
 assert.equal(rateRoleFor({jobTitle:'Cozinheiro-chefe'}),'head_cook');
 assert.equal(rateRoleFor({jobTitle:'Cozinheiro'}),'cook');
 assert.equal(rateRoleFor({jobTitle:'Auxiliar de cozinha'}),'other');
});

test('faixa horaria nao conta pausa como cobertura',()=>{
 const p={professional:{availability:[{day:'ter',start:'08:00',end:'18:00',breakStart:'12:00',breakEnd:'13:00'}]}};
 assert.equal(coversWindow(p,'2026-10-20','09:00','11:00'),true);
 assert.equal(coversWindow(p,'2026-10-20','12:00','13:00'),false);
 assert.equal(coversWindow(p,'2026-10-20','17:00','19:00'),false);
});
