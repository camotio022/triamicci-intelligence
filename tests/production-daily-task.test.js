import test from 'node:test';
import assert from 'node:assert/strict';
import {progressAfterProduction} from '../server/production/daily-task.js';
test('planejamento sem meta conclui apenas após registrar execução real',()=>{
 assert.deepEqual(progressAfterProduction({status:'pending',plannedQuantity:null},12),{status:'completed',completedQuantity:12});
});
test('produção parcial não marca tarefa concluída antes da meta',()=>{
 assert.deepEqual(progressAfterProduction({status:'pending',plannedQuantity:30},12),{status:'partial',completedQuantity:12});
 assert.deepEqual(progressAfterProduction({status:'partial',plannedQuantity:30,completedQuantity:12},18),{status:'completed',completedQuantity:30});
});
test('recusa completar tarefa já concluída',()=>{
 assert.throws(()=>progressAfterProduction({status:'completed',plannedQuantity:30,completedQuantity:30},1),/INVALID_TASK_PROGRESS/);
});
test('não aceita quantidades fracionárias ou zero',()=>{
 assert.throws(()=>progressAfterProduction({status:'pending'},0),/INVALID_TASK_PROGRESS/);
 assert.throws(()=>progressAfterProduction({status:'pending'},1.2),/INVALID_TASK_PROGRESS/);
});
