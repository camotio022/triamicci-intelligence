// Resolve somente identificadores presentes nesta página e nesta unidade.
// Nomes gravados no evento são snapshots históricos e nunca são substituídos.
export async function historyNames(db,unit,result){
 const rows=Object.values(result).filter(Array.isArray).flat();
 const productIds=[...new Set(rows.filter(r=>!r.productName&&/^[a-f0-9]{40}$/.test(r.productId||'')).map(r=>r.productId))];
 const actorIds=[...new Set(rows.filter(r=>!r.actorName&&/^[A-Za-z0-9_-]{1,128}$/.test(r.actorUid||'')).map(r=>r.actorUid))];
 const [products,actors]=await Promise.all([
  productIds.length?db.getAll(...productIds.map(id=>unit.collection('products').doc(id))):[],
  actorIds.length?db.getAll(...actorIds.map(id=>db.collection('memberships').doc(id))):[]
 ]);
 const names=new Map(products.filter(d=>d.exists).map(d=>[d.id,d.data().name]));
 const people=new Map(actors.filter(d=>d.exists&&d.data().unitId===unit.id).map(d=>[d.id,d.data().displayName||d.data().name]));
 for(const row of rows){
  if(!row.productName&&names.get(row.productId)){row.productName=names.get(row.productId);row.productNameSource='current_catalog';}
  if(!row.actorName&&people.get(row.actorUid)){row.actorName=people.get(row.actorUid);row.actorNameSource='current_membership';}
 }
 return result;
}
export const historyActor=(member,actor)=>member?.displayName||member?.name||actor?.name||null;
