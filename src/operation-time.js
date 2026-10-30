import {restaurantDay} from '../server/schedules/restaurant-today.js';
export function recordDay(value){
 if(!value)return null;
 try{const seconds=value.seconds??value._seconds;return restaurantDay(seconds!==undefined?new Date(seconds*1000):value)}catch{return null}
}
export function inPeriod(value,from='',to=''){
 const day=recordDay(value);return Boolean(day&&(!from||day>=from)&&(!to||day<=to));
}
export function pastProposal(proposal,today=restaurantDay()){
 return Boolean(proposal.date&&proposal.date<today);
}
export const hasPhysicalCount=balance=>Boolean(recordDay(balance?.at));
export function balancePresentation(balance){
 if(!balance)return {title:'Sem contagem física registrada',estimated:false,counted:false};
 const estimated=balance.quality==='ESTIMATED_BY_MOVEMENTS'||Boolean(balance.lastMovementAt&&balance.at&&new Date(balance.lastMovementAt)>new Date(balance.at));
 const counted=hasPhysicalCount(balance);
 if(!counted&&balance.quality==='NOT_COUNTED')return {title:'Saldo inicial não conferido',estimated:false,counted:false};
 return {title:estimated?'Saldo calculado':balance.quality==='PARTIAL_LOCATION_COUNT'?'Conferência parcial':'Último saldo registrado',estimated,counted};
}
