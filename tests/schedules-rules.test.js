import test from 'node:test';import assert from 'node:assert/strict';import {validDate,weekKey,validateRosterSchedule} from '../server/schedules/rules.js';
const m=[{uid:'a',role:'cook',professional:{sector:'cozinha',certifications:['montagem']}},{uid:'b',role:'cook',professional:{sector:'cozinha',certifications:[]}}];
test('data real e semana começando segunda-feira',()=>{assert(validDate('2026-10-18'));assert(!validDate('2026-02-30'));assert.equal(weekKey('2026-10-18'),'2026-10-12')});
test('proíbe dois cozinheiros de folga no mesmo dia',()=>assert(validateRosterSchedule({entries:[{uid:'a',date:'2026-10-19',type:'off'},{uid:'b',date:'2026-10-19',type:'off'}],members:m}).some(s=>s.includes('Dois cozinheiros'))));
test('valida duplicidade de registro',()=>assert(validateRosterSchedule({entries:[{uid:'a',date:'2026-10-19',type:'off'},{uid:'a',date:'2026-10-19',type:'work'}],members:m}).some(s=>s.includes('Duplicidade'))));
test('confere semana 6x1 completa',()=>{const entries=['12','13','14','15','16','17','18'].map(d=>({uid:'a',date:'2026-10-'+d,type:'work'}));assert(validateRosterSchedule({entries,members:m}).some(s=>s.includes('6x1')))});

test('não publica mês com escala incompleta',()=>{
 const entries=[{uid:'a',date:'2026-10-19',type:'off'}];
 const problems=validateRosterSchedule({entries,members:m,period:'2026-10',complete:true});
 assert(problems.some(x=>x.includes('Escala incompleta')));
});
test('folga adicional mensal só pode ocorrer no domingo',()=>{
 const issues=validateRosterSchedule({entries:[{uid:'a',date:'2026-10-19',type:'monthly_sunday'}],members:m});
 assert(issues.some(x=>x.includes('deve ser domingo')));
});
test('folga semanal fixa não é sexta, sábado ou domingo',()=>{
 const issues=validateRosterSchedule({entries:[{uid:'a',date:'2026-10-23',type:'off'}],members:m});
 assert(issues.some(x=>x.includes('segunda a quinta')));
});

test('rascunho incompleto não gera alerta de cobertura antes de publicação',()=>{
 const issues=validateRosterSchedule({entries:[{uid:'a',date:'2026-10-19',type:'work'}],members:m,minKitchen:4,complete:false});
 assert(!issues.some(x=>x.includes('Cobertura de cozinha')));
});
test('mínimo de cobertura fora dos limites é rejeitado',()=>{
 const issues=validateRosterSchedule({entries:[],members:m,minKitchen:-1});
 assert(issues.some(x=>x.includes('Cobertura mínima inválida')));
});
