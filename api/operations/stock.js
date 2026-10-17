import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit,validQuantity,individualCatalogIds} from './logic.js';

// Ledger físico independente dos saldos legados até conciliação e migração homologadas.
const idPattern=/^[a-f0-9]{40}$/;
const reqPattern=/^[a-f0-9-]{36}$/i;
const nonnegative=x=>validQuantity(x,{allowZero:true});
const positive=x=>validQuantity(x);
const pieces=individualCatalogIds;
const physicalUnit=countUnit;
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=(doc)=>({id:doc.id,...doc.data(),at:iso(doc.data().at)});
const validText=(v,min=1,max=160)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max;
function error(res,e){
 const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],
 NOT_FOUND:[404,'Produto não vinculado à unidade.'],INACTIVE:[409,'Produto inativo.'],
 CONFLICT:[409,'Esta operação já foi registrada com outros dados.'],
 INVALID:[400,'Dados inválidos. Confira unidades, quantidades e campos obrigatórios.']};
 if(errors[e.message])return send(res,...errors[e.message]);
 console.error('Physical operations:',e.message);return send(res,500,'Não foi possível completar a operação.');
}
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),actorRef=db.doc('memberships/'+actor.uid);
  const {action}=req.body||{};
  if(action==='summary'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const p=await unit.collection('products').doc(id).get();
   if(!p.exists)throw Error('NOT_FOUND');
   const [cSnap,rSnap]=await Promise.all([
    unit.collection('physicalCounts').where('productId','==',id).limit(501).get(),
    unit.collection('physicalReceipts').where('productId','==',id).limit(501).get()
   ]);
   if(cSnap.size>500||rSnap.size>500)return send(res,200,'Histórico muito extenso para conciliação simples.',{
    summary:{complete:false,reason:'Há mais de 500 registros. É necessário paginar para calcular com segurança.'}});
   const counts=cSnap.docs.map(x=>x.data()).sort((a,b)=>b.at.toMillis()-a.at.toMillis());
   const receipts=rSnap.docs.map(x=>x.data()).sort((a,b)=>b.at.toMillis()-a.at.toMillis());
   const last=counts[0]||null,lastDelivery=receipts[0]||null;
   const unitName=physicalUnit(p.data());
   const compatible=receipts.every(x=>x.unit===unitName);
   const incoming=last?receipts.filter(x=>x.at.toMillis()>last.at.toMillis()&&x.unit===unitName):[];
   return send(res,200,'Resumo físico consultado.',{summary:{
    complete:compatible,reason:compatible?null:'Existem entradas com unidades diferentes; não converter automaticamente.',
    unit:unitName,previous: last?{reserve:last.reserve,rotation:last.rotation,
      total:last.reserve+last.rotation,at:iso(last.at)}:null,
    lastDelivery:lastDelivery?{physicalQuantity:lastDelivery.physicalQuantity,unit:lastDelivery.unit,
      at:iso(lastDelivery.at),supplier:lastDelivery.supplier}:null,
    entriesSincePrevious:compatible?Number(incoming.reduce((n,x)=>n+x.physicalQuantity,0).toFixed(3)):null
   }});
  }
  if(action==='list'){
   const [receipts,counts]=await Promise.all([
    unit.collection('physicalReceipts').orderBy('at','desc').limit(50).get(),
    unit.collection('physicalCounts').orderBy('at','desc').limit(50).get()]);
   return send(res,200,'Histórico físico carregado.',{receipts:receipts.docs.map(clean),counts:counts.docs.map(clean)});
  }
  if(!['receive','count'].includes(action))return send(res,400,'Ação inválida.');
  const {productId,requestId}=req.body||{};
  if(!idPattern.test(productId||'')||!reqPattern.test(requestId||''))throw Error('INVALID');
  if(action==='receive'&&!['admin','manager'].includes(m.role))throw Error('FORBIDDEN');
  const productRef=unit.collection('products').doc(productId);
  const ref=unit.collection(action==='receive'?'physicalReceipts':'physicalCounts').doc(requestId);
  const auditRef=db.collection('auditLogs').doc();
  const payload= action==='receive'?
   {supplier:req.body.supplier,orderedWeightKg:req.body.orderedWeightKg,deliveredWeightKg:req.body.deliveredWeightKg,physicalQuantity:req.body.physicalQuantity,lot:req.body.lot,expiryDate:req.body.expiryDate,notes:req.body.notes||''}:
   {reserve:req.body.reserve,rotation:req.body.rotation,notes:req.body.notes||''};
  if(action==='receive'){
   if(!validText(payload.supplier)||!positive(payload.physicalQuantity)||
     !(payload.orderedWeightKg===null||payload.orderedWeightKg===undefined||positive(payload.orderedWeightKg))||
     !(payload.deliveredWeightKg===null||payload.deliveredWeightKg===undefined||positive(payload.deliveredWeightKg))||
     !validText(payload.notes,0,240))throw Error('INVALID');
  }else if(!nonnegative(payload.reserve)||!nonnegative(payload.rotation)||!validText(payload.notes,0,240))throw Error('INVALID');
  const now=new Date();let result;
  await db.runTransaction(async tx=>{
   const [actorSnap,pSnap,existing]=await Promise.all([tx.get(actorRef),tx.get(productRef),tx.get(ref)]);
   const current=actorSnap.data();
   if(!current||current.status!=='active'||current.unitId!==m.unitId||
    (action==='receive'&&!['admin','manager'].includes(current.role)))throw Error('FORBIDDEN');
   if(!pSnap.exists)throw Error('NOT_FOUND');
   const p=pSnap.data();if(p.status!=='active')throw Error('INACTIVE');
   const unitName=physicalUnit(p);
   if(unitName==='un'&&(action==='receive'? !Number.isInteger(payload.physicalQuantity):
    !Number.isInteger(payload.reserve)||!Number.isInteger(payload.rotation)))throw Error('INVALID');
   if(action==='receive'&&pieces.has(p.catalogId)&&(!positive(payload.orderedWeightKg)||!positive(payload.deliveredWeightKg)))throw Error('INVALID');
   if(action==='receive'&&p.trackExpiry===true){
    if(!validText(payload.lot,1,80)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(payload.expiryDate||'')||
     !Number.isFinite(Date.parse(payload.expiryDate+'T12:00:00Z'))||
     new Date(payload.expiryDate+'T12:00:00Z').toISOString().slice(0,10)!==payload.expiryDate||payload.expiryDate<now.toISOString().slice(0,10))throw Error('INVALID');
   }
   const record={...payload,productId,productName:p.name,unit:unitName,
    actorUid:actor.uid,unitId:m.unitId,at:now,kind:action};
   if(existing.exists){
    const old=existing.data();
    if(old.actorUid!==actor.uid||old.productId!==productId||Object.keys(payload).some(k=>old[k]!==payload[k]))throw Error('CONFLICT');
    result={id:requestId,duplicate:true,record:old};return;
   }
   tx.create(ref,record);
   tx.create(auditRef,{event:action==='receive'?'physical.received':'physical.counted',unitId:m.unitId,
    productId,actorUid:actor.uid,operationId:requestId,details:payload,at:now});
   result={id:requestId,duplicate:false,record};
  });
  return send(res,200,result.duplicate?'Registro já existente.':'Registro físico salvo no Firebase.',{operation:{id:result.id,duplicate:result.duplicate}});
 }catch(e){return error(res,e)}
}
