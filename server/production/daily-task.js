// Regra pura: tarefas só são concluídas por execução registrada e quantitativa.
export function progressAfterProduction(task,actualQuantity){
 if(!task||!['pending','partial'].includes(task.status||'pending')||
  !Number.isInteger(actualQuantity)||actualQuantity<1||actualQuantity>10000)
  throw Error('INVALID_TASK_PROGRESS');
 const before=task.completedQuantity??0;
 if(!Number.isInteger(before)||before<0)throw Error('INVALID_TASK_PROGRESS');
 const total=before+actualQuantity;
 const target=task.plannedQuantity??null;
 if(target!==null&&(!Number.isInteger(target)||target<1))throw Error('INVALID_TASK_PROGRESS');
 return {status:target===null||total>=target?'completed':'partial',completedQuantity:total};
}
