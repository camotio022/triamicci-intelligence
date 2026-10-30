import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDay,inPeriod,pastProposal,balancePresentation} from '../src/operation-time.js';
test('dia operacional respeita São Paulo na virada do dia',()=>{
 assert.equal(recordDay('2026-10-29T02:59:59Z'),'2026-10-28');
 assert.equal(recordDay('2026-10-29T03:00:00Z'),'2026-10-29');
 assert.equal(recordDay(null),null);assert.equal(recordDay('invalid'),null);
 assert.equal(recordDay({seconds:Date.parse('2026-10-29T03:00:00Z')/1000}),'2026-10-29');
});
test('consulta preserva datas limite e filtra histórico sem mudar os registros',()=>{
 assert.equal(inPeriod('2026-10-29T02:59:59Z','2026-10-28','2026-10-28'),true);
 assert.equal(inPeriod('2026-10-29T03:00:00Z','2026-10-28','2026-10-28'),false);
 assert.equal(inPeriod(null),false);assert.equal(inPeriod('invalid'),false);
});
test('proposta vencida não volta a ser acionável em outro dia',()=>{
 assert.equal(pastProposal({date:'2026-10-27'},'2026-10-28'),true);
 assert.equal(pastProposal({date:'2026-10-28'},'2026-10-28'),false);
 assert.equal(pastProposal({date:'2026-10-29'},'2026-10-28'),false);
});
test('saldo com movimentação não se apresenta como contagem física',()=>{
 const b={at:'2026-10-28T15:00:00Z',lastMovementAt:'2026-10-29T15:00:00Z',countedTotal:90,total:89};
 assert.equal(balancePresentation(b).title,'Saldo calculado');
 assert.equal(balancePresentation(b).counted,true);assert.equal(b.total,89);
 assert.equal(balancePresentation({...b,at:null,quality:'ESTIMATED_BY_MOVEMENTS'}).estimated,true);
});
test('conferência parcial não se apresenta como saldo confirmado',()=>{
 assert.equal(balancePresentation({quality:'PARTIAL_LOCATION_COUNT'}).title,'Conferência parcial');
 assert.equal(balancePresentation(null).title,'Sem contagem física registrada');
 assert.equal(balancePresentation({total:0}).counted,false);
 assert.equal(balancePresentation({countedTotal:0,at:'2026-10-29T15:00:00Z'}).counted,true);
});

test('saldo inicial não é contagem física nem contado hoje',async()=>{
 const {hasPhysicalCount}=await import('../src/operation-time.js');
 const initial={total:0,quality:'NOT_COUNTED'};
 assert.equal(hasPhysicalCount(initial),false);assert.equal(balancePresentation(initial).title,'Saldo inicial não conferido');
 assert.equal(hasPhysicalCount({total:0,at:'2026-10-29T15:00:00Z'}),true);
});
