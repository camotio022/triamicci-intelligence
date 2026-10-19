// Plano determinístico para uma futura confirmação transacional.
// Não grava dados. A aprovação deverá revalidar todos os snapshots na transação.
import {validQuantity} from './logic.js';
const round=n=>Math.round(n*1000)/1000;
export function planPackageAdjustment({balance,area,quantity,unit,lots=null,allocation=null}={}){
 if(!balance||!['reserva','giro'].includes(area)||balance.unit!==unit||
  !validQuantity(quantity,{allowZero:true,unit})||
  !validQuantity(balance.reserve,{allowZero:true,unit})||
  !validQuantity(balance.rotation,{allowZero:true,unit})||
  round(balance.reserve+balance.rotation)!==balance.total)
  return {ok:false,reason:'BALANCE_INVALID'};
 const change=round(quantity-balance[area]);
 const next={reserve:area==='reserva'?quantity:balance.reserve,rotation:area==='giro'?quantity:balance.rotation};
 next.total=round(next.reserve+next.rotation);
 if(!validQuantity(next.total,{allowZero:true,unit}))return {ok:false,reason:'TOTAL_INVALID'};
 let nextLots=null;
 if(lots!==null){
  if(!Array.isArray(lots)||!Array.isArray(allocation)||lots.length>100)return {ok:false,reason:'LOTS_REQUIRED'};
  const assigned=new Map();
  for(const item of allocation){
   if(!item||typeof item.id!=='string'||assigned.has(item.id)||!validQuantity(item.quantity,{allowZero:true,unit}))return {ok:false,reason:'LOT_ALLOCATION_INVALID'};
   assigned.set(item.id,item.quantity);
  }
  if(round([...assigned.values()].reduce((sum,v)=>sum+v,0))!==quantity)return {ok:false,reason:'LOT_TOTAL_MISMATCH'};
  if(assigned.size>lots.length||[...assigned.keys()].some(key=>!lots.some(l=>l.id===key)))return {ok:false,reason:'UNKNOWN_LOT'};
  const sum={reserva:0,giro:0};
  nextLots=[];
  for(const lot of lots){
   if(lot.unit!==unit||!validQuantity(lot.reserva,{allowZero:true,unit})||!validQuantity(lot.giro,{allowZero:true,unit}))return {ok:false,reason:'LOT_INVALID'};
   const updated={id:lot.id,reserva:area==='reserva'?(assigned.get(lot.id)||0):lot.reserva,giro:area==='giro'?(assigned.get(lot.id)||0):lot.giro};
   updated.availableQuantity=round(updated.reserva+updated.giro);
   nextLots.push(updated);
   sum.reserva+=updated.reserva;sum.giro+=updated.giro;
  }
  if(round(sum.reserva)!==next.reserve||round(sum.giro)!==next.rotation)return {ok:false,reason:'LOT_BALANCE_MISMATCH'};
 }
 return {ok:true,change,before:{reserve:balance.reserve,rotation:balance.rotation,total:balance.total},
  after:next,lotUpdates:nextLots,requiresAtomicCommit:true};
}
