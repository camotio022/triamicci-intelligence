import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMonthlyRoster,weekdayOccurrences} from '../server/schedules/generator.js';
const members=[{uid:'a',name:'Cozinheiro A',status:'active'},{uid:'b',name:'Auxiliar A',status:'active'},{uid:'c',name:'Inativo',status:'inactive'}];
test('folgas fixas repetem em todas as quartas e podem ser compartilhadas',()=>{
 const entries=generateMonthlyRoster({period:'2026-11',members,fixedOffDays:{a:3,b:3},sundayOffDays:{a:'2026-11-08',b:'2026-11-15'}});
 const weds=weekdayOccurrences('2026-11',3);
 assert.deepEqual(weds,['2026-11-04','2026-11-11','2026-11-18','2026-11-25']);
 for(const date of weds)assert.equal(entries.filter(e=>e.date===date&&e.type==='off').length,2);
 assert.equal(entries.filter(e=>e.type==='monthly_sunday').length,2);
 assert.equal(entries.some(e=>e.uid==='c'),false);
});
test('domingo adicional não substitui a folga habitual',()=>{
 const entries=generateMonthlyRoster({period:'2026-11',members:[members[0]],fixedOffDays:{a:1},sundayOffDays:{a:'2026-11-08'}});
 assert.equal(entries.filter(e=>e.type==='off').length,5);
 assert.equal(entries.filter(e=>e.type==='monthly_sunday').length,1);
});
test('sem folga fixa ou com domingo incorreto não gera escala silenciosamente',()=>{
 assert.throws(()=>generateMonthlyRoster({period:'2026-11',members:[members[0]],fixedOffDays:{},sundayOffDays:{a:'2026-11-08'}}),/Cadastre uma folga/);
 assert.throws(()=>generateMonthlyRoster({period:'2026-11',members:[members[0]],fixedOffDays:{a:2},sundayOffDays:{a:'2026-11-09'}}),/domingo mensal válido/);
});
