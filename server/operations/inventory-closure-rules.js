// Regras determinísticas do fluxo gerencial. Nenhuma função altera estoque.
export function canApproveClosure(closure,balance){
 if(!closure||closure.status!=='pending'||!balance)return false;
 const at=v=>v?.toDate?.()?.toISOString?.()||null;
 return balance.countId===closure.countId &&
   balance.total===closure.balanceTotalAtRequest &&
   (at(balance.lastMovementAt)||at(balance.at))===closure.balanceMovementAt;
}
export function closureDay(date){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw Error('INVALID_DATE');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const data=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${data.year}-${data.month}-${data.day}`;
}
