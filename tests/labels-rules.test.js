import test from 'node:test';import assert from 'node:assert/strict';
import {dateOk,addCalendarDays,cappedExpiry,canReplaceLabel} from '../server/labels/rules.js';
test('rejeita datas impossíveis e mantém calendário',()=>{assert(dateOk('2026-10-18'));assert(!dateOk('2026-02-30'));assert.equal(addCalendarDays('2026-10-30',3),'2026-11-02')});
test('validade usa menor data entre origem e política aprovada',()=>{
 assert.equal(cappedExpiry({startDate:'2026-10-18',sourceExpiryDate:'2026-11-18',policyDays:3,nowDate:'2026-10-18'}),'2026-10-21');
 assert.equal(cappedExpiry({startDate:'2026-10-18',sourceExpiryDate:'2026-10-19',policyDays:30,nowDate:'2026-10-18'}),'2026-10-19');
});
test('não emite etiqueta vencida nem tenta iniciar depois de hoje',()=>{
 assert.equal(cappedExpiry({startDate:'2026-10-01',sourceExpiryDate:'2026-10-16',policyDays:30,nowDate:'2026-10-18'}),null);
 assert.equal(cappedExpiry({startDate:'2026-10-20',sourceExpiryDate:'2026-11-01',policyDays:10,nowDate:'2026-10-18'}),null);
});
test('substituição não aumenta qualquer vencimento e não permite vencidos',()=>{
 const common={currentExpiry:'2026-10-21',originalExpiry:'2026-11-01',today:'2026-10-18'};
 assert(canReplaceLabel({...common,proposedExpiry:'2026-10-20'}));
 assert(!canReplaceLabel({...common,proposedExpiry:'2026-10-22'}));
 assert(!canReplaceLabel({...common,today:'2026-10-22',proposedExpiry:'2026-10-22'}));
});
