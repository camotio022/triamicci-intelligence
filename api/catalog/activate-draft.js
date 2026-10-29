import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
const draft=JSON.parse(readFileSync(new URL('../../data/triamicci-product-catalog-56.staging.json',import.meta.url),'utf8')).products;
const byId=new Map(draft.map(p=>[p.id,p]));
const units=new Set(['kg','L','un']);
const normalizeName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const hash=name=>createHash('sha256').update(name.trim().toLocaleLowerCase('pt-BR')).digest('hex').slice(0,40);
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||!['admin','manager','submanager'].includes(m.role))return send(res,403,'Acesso restrito à gestão.');
  const db=getDb(),catalog=db.collection('productCatalog'),unitProducts=db.collection('units').doc(m.unitId).collection('products');
  if(req.body?.action==='status'){
   const all=await unitProducts.limit(201).get();
   if(all.size>200)return send(res,409,'Catálogo acima de 200 registros: conciliação paginada necessária.');
   const rows=all.docs.map(doc=>({id:doc.id,...doc.data()}));
   return send(res,200,'Situação e possíveis conflitos de cadastro.',{items:draft.map(p=>{
    const matches=rows.filter(row=>row.catalogId===p.id||normalizeName(row.name)===normalizeName(p.name));
    const active=matches.some(row=>row.catalogId===p.id&&row.status==='active'&&row.operationalCatalogVersion==='56-v1');
    return {id:p.id,active,needsReconciliation:matches.length>0&&!active||matches.length>1,
      matches:matches.map(row=>({id:row.id,name:row.name,catalogId:row.catalogId||null,status:row.status||null,version:row.operationalCatalogVersion||null}))};
   })});
  }
  if(req.body?.action!=='activate')return send(res,400,'Ação inválida.');
  if(!['admin','manager','submanager'].includes(m.role))return send(res,403,'Sem permissão.');
  const {id,name,category,stockUnit,operationalUnit,receivingUnit,source,trackExpiry,minStock,countFrequency,critical,reviewConfirmed}=req.body;
  const candidate=byId.get(id);
  if(!candidate||name!==candidate.name||category!==candidate.category||!units.has(stockUnit)||
     !units.has(operationalUnit)||!['supplier','internal'].includes(source)||
     (source==='supplier'&&!units.has(receivingUnit))||typeof trackExpiry!=='boolean'||typeof minStock!=='number'||!Number.isFinite(minStock)||minStock<0||minStock>100000000||!['daily','weekly','on_demand'].includes(countFrequency)||typeof critical!=='boolean'||reviewConfirmed!==true)
   return send(res,400,'Confirme as informações do produto antes de ativar.');
  // Avoid automatic conversions between unlike units: configured receipt and count must match the stock unit.
  if(operationalUnit!==stockUnit||(source==='supplier'&&receivingUnit!==stockUnit))
   return send(res,409,'Unidades diferentes exigem regra de conversão homologada. Use a mesma unidade para ativar.');
  const ref=unitProducts.doc(hash(name)),centralRef=catalog.doc(id),memberRef=db.collection('memberships').doc(actor.uid);
  const now=new Date();
  await db.runTransaction(async tx=>{
   const [member,existing,central,all]=await Promise.all([tx.get(memberRef),tx.get(ref),tx.get(centralRef),tx.get(unitProducts.limit(201))]);
   if(all.size>200)throw Error('CATALOG_LIMIT');
   if(all.docs.some(doc=>doc.id!==ref.id&&(doc.data().catalogId===id||normalizeName(doc.data().name)===normalizeName(name))))throw Error('CATALOG_CONFLICT');
   if(!member.exists||member.data().status!=='active'||member.data().unitId!==m.unitId||
      !['admin','manager','submanager'].includes(member.data().role))throw Error('FORBIDDEN');
   if(existing.exists&&existing.data().catalogId===id&&existing.data().status==='active')throw Error('ALREADY_ACTIVE');
   if(existing.exists&&existing.data().catalogId!==id)throw Error('CATALOG_CONFLICT');
   if(central.exists&&central.data().name!==name)throw Error('CATALOG_CONFLICT');
   const record={id,name,category,type:source==='internal'?'prepared':'raw',source,stockUnit,
    operationalUnit,receivingUnit:source==='supplier'?receivingUnit:null,trackExpiry,
    schemaVersion:2,reviewRequired:false,ingredientsPending:source==='internal',active:true,
    brandId:'triamicci',approvedBy:actor.uid,approvedAt:now,updatedAt:now};
   if(central.exists)tx.update(centralRef,record);else tx.create(centralRef,{...record,createdAt:now});
   if(existing.exists){
     tx.update(ref,{status:'active',operationalCatalogVersion:'56-v1',minStock,countFrequency,critical,updatedAt:now,updatedBy:actor.uid});
   }else tx.create(ref,{name,category,unit:stockUnit,minStock,countFrequency,critical,trackExpiry,quantity:0,status:'active',operationalCatalogVersion:'56-v1',
     catalogId:id,productType:record.type,relatedCatalogIds:[],createdAt:now,createdBy:actor.uid,updatedAt:now});
   tx.create(db.collection('auditLogs').doc(),{event:'catalog.manual_activation',unitId:m.unitId,
     productId:ref.id,catalogId:id,actorUid:actor.uid,at:now});
  });
  return send(res,200,'Produto ativado com estoque inicial zero.',{id});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='ALREADY_ACTIVE')return send(res,409,'Este insumo já está cadastrado e ativo; não é permitido duplicar.');
  if(e.message==='CATALOG_LIMIT')return send(res,409,'Catálogo acima de 200 registros: concilie antes de ativar.');
  if(e.message==='CATALOG_CONFLICT')return send(res,409,'Produto experimental conflitante; não foi alterado.');
  console.error('Operational catalog setup:',e.message);
  return send(res,500,'Falha ao ativar o produto.');
 }
}
