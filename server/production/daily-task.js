export function previousProductionDay(day){
 const date=new Date(day+'T00:00:00Z');
 date.setUTCDate(date.getUTCDate()-1);
 return date.toISOString().slice(0,10);
}

export async function readProductionTask(tx,unit,day,taskId){
 if(!taskId)return null;
 const days=unit.collection('productionDays');
 const current=await tx.get(days.doc(day).collection('tasks').doc(taskId));
 if(current.exists)return current;
 return tx.get(days.doc(previousProductionDay(day)).collection('tasks').doc(taskId));
}

// Regra pura: tarefas só são concluídas por execução registrada e quantitativa.
export function progressAfterProduction(task,actualQuantity){
 if(!task||!['pending','partial'].includes(task.status||'pending')||
  !Number.isFinite(actualQuantity)||actualQuantity<=0||(!task.unit||['un','porcao','pacote','duzia'].includes(task.unit))&&!Number.isInteger(actualQuantity)||actualQuantity>10000)
  throw Error('INVALID_TASK_PROGRESS');
 const before=task.completedQuantity??0;
 if(!Number.isFinite(before)||before<0)throw Error('INVALID_TASK_PROGRESS');
 const total=Math.round((before+actualQuantity)*1000)/1000;
 const target=task.plannedQuantity??null;
 if(target!==null&&(!Number.isFinite(target)||target<=0))throw Error('INVALID_TASK_PROGRESS');
 return {status:target===null||total>=target?'completed':'partial',completedQuantity:total};
}

// Ao retomar uma tarefa, sugere apenas o restante da meta. Sem meta, usa o rendimento da ficha.
export function executionQuantity(task, recipe){
 const target=task?.plannedQuantity, completed=task?.completedQuantity??0;
 if(Number.isFinite(target)&&target>completed)return Math.round((target-completed)*1000)/1000;
 return recipe?.yieldQuantity||1;
}
