export const investigationReasons={loss:'Perda ou avaria',discard:'Descarte',staff_meal:'Refeição da equipe',production:'Produção declarada',sale:'Venda declarada',transfer:'Transferência declarada',courtesy:'Cortesia',count_error:'Erro de contagem',unidentified:'Não identificado',other:'Outro'};
export function validateInvestigation(report,allocations){
 if(!report?.divergence||!Number.isFinite(report.divergence.quantity)||!Array.isArray(allocations)||!allocations.length||allocations.length>20)return false;
 const surplus=report.divergence.quantity<0||report.divergence.kind==='POSITIVE_ADJUSTMENT';
 let total=0;
 for(const item of allocations){
  if(!Object.hasOwn(investigationReasons,item?.reason)||typeof item.quantity!=='number'||!Number.isFinite(item.quantity)||item.quantity<=0||Math.abs(item.quantity*1000-Math.round(item.quantity*1000))>1e-7||report.unit==='un'&&!Number.isInteger(item.quantity)||typeof item.notes!=='string'||item.notes.trim().length<8||item.notes.length>400)return false;
  if(surplus&&!['count_error','transfer','production','other','unidentified'].includes(item.reason))return false;
  total+=item.quantity;
 }
 return Math.round(total*1000)<=Math.round(Math.abs(report.divergence.quantity)*1000);
}
