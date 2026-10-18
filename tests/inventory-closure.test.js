import test from 'node:test';
import assert from 'node:assert/strict';
import {canApproveClosure,closureDay} from '../server/operations/inventory-closure-rules.js';
const at=s=>({toDate:()=>new Date(s)});
const closure={status:'pending',countId:'count-1',balanceTotalAtRequest:12,balanceMovementAt:'2026-10-17T19:00:00.000Z'};
const balance={countId:'count-1',total:12,lastMovementAt:at('2026-10-17T19:00:00.000Z')};
test('aprovação permitida quando contagem e saldo continuam intactos',()=>assert.equal(canApproveClosure(closure,balance),true));
test('rejeita saldo, data, contagem ou estado alterados',()=>{
 assert.equal(canApproveClosure(closure,{...balance,total:11}),false);
 assert.equal(canApproveClosure(closure,{...balance,countId:'count-2'}),false);
 assert.equal(canApproveClosure(closure,{...balance,lastMovementAt:at('2026-10-17T20:00:00Z')}),false);
 assert.equal(canApproveClosure({...closure,status:'approved'},balance),false);
 assert.equal(canApproveClosure(closure,null),false);
});
test('dia do fechamento respeita o fuso America/Sao_Paulo',()=>{
 assert.equal(closureDay(new Date('2026-10-18T01:00:00Z')),'2026-10-17');
 assert.equal(closureDay(new Date('2026-10-18T03:00:00Z')),'2026-10-18');
});
