import {configuredProduct} from './configured-product.js';
import {belongsToOperationalCatalog,usesPhysicalLots} from './catalog-identity.js';
import {countUnit} from './logic.js';

// Shared by the catalogue and production workspace. One request reads each
// collection/definition once; transaction-time checks remain in the write paths.
export async function readOperationalCatalog(db,unit){
 const [snap,balanceSnap,profileSnap]=await Promise.all([
  unit.collection('products').limit(201).get(),
  unit.collection('physicalBalances').limit(201).get(),
  unit.collection('operationalProfiles').limit(201).get()
 ]);
 if([snap,balanceSnap,profileSnap].some(s=>s.size>200))return {tooLarge:true};
 const profiles=new Map(profileSnap.docs.map(d=>[d.id,d.data()]));
 const balances=new Map(balanceSnap.docs.map(d=>[d.id,d.data()]));
 const visible=snap.docs.filter(d=>belongsToOperationalCatalog(d.data()));
 const ids=[...new Set(visible.map(d=>d.data().catalogId).filter(Boolean))];
 const definitions=ids.length?await db.getAll(...ids.map(id=>db.collection('productCatalog').doc(id))):[];
 const catalog=new Map(definitions.map(d=>[d.id,d.data()]));
 const contextProducts=snap.docs.map(doc=>{
  const p=configuredProduct(doc.data(),profiles.get(doc.id));
  return {...p,id:doc.id,physicalUnit:countUnit(p,catalog.get(p.catalogId)),physicalBalance:balances.get(doc.id)||null};
 });
 const products=contextProducts.filter(p=>belongsToOperationalCatalog(p)).map(d=>{
  const b=d.physicalBalance;
  const view={id:d.id,operationalCatalogVersion:d.operationalCatalogVersion,name:d.name,profile:d.profile||null,aliases:d.aliases||[],category:d.category,unit:d.unit,minStock:d.minStock,
   lotTrackingMode:usesPhysicalLots(d)?'per_lot':d.lotTrackingMode||null,trackExpiry:d.trackExpiry===true,status:d.status,quantity:d.quantity??0,catalogId:d.catalogId||null,
   portionWeight:d.portionWeight??null,weightUnit:d.weightUnit||null,source:d.source||null,labelCategory:d.labelCategory||null,operationalUnitOverride:d.operationalUnitOverride||null,receivingUnitOverride:d.receivingUnitOverride||null,
   createdAt:d.createdAt?.toDate?.()?.toISOString?.()||null};
  return {...view,physicalUnit:countUnit(view,catalog.get(view.catalogId)),
   physicalBalance:b?{reserve:b.reserve,rotation:b.rotation,total:b.total,unit:b.unit,quality:b.quality||null,countedTotal:b.countedTotal??null,
    entriesSinceCount:b.entriesSinceCount??null,exitsSinceCount:b.exitsSinceCount??null,lastMovementAt:b.lastMovementAt?.toDate?.()?.toISOString?.()||null,at:b.at?.toDate?.()?.toISOString?.()||null}:null};
 }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 return {products,contextProducts};
}
