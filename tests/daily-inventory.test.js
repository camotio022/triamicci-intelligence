import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateDailyInventory} from '../server/operations/daily-inventory.js';
const previous={reserve:20,rotation:3,unit:'un',at:'2026-10-16T10:00:00.000Z'};
const current={reserve:12,rotation:5,unit:'un',at:'2026-10-17T10:00:00.000Z'};
const entry=(quantity,at='2026-10-17T08:00:00.000Z')=>({quantity,unit:'un',at});
test('23 anteriores + 10 entradas - 17 atuais = saída estimada 16',()=>{
 const r=calculateDailyInventory({unit:'un',previous,current,entries:[entry(10)]});
 assert.equal(r.available,17);assert.equal(r.estimatedPhysicalExit,16);
 assert.equal(r.variation,-6);assert.equal(r.entriesTotal,10);
});
test('múltiplas entradas são somadas; última entrada é informação distinta',()=>{
 const r=calculateDailyInventory({unit:'un',previous,current,entries:[entry(10,'2026-10-16T18:00:00Z'),entry(4)]});
 assert.equal(r.entriesTotal,14);assert.equal(r.estimatedPhysicalExit,20);
 assert.equal(r.latestEntry.quantity,4);
});
test('sem contagem anterior não inventa saída',()=>{
 const r=calculateDailyInventory({unit:'un',current});
 assert.equal(r.status,'NO_PREVIOUS_COUNT');assert.equal(r.estimatedPhysicalExit,null);
});
test('saída negativa vira divergência positiva e não consumo negativo',()=>{
 const r=calculateDailyInventory({unit:'un',previous:{...previous,reserve:1,rotation:0},current});
 assert.equal(r.estimatedPhysicalExit,null);assert.equal(r.divergence.kind,'POSITIVE_ADJUSTMENT');
});
test('baixa de produção registrada é informativa, não gera segunda baixa',()=>{
 const r=calculateDailyInventory({unit:'un',previous,current,entries:[entry(10)],outflows:[entry(7)]});
 assert.equal(r.estimatedPhysicalExit,16);assert.equal(r.recordedOutflows,7);
 assert.equal(r.divergence.quantity,9);assert.equal(r.informationalOnly,true);
});
test('não aceita unidade incompatível, quantidade fracionada em peças ou eventos fora da janela',()=>{
 assert.throws(()=>calculateDailyInventory({unit:'un',previous,current,entries:[{...entry(1),unit:'kg'}]}));
 assert.throws(()=>calculateDailyInventory({unit:'un',previous,current:{...current,reserve:1.5}}));
 assert.throws(()=>calculateDailyInventory({unit:'un',previous,current,entries:[entry(1,'2026-10-18T10:00:00Z')]}));
});
