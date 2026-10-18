import test from 'node:test';import assert from 'node:assert/strict';import {validDate,weekKey,validateRosterSchedule} from '../server/schedules/rules.js';
const m=[{uid:'a',role:'cook',professional:{sector:'cozinha',certifications:['montagem']}},{uid:'b',role:'cook',professional:{sector:'cozinha',certifications:[]}}];
test('data real e semana começando segunda-feira',()=>{assert(validDate('2026-10-18'));assert(!validDate('2026-02-30'));assert.equal(weekKey('2026-10-18'),'2026-10-12')});
test('proíbe dois cozinheiros de folga no mesmo dia',()=>assert(validateRosterSchedule({entries:[{uid:'a',date:'2026-10-19',type:'off'},{uid:'b',date:'2026-10-19',type:'off'}],members:m}).some(s=>s.includes('Dois cozinheiros'))));
test('valida duplicidade de registro',()=>assert(validateRosterSchedule({entries:[{uid:'a',date:'2026-10-19',type:'off'},{uid:'a',date:'2026-10-19',type:'work'}],members:m}).some(s=>s.includes('Duplicidade'))));
test('confere semana 6x1 completa',()=>{const entries=['12','13','14','15','16','17','18'].map(d=>({uid:'a',date:'2026-10-'+d,type:'work'}));assert(validateRosterSchedule({entries,members:m}).some(s=>s.includes('6x1')))});
