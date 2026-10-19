// Validação pura para vincular uma conciliação aos lotes identificados na área.
// Não cria, retira ou ajusta saldo algum.
const round=n=>Math.round(n*1000)/1000;
export function validateLotAllocation({area,quantity,unit,allocations,lots}={}){
 if(!['reserva','giro'].includes(area)||!Number.isFinite(quantity)||quantity<0||typeof unit!=='string'||!Array.isArray(allocations)||!Array.isArray(lots)||allocations.length>100)return {ok:false,reason:'INVALID_INPUT'};
 const byId=new Map(lots.map(x=>[x.id,x]));
 const seen=new Set();let sum=0;
 for(const entry of allocations){
  if(!entry||typeof entry.id!=='string'||seen.has(entry.id)||!Number.isFinite(entry.quantity)||entry.quantity<=0)return {ok:false,reason:'INVALID_ALLOCATION'};
  seen.add(entry.id);const lot=byId.get(entry.id);
  if(!lot||lot.unit!==unit||!Number.isFinite(lot[area])||lot[area]<0||!/^\d{4}-\d{2}-\d{2}$/.test(lot.expiryDate||''))return {ok:false,reason:'LOT_MISMATCH'};
  // A soma física observada por lote é uma alocação declarada; não devemos presumir FEFO como contagem.
  sum+=entry.quantity;
 }
 if(Math.abs(round(sum)-round(quantity))>1e-9)return {ok:false,reason:'TOTAL_MISMATCH'};
 return {ok:true,status:'READY_FOR_REVIEW',allocation:allocations.map(x=>({id:x.id,quantity:x.quantity})),unit,area,stockEffect:'NONE'};
}
