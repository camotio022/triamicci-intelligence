import test from 'node:test';
import assert from 'node:assert/strict';
import {areaTotals,allocateFEFO} from '../api/operations/lot-logic.js';

const lots=[
 {id:'new',expiryDate:'2027-02-01',reserva:5,giro:2},
 {id:'old',expiryDate:'2026-12-01',reserva:3,giro:4},
 {id:'expired',expiryDate:'2026-01-01',reserva:6,giro:1}
];
test('soma por área exige quantidades reais e conferidas',()=>{
 assert.deepEqual(areaTotals(lots),{reserva:14,giro:7});
 assert.equal(areaTotals([{reserva:5}]),null);
 assert.equal(areaTotals([{reserva:-1,giro:0}]),null);
});
test('FEFO seleciona vencimento mais próximo e ignora vencidos no consumo',()=>{
 const chosen=allocateFEFO(lots,{area:'giro',quantity:5,today:'2026-10-17'});
 assert.deepEqual(chosen,[{id:'old',quantity:4},{id:'new',quantity:1}]);
});
test('ajustes/perdas podem retirar lote vencido mediante auditoria',()=>{
 const chosen=allocateFEFO(lots,{area:'reserva',quantity:7,today:'2026-10-17',allowExpired:true});
 assert.deepEqual(chosen,[{id:'expired',quantity:6},{id:'old',quantity:1}]);
});
test('reserva e giro não são intercambiáveis',()=>{
 assert.equal(allocateFEFO([{id:'a',expiryDate:'2027-01-01',reserva:100,giro:0}],
  {area:'giro',quantity:1,today:'2026-10-17'}),null);
});
test('bloqueia quantidade indisponível e dados desconhecidos',()=>{
 assert.equal(allocateFEFO(lots,{area:'giro',quantity:100,today:'2026-10-17'}),null);
 assert.equal(allocateFEFO(lots,{area:'giro',quantity:-1,today:'2026-10-17'}),null);
 assert.equal(allocateFEFO([{id:'x',expiryDate:'2027-01-01',reserva:2}],{area:'giro',quantity:1,today:'2026-10-17'}),null);
});
