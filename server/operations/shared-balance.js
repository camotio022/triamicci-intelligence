// Canonical ledger for new operations. Legacy experimental documents are preserved.
export const balanceField=area=>area==='reserva'?'reserve':area==='giro'?'rotation':area;
export function operationalView(data){
 if(!data)return data;
 return {...data,reserva:data.reserve??data.reserva??0,giro:data.rotation??data.giro??0};
}
export async function operationalBalance(tx,ref){
 const current=await tx.get(ref);
 const legacy=current.exists?null:await tx.get(ref.parent.parent.collection('v3PhysicalBalances').doc(ref.id));
 const source=current.exists?current:legacy;
 return {exists:!!source?.exists,id:ref.id,ref,data:()=>operationalView(source?.data())};
}
export function writeOperationalBalance(tx,ref,values,options={},before={}){
 const normalized=Object.fromEntries(Object.entries(values).map(([key,value])=>[balanceField(key),value]));
 normalized.productId=ref.id;
 if(normalized.reserve===undefined)normalized.reserve=before.reserva??before.reserve??0;
 if(normalized.rotation===undefined)normalized.rotation=before.giro??before.rotation??0;
 if(normalized.total===undefined)normalized.total=before.total??normalized.reserve+normalized.rotation;
 if(normalized.unit===undefined&&before.unit)normalized.unit=before.unit;
 if(normalized.updatedAt)normalized.lastMovementAt=normalized.updatedAt;
 if(values.quality!=='PARTIAL_LOCATION_COUNT'&&Number.isFinite(before.countedTotal)&&Number.isFinite(normalized.total)){
  const delta=Math.round((normalized.total-before.total)*1000)/1000;
  if(delta>0)normalized.entriesSinceCount=Math.round(((before.entriesSinceCount||0)+delta)*1000)/1000;
  if(delta<0)normalized.exitsSinceCount=Math.round(((before.exitsSinceCount||0)-delta)*1000)/1000;
 }
 return tx.set(ref,normalized,{merge:true,...options});
}
