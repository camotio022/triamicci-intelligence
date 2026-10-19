import test from 'node:test';
import assert from 'node:assert/strict';
import {weeksForMonth,paperRoster} from '../server/schedules/mural-view.js';
test('semanas abrangem todos os dias do mês sem repetições',()=>{
 const weeks=weeksForMonth('2026-11');assert.equal(weeks.flat().length,30);assert.equal(weeks[0][0],'2026-11-01');assert.equal(weeks.at(-1).at(-1),'2026-11-30');
});
test('folgas fixas por dia e domingos mensais não incluem trabalho',()=>{
 const s={period:'2026-11',entries:[
 {uid:'a',name:'Patrícia',date:'2026-11-02',type:'off'},
 {uid:'b',name:'Judson',date:'2026-11-02',type:'off'},
 {uid:'c',name:'Emilly',date:'2026-11-02',type:'work'},
 {uid:'a',name:'Patrícia',date:'2026-11-08',type:'monthly_sunday'},
 {uid:'b',name:'Judson',date:'2026-11-08',type:'work'}
 ]};
 const data=paperRoster(s,weeksForMonth(s.period)[1]);
 assert.deepEqual(data.offByDay[0].people.map(x=>x.name),['Judson','Patrícia']);
 assert.deepEqual(data.sundays.find(x=>x.date==='2026-11-08').people.map(x=>x.name),['Patrícia']);
});
test('ausência é exceção, não folga fixa',()=>{
 const s={period:'2026-11',entries:[{uid:'a',name:'Francisco',date:'2026-11-04',type:'leave'}]};
 const d=paperRoster(s,['2026-11-04']);assert.equal(d.offByDay[2].people.length,0);assert.equal(d.exceptions.length,1);
});
