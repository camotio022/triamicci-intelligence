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
