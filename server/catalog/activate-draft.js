import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {matchesCatalogProduct,operationalProfileFor,OPERATIONAL_CATALOG_VERSION} from '../operations/catalog-identity.js';
import {signalUnitChange} from '../live-signal.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
const draft=JSON.parse(readFileSync(new URL('../../data/triamicci-product-catalog-56.staging.json',import.meta.url),'utf8')).products;
const byId=new Map(draft.map(p=>[p.id,p]));
const units=new Set(['kg','L','un']);
const hash=name=>createHash('sha256').update(name.trim().toLocaleLowerCase('pt-BR')).digest('hex').slice(0,40);
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||!['admin','manager','submanager'].includes(m.role))return send(res,403,'Acesso restrito à gestão.');
  const db=getDb(),catalog=db.collection('productCatalog'),unitProducts=db.collection('units').doc(m.unitId).collection('products');
  if(req.body?.action==='status'){
   const [all,profiles]=await Promise.all([unitProducts.limit(201).get(),db.collection('units').doc(m.unitId).collection('operationalProfiles').limit(201).get()]);
   const profileMap=new Map(profiles.docs.map(d=>[d.id,d.data()]));
   if(all.size>200||profiles.size>200)return send(res,409,'Catálogo acima de 200 registros: conciliação paginada necessária.');
   const rows=all.docs.map(doc=>({id:doc.id,...doc.data(),profile:profileMap.get(doc.id)}));
   return send(res,200,'Situação e possíveis conflitos de cadastro.',{items:draft.map(p=>{
    const matches=rows.filter(row=>matchesCatalogProduct(row,p));
    const active=matches.some(row=>row.catalogId===p.id&&row.status==='active'&&row.operationalCatalogVersion==='56-v1'&&row.profile);
    return {id:p.id,active,needsReconciliation:matches.length>0&&!active||matches.length>1,
      matches:matches.map(row=>({id:row.id,name:row.name,catalogId:row.catalogId||null,status:row.status||null,version:row.operationalCatalogVersion||null}))};
   })});
  }
  if(req.body?.action!=='activate')return send(res,400,'Ação inválida.');
  if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Sem permissão.');
  const {id,name,category,stockUnit,operationalUnit,receivingUnit,source,trackExpiry,minStock,countFrequency,critical,reviewConfirmed,existingProductId=null}=req.body;
  const candidate=byId.get(id);
  if(existingProductId!==null&&!/^[a-f0-9]{40}$/.test(existingProductId))return send(res,400,'Vínculo de produto inválido.');
  if(!candidate||name!==candidate.name||category!==candidate.category||!units.has(stockUnit)||
     !units.has(operationalUnit)||!['supplier','internal'].includes(source)||
     (source==='supplier'&&!units.has(receivingUnit))||typeof trackExpiry!=='boolean'||typeof minStock!=='number'||!Number.isFinite(minStock)||minStock<0||minStock>100000000||!['daily','weekly','on_demand'].includes(countFrequency)||typeof critical!=='boolean'||reviewConfirmed!==true)
   return send(res,400,'Confirme as informações do produto antes de ativar.');
  // Avoid automatic conversions between unlike units: configured receipt and count must match the stock unit.
  if(operationalUnit!==stockUnit||(source==='supplier'&&receivingUnit!==stockUnit))
   return send(res,409,'Unidades diferentes exigem regra de conversão homologada. Use a mesma unidade para ativar.');
  const ref=unitProducts.doc(existingProductId||hash(name)),centralRef=catalog.doc(id),memberRef=db.collection('memberships').doc(actor.uid);
  const now=new Date();
  await db.runTransaction(async tx=>{
   const root=db.collection('units').doc(m.unitId),profileRef=root.collection('operationalProfiles').doc(ref.id),balanceRef=root.collection('physicalBalances').doc(ref.id);
   const [member,existing,central,all,profile,balance,legacy,allProfiles]=await Promise.all([tx.get(memberRef),tx.get(ref),tx.get(centralRef),tx.get(unitProducts.limit(201)),tx.get(profileRef),tx.get(balanceRef),tx.get(root.collection('v3PhysicalBalances').doc(ref.id)),tx.get(root.collection('operationalProfiles').limit(201))]);
   const profileMap=new Map(allProfiles.docs.map(d=>[d.id,d.data()]));
   if(all.size>200||allProfiles.size>200)throw Error('CATALOG_LIMIT');
   if(all.docs.some(doc=>doc.id!==ref.id&&(matchesCatalogProduct({...doc.data(),profile:profileMap.get(doc.id)},candidate))))throw Error('CATALOG_CONFLICT');
   if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||
      !['admin','manager','submanager'].includes(member.data().role))throw Error('FORBIDDEN');
   if(existing.exists&&existing.data().catalogId===id&&existing.data().status==='active'&&existing.data().operationalCatalogVersion===OPERATIONAL_CATALOG_VERSION&&profile.exists)throw Error('ALREADY_ACTIVE');
   if(existing.exists&&existing.data().operationalCatalogVersion!==OPERATIONAL_CATALOG_VERSION&&!existingProductId)throw Error('RECONCILIATION_REQUIRED');
   if(existingProductId&&(!existing.exists||!matchesCatalogProduct({...existing.data(),profile:profile.data()},candidate)))throw Error('CATALOG_CONFLICT');
   if(existing.exists&&!existingProductId&&existing.data().catalogId!==id)throw Error('CATALOG_CONFLICT');
   if(existing.exists){
    const old=existing.data();
    // Não converter unidades nem habilitar/desabilitar rastreamento sobre histórico existente.
    if(old.unit!==stockUnit||Boolean(old.trackExpiry)!==trackExpiry||profile.exists&&profile.data().countUnit!==operationalUnit||balance.exists&&balance.data().unit!==operationalUnit||legacy.exists&&!balance.exists)throw Error('RECONCILIATION_REQUIRED');
   }
   if(central.exists&&central.data().active===true&&['stockUnit','operationalUnit','source','trackExpiry'].some(key=>central.data()[key]!==({stockUnit,operationalUnit,source,trackExpiry})[key]))throw Error('RECONCILIATION_REQUIRED');
   if(central.exists&&central.data().name!==name)throw Error('CATALOG_CONFLICT');
   const record={id,name,category,type:source==='internal'?'prepared':'raw',source,stockUnit,
    operationalUnit,receivingUnit:source==='supplier'?receivingUnit:null,trackExpiry,
    schemaVersion:2,reviewRequired:false,ingredientsPending:source==='internal',active:true,
    brandId:'triamicci',approvedBy:actor.uid,approvedAt:now,updatedAt:now};
   if(central.exists)tx.update(centralRef,record);else tx.create(centralRef,{...record,createdAt:now});
   if(existing.exists){
     tx.update(ref,{catalogId:id,status:'active',reviewRequired:false,operationalCatalogVersion:OPERATIONAL_CATALOG_VERSION,operationalUnitOverride:operationalUnit,receivingUnitOverride:source==='supplier'?receivingUnit:null,minStock,countFrequency,critical,updatedAt:now,updatedBy:actor.uid});
   }else tx.create(ref,{name,category,unit:stockUnit,minStock,countFrequency,critical,trackExpiry,quantity:0,status:'active',operationalCatalogVersion:OPERATIONAL_CATALOG_VERSION,
     catalogId:id,productType:record.type,relatedCatalogIds:[],createdAt:now,createdBy:actor.uid,updatedAt:now});
   if(!profile.exists)tx.create(profileRef,operationalProfileFor({name,source,operationalUnit,receivingUnit},actor.uid,now));
   else if(profile.data().origin!==source)throw Error('RECONCILIATION_REQUIRED');
   if(!balance.exists)tx.create(balanceRef,{productId:ref.id,unit:operationalUnit,reserve:0,rotation:0,total:0,quality:'NOT_COUNTED',updatedAt:now});
   signalUnitChange(tx,db,m.unitId);
   tx.create(db.collection('auditLogs').doc(),{event:'catalog.manual_activation',unitId:m.unitId,
     productId:ref.id,catalogId:id,reconciled:existing.exists,previousCatalogId:existing.data()?.catalogId||null,actorUid:actor.uid,at:now});
  });
  return send(res,200,existingProductId?'Produto conciliado; ID, saldos e histórico preservados.':'Produto ativado com estoque inicial zero.',{id,productId:ref.id});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='RECONCILIATION_REQUIRED')return send(res,409,'Unidade, validade, origem ou saldo legado exige migração revisada; nenhum saldo foi alterado.');
  if(e.message==='ALREADY_ACTIVE')return send(res,409,'Este insumo já está cadastrado e ativo; não é permitido duplicar.');
  if(e.message==='CATALOG_LIMIT')return send(res,409,'Catálogo acima de 200 registros: concilie antes de ativar.');
  if(e.message==='CATALOG_CONFLICT')return send(res,409,'Produto experimental conflitante; não foi alterado.');
  console.error('Operational catalog setup:',e.message);
  return send(res,500,'Falha ao ativar o produto.');
 }
}
