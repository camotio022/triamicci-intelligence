// Regras FEFO puras e testáveis: não convertem peso em peças e não aceitam saldo presumido.
const round=x=>Math.round(x*1000)/1000;
export function areaTotals(lots){
 if(!Array.isArray(lots)||lots.some(l=>!Number.isFinite(l.reserva)||!Number.isFinite(l.giro)||
   l.reserva<0||l.giro<0))return null;
 return {reserva:round(lots.reduce((s,l)=>s+l.reserva,0)),
  giro:round(lots.reduce((s,l)=>s+l.giro,0))};
}
export function allocateFEFO(lots,{area,quantity,allowExpired=false,today}){
 if(!['reserva','giro'].includes(area)||!Number.isFinite(quantity)||quantity<=0)return null;
 let remaining=round(quantity);
 const allocations=[];
 for(const lot of [...lots].sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate))){
  if(typeof lot.expiryDate!=='string'||!Number.isFinite(lot[area])||lot[area]<0)return null;
  if(!allowExpired&&lot.expiryDate<today)continue;
  const part=round(Math.min(remaining,lot[area]));
  if(part>0){allocations.push({id:lot.id,quantity:part});remaining=round(remaining-part)}
  if(remaining<=0)break;
 }
 return remaining===0?allocations:null;
}
