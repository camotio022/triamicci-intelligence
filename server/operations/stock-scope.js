// Ledgers are distinct scopes, never additive. Current physical data overrides
// its legacy fallback; storage stock independently blocks archival. Malformed
// existing balances must be reconciled instead of being interpreted as zero.
export function hasArchiveStock(product,current,legacy,storage){
 const physical=current.exists?current:legacy;
 for(const snapshot of [physical,storage]){
  if(!snapshot.exists)continue;
  const data=snapshot.data();
  if(!data||!Number.isFinite(data.total)||data.total<0)return true;
  const values=[data.total,data.reserve,data.rotation,data.reserva,data.giro,...Object.values(data.byStorage||{})].filter(v=>v!==undefined&&v!==null);
  if(values.some(v=>!Number.isFinite(v)||v!==0))return true;
 }
 return product.quantity!==undefined&&product.quantity!==null&&(!Number.isFinite(product.quantity)||product.quantity!==0);
}
export const STOCK_SCOPES=Object.freeze({physical:'physicalBalances',legacy:'v3PhysicalBalances',storage:'storageBalancesV1'});
