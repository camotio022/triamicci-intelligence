// Requisitos atômicos para uma futura confirmação de saldos.
// Só são confiáveis quando avaliados novamente dentro da MESMA transação de escrita.
const millis=v=>v?.toMillis?.()??(v instanceof Date?v.getTime():null);
export function canCommitPackageAdjustment({conference,profile,balance,expected,actor,lotStatus,lotAllocationsValid}={}){
 const reasons=[];
 if(!actor||!['admin','manager'].includes(actor.role)||actor.status!=='active'||actor.unitId!==expected?.unitId)reasons.push('FORBIDDEN');
 if(!conference||conference.productId!==expected?.productId||conference.unitId!==expected?.unitId||!['reserva','giro'].includes(conference.area))reasons.push('CONFERENCE_MISMATCH');
 if(!profile||profile.version!==conference?.profileVersion||profile.countingMethod?.kind!=='packages'||profile.countingMethod.presentation!==conference.presentation)reasons.push('PROFILE_CHANGED');
 if(!balance||balance.unit!==expected?.unit||!Number.isFinite(balance.reserve)||!Number.isFinite(balance.rotation)||!Number.isFinite(balance.total))reasons.push('BALANCE_INVALID');
 else if(balance.reserve+balance.rotation!==balance.total)reasons.push('BALANCE_INCONSISTENT');
 if(!expected||expected.conferenceId!==conference?.id||expected.profileVersion!==profile?.version||expected.area!==conference?.area||!Number.isFinite(expected.quantity)||expected.quantity<0)reasons.push('REQUEST_MISMATCH');
 if(!expected||expected.balanceCountId!==balance?.countId||expected.balanceMovementMillis!==millis(balance?.lastMovementAt??balance?.at))reasons.push('STALE_BALANCE');
 if(!['NOT_TRACKED','BALANCED'].includes(lotStatus)||lotStatus==='BALANCED'&&!lotAllocationsValid)reasons.push('LOTS_NOT_READY');
 return {ok:reasons.length===0,reasons};
}
