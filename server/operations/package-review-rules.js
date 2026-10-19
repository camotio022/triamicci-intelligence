// Pure approval-readiness policy. Read-only; never changes physicalBalances or physicalLots.
const round=x=>Math.round(x*1000)/1000;
export function reviewReadiness({review,area,referenceBalance,lotStatus,profileVersion,conferenceProfileVersion}={}){
 const blockers=[];
 if(!['reserva','giro'].includes(area))blockers.push('AREA_MISSING');
 if(!review?.ok||review.status!=='READY_FOR_REVIEW'||!Number.isFinite(review.quantity)||review.quantity<0)blockers.push('NOT_CONCILIABLE');
 if(!Number.isFinite(referenceBalance)||referenceBalance<0)blockers.push('BALANCE_MISSING');
 if(!Number.isInteger(profileVersion)||profileVersion<1||conferenceProfileVersion!==profileVersion)blockers.push('VERSION_CHANGED');
 if(!['BALANCED','NOT_TRACKED'].includes(lotStatus))blockers.push('LOTS_NOT_BALANCED');
 return {readyForHumanReview:blockers.length===0,readyForBalanceApproval:false,
  blockers,variance:blockers.length===0?round(review.quantity-referenceBalance):null,stockEffect:'NONE'};
}
