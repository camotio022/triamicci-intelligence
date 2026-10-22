import investigation from '../../server/operations/investigation.js';
import {signalUnitChange} from '../../server/live-signal.js';
import kitchenV3 from '../../server/operations/v3-service.js';
import packageConferenceHandler from '../../server/operations/handlers/package-conference.js';
import packageReviewHandler from '../../server/operations/handlers/package-review.js';
import packageApplyHandler from '../../server/operations/handlers/package-apply.js';
import {createHash} from 'node:crypto';
import dispatchHandler from '../../server/operations/dispatch.js';
import dailyReport from '../../server/operations/daily-report.js';
import inventoryToday from '../../server/operations/inventory-today.js';
import inventoryClosure from '../../server/operations/inventory-closure.js';
import transferHandler from '../../server/operations/transfer.js';
import reconcileLotsHandler from '../../server/operations/reconcile-lots.js';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
import {countUnit,validQuantity,commercialDelivery} from '../../server/operations/logic.js';

// Ledger físico independente dos saldos legados até conciliação e migração homologadas.
const idPattern=/^[a-f0-9]{40}$/;
const reqPattern=/^[a-f0-9-]{36}$/i;
const nonnegative=x=>validQuantity(x,{allowZero:true});
const positive=x=>validQuantity(x);
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
 if(typeof req.body?.action==='string'&&req.body.action.startsWith('v3'))return kitchenV3(req,res);
 const subaction=req.body?.action;
 if(['investigationGet','investigationSave','investigationApprove','investigationReject'].includes(subaction))return investigation(req,res);
 if(subaction==='packageRecord'||subaction==='packagePreview'||subaction==='packageApply'){
  req.body.action=({packageRecord:'record',packagePreview:'preview',packageApply:'apply'})[subaction];
  return ({packageRecord:packageConferenceHandler,packagePreview:packageReviewHandler,packageApply:packageApplyHandler})[subaction](req,res);
 }

 if(['closeSubmit','closeApprove','closeReject','closeList'].includes(subaction))return inventoryClosure(req,res);
 if(subaction==='dailyReport')return dailyReport(req,res);
 if(subaction==='todayCounts')return inventoryToday(req,res);
 if(subaction==='dispatch')return dispatchHandler(req,res);
 if(subaction==='transfer')return transferHandler(req,res);
 if(subaction==='reconcile')return reconcileLotsHandler(req,res);
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),actorRef=db.doc('memberships/'+actor.uid);
  const {action}=req.body||{};
  if(action==='productActivity'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const product=await unit.collection('products').doc(id).get();
   if(!product.exists)throw Error('NOT_FOUND');
   const [receipts,counts,outflows,transfers,productions]=await Promise.all([
    unit.collection('physicalReceipts').where('productId','==',id).limit(100).get(),
    unit.collection('physicalCounts').where('productId','==',id).limit(100).get(),
    unit.collection('physicalOutflows').where('productId','==',id).limit(100).get(),
    unit.collection('physicalTransfers').where('productId','==',id).limit(100).get(),
    unit.collection('productionRuns').orderBy('at','desc').limit(100).get()
   ]);
   const records=[...receipts.docs.map(d=>({...clean(d),kind:'receive'})),
     ...counts.docs.map(d=>({...clean(d),kind:'count'})),
     ...outflows.docs.map(d=>({...clean(d),kind:'dispatch'})),
     ...transfers.docs.map(d=>({...clean(d),kind:'transfer'})),
     ...productions.docs.filter(d=>d.data().items?.some(i=>i.productId===id)).map(d=>({...clean(d),kind:'production'}))]
     .sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,30);
   return send(res,200,'Atividade deste produto.',{records,
    limited:[receipts,counts,outflows,transfers,productions].some(x=>x.size===100)});
  }
  if(action==='lots'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const product=await unit.collection('products').doc(id).get();
   if(!product.exists)throw Error('NOT_FOUND');
   const snap=await unit.collection('physicalLots').doc(id).collection('lots').orderBy('expiryDate').limit(100).get();
   return send(res,200,'Lotes de recebimento consultados.',{lots:snap.docs.map(d=>({id:d.id,...d.data()})),
    note:'Quantidades recebidas por lote. Não representam saldo disponível nem possuem baixa FEFO.'});
  }
  if(action==='summary'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const p=await unit.collection('products').doc(id).get();
   if(!p.exists)throw Error('NOT_FOUND');
   const [catalogSnap,balanceSnap]=await Promise.all([
    p.data().catalogId?db.collection('productCatalog').doc(p.data().catalogId).get():Promise.resolve(null),
    unit.collection('physicalBalances').doc(id).get()
   ]);
   const unitName=physicalUnit(p.data(),catalogSnap?.data());
   const b=balanceSnap.data();
   if(b&&Number.isFinite(b.countedTotal)){
    const compatible=b.unit===unitName;
    return send(res,200,'Resumo físico carregado dos acumulados auditados.',{summary:{
     complete:compatible,reason:compatible?null:'A contagem está numa unidade diferente do catálogo.',
     unit:unitName,
     previous:{reserve:b.countedReserve,rotation:b.countedRotation,total:b.countedTotal,
      at:iso(b.at)},
     lastDelivery:b.lastDelivery||null,
     entriesSincePrevious:compatible?(b.entriesSinceCount||0):null,
     exitsSincePrevious:compatible?(b.exitsSinceCount||0):null
    }});
   }
   const [cSnap,rSnap,oSnap]=await Promise.all([
    unit.collection('physicalCounts').where('productId','==',id).limit(501).get(),
    unit.collection('physicalReceipts').where('productId','==',id).limit(501).get(),
    unit.collection('physicalOutflows').where('productId','==',id).limit(501).get()
   ]);
   if(cSnap.size>500||rSnap.size>500||oSnap.size>500)return send(res,200,'Histórico muito extenso para conciliação simples.',{
    summary:{complete:false,reason:'Há mais de 500 registros. É necessário paginar para calcular com segurança.'}});
   const counts=cSnap.docs.map(x=>x.data()).sort((a,b)=>b.at.toMillis()-a.at.toMillis());
   const receipts=rSnap.docs.map(x=>x.data()).sort((a,b)=>b.at.toMillis()-a.at.toMillis());
   const outflows=oSnap.docs.map(x=>x.data());
   const last=counts[0]||null,lastDelivery=receipts[0]||null;
   const sinceLast=last?receipts.filter(x=>x.at.toMillis()>last.at.toMillis()):[];
   const compatible=!last||last.unit===unitName&&sinceLast.every(x=>x.unit===unitName);
   const incoming=compatible?sinceLast:[];
   const leaving=last?outflows.filter(x=>x.at.toMillis()>last.at.toMillis()):[];
   const allCompatible=compatible&&leaving.every(x=>x.unit===unitName);
   return send(res,200,'Resumo físico consultado.',{summary:{
    complete:allCompatible,reason:allCompatible?null:'A última contagem ou as entregas posteriores têm unidades diferentes; não converter automaticamente.',
    unit:unitName,previous: last?{reserve:last.reserve,rotation:last.rotation,
      total:last.reserve+last.rotation,at:iso(last.at)}:null,
    lastDelivery:lastDelivery?{physicalQuantity:lastDelivery.physicalQuantity,unit:lastDelivery.unit,
      at:iso(lastDelivery.at),supplier:lastDelivery.supplier}:null,
    entriesSincePrevious:last&&allCompatible?Number(incoming.reduce((n,x)=>n+x.physicalQuantity,0).toFixed(3)):null,
    exitsSincePrevious:last&&allCompatible?Number(leaving.reduce((n,x)=>n+x.quantity,0).toFixed(3)):null
   }});
  }
  if(action==='list'){
   const size=30;
   const types=[['receipts','physicalReceipts'],['counts','physicalCounts'],
    ['outflows','physicalOutflows'],['transfers','physicalTransfers'],['productions','productionRuns']];
   const result={};
   await Promise.all(types.map(async([key,col])=>{
    if(req.body?.['skip'+key]){result[key]=[];result['hasMore_'+key]=false;return}
    const before=req.body?.['before_'+key];
    if(before!==undefined&&(typeof before!=='string'||!Number.isFinite(Date.parse(before))))throw Error('INVALID');
    let q=unit.collection(col).orderBy('at','desc');
    if(before)q=q.where('at','<',new Date(before));
    const snap=await q.limit(size+1).get();
    result[key]=snap.docs.slice(0,size).map(clean);
    result['hasMore_'+key]=snap.size>size;
   }));
   return send(res,200,'Histórico físico carregado.',result);
  }
  if(!['receive','count'].includes(action))return send(res,400,'Ação inválida.');
  const {productId,requestId}=req.body||{};
  if(!idPattern.test(productId||'')||!reqPattern.test(requestId||''))throw Error('INVALID');
  if(!['admin','manager','submanager'].includes(m.role))throw Error('FORBIDDEN');
  const productRef=unit.collection('products').doc(productId);
  const ref=unit.collection(action==='receive'?'physicalReceipts':'physicalCounts').doc(requestId);
  const auditRef=db.collection('auditLogs').doc();
  const balanceRef=unit.collection('physicalBalances').doc(productId);
  const lotRef=unit.collection('physicalLots').doc(productId).collection('lots');
  const batchRef=action==='receive'&&typeof req.body?.lot==='string'&&typeof req.body?.expiryDate==='string' ? lotRef.doc(createHash('sha256').update(req.body.lot.trim()+'|'+req.body.expiryDate).digest('hex')) : null;
  const payload= action==='receive'?
   {supplier:req.body.supplier,orderedQuantity:req.body.orderedQuantity,deliveredWeightKg:req.body.deliveredWeightKg,physicalQuantity:req.body.physicalQuantity,lot:req.body.lot,expiryDate:req.body.expiryDate,notes:req.body.notes||''}:
   {reserve:req.body.reserve,rotation:req.body.rotation,notes:req.body.notes||''};
  if(action==='receive'){
   if(!validText(payload.supplier)||!positive(payload.physicalQuantity)||
     !positive(payload.orderedQuantity)||
     !(payload.deliveredWeightKg===null||payload.deliveredWeightKg===undefined||positive(payload.deliveredWeightKg))||
     !validText(payload.notes,0,240))throw Error('INVALID');
  }else if(!nonnegative(payload.reserve)||!nonnegative(payload.rotation)||!validText(payload.notes,0,240))throw Error('INVALID');
  const now=new Date();let result;
  await db.runTransaction(async tx=>{
   const [actorSnap,pSnap,existing,balanceSnap,lotSnap]=await Promise.all([tx.get(actorRef),tx.get(productRef),tx.get(ref),tx.get(balanceRef),batchRef?tx.get(batchRef):Promise.resolve(null)]);
   const current=actorSnap.data();
   if(!current||current.status!=='active'||current.unitId!==m.unitId||
    !['admin','manager','submanager'].includes(current.role))throw Error('FORBIDDEN');
   if(!pSnap.exists)throw Error('NOT_FOUND');
   const p=pSnap.data();if(p.status!=='active')throw Error('INACTIVE');
   const central=p.catalogId?await tx.get(db.collection('productCatalog').doc(p.catalogId)):null;
   const unitName=physicalUnit(p,central?.data());
   if(unitName==='un'&&(action==='receive'? !Number.isInteger(payload.physicalQuantity):
    !Number.isInteger(payload.reserve)||!Number.isInteger(payload.rotation)))throw Error('INVALID');
   const receivingUnit=p.receivingUnitOverride||central?.data()?.receivingUnit||p.receivingUnit||p.unit;
   const commercial=action==='receive'?commercialDelivery({orderedQuantity:payload.orderedQuantity,
    physicalQuantity:payload.physicalQuantity,deliveredWeightKg:payload.deliveredWeightKg,
    receivingUnit,operationalUnit:unitName}):null;
   if(action==='receive'&&!commercial)throw Error('INVALID');
   if(action==='receive'&&p.trackExpiry===true){
    if(!validText(payload.lot,1,80)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(payload.expiryDate||'')||
     !Number.isFinite(Date.parse(payload.expiryDate+'T12:00:00Z'))||
     new Date(payload.expiryDate+'T12:00:00Z').toISOString().slice(0,10)!==payload.expiryDate||payload.expiryDate<now.toISOString().slice(0,10))throw Error('INVALID');
   }
   const record={...payload,...(commercial||{}),productId,productName:p.name,unit:unitName,
    actorUid:actor.uid,actorName:current.displayName||current.name||actor.email||actor.uid,
    unitId:m.unitId,at:now,kind:action,
    ...(action==='count'?{difference:balanceSnap?.exists?Math.round((balanceSnap.data().total-payload.reserve-payload.rotation)*1000)/1000:null}:{} )};
   if(existing.exists){
    const old=existing.data();
    if(old.actorUid!==actor.uid||old.productId!==productId||Object.keys(payload).some(k=>old[k]!==payload[k]))throw Error('CONFLICT');
    result={id:requestId,duplicate:true,record:old};return;
   }
   if(action==='count'){
    const prior=balanceSnap?.data();
    if(prior?.at?.toMillis?.()>now.getTime())throw Error('CONFLICT');
    tx.set(balanceRef,{productId,productName:p.name,unit:unitName,
     reserve:payload.reserve,rotation:payload.rotation,total:payload.reserve+payload.rotation,
     countedReserve:payload.reserve,countedRotation:payload.rotation,
     countedTotal:payload.reserve+payload.rotation,entriesSinceCount:0,exitsSinceCount:0,
     countId:requestId,actorUid:actor.uid,at:now});
   }
   if(action==='receive'&&balanceSnap?.exists){
    const oldBalance=balanceSnap.data();
    if(oldBalance.unit!==unitName)throw Error('CONFLICT');
    const nextReserve=Number((oldBalance.reserve+payload.physicalQuantity).toFixed(3));
    const nextTotal=Number((oldBalance.total+payload.physicalQuantity).toFixed(3));
    if(!nonnegative(nextReserve)||!nonnegative(nextTotal))throw Error('INVALID');
    tx.update(balanceRef,{reserve:nextReserve,total:nextTotal,
      ...(Number.isFinite(oldBalance.countedTotal)?{entriesSinceCount:
       Math.round(((oldBalance.entriesSinceCount||0)+payload.physicalQuantity)*1000)/1000}:{}),
      lastDelivery:{physicalQuantity:payload.physicalQuantity,unit:unitName,
       supplier:payload.supplier,at:now.toISOString()},
      lastReceiptId:requestId,lastMovementAt:now});
   }
   if(action==='receive'&&p.trackExpiry===true){
    const oldAmount=lotSnap?.exists?lotSnap.data().receivedQuantity:0;
    if(!Number.isFinite(oldAmount)||oldAmount<0||oldAmount+payload.physicalQuantity>100000000)throw Error('INVALID');
    const priorReserve=Number.isFinite(lotSnap?.data()?.reserva)?lotSnap.data().reserva:0;
    const priorRotation=Number.isFinite(lotSnap?.data()?.giro)?lotSnap.data().giro:0;
    tx.set(batchRef,{lot:payload.lot.trim(),expiryDate:payload.expiryDate,productId,
      productName:p.name,unit:unitName,receivedQuantity:Math.round((oldAmount+payload.physicalQuantity)*1000)/1000,
      reserva:Math.round((priorReserve+payload.physicalQuantity)*1000)/1000,giro:priorRotation,
      availableQuantity:Math.round((priorReserve+priorRotation+payload.physicalQuantity)*1000)/1000,
      lastReceiptId:requestId,updatedAt:now},{merge:true});
   }
   tx.create(ref,record);
   signalUnitChange(tx,db,m.unitId);
   tx.create(auditRef,{event:action==='receive'?'physical.received':'physical.counted',unitId:m.unitId,
    productId,actorUid:actor.uid,operationId:requestId,details:payload,at:now});
   result={id:requestId,duplicate:false,record};
  });
  return send(res,200,result.duplicate?'Registro já existente.':'Registro físico salvo no Firebase.',{operation:{id:result.id,duplicate:result.duplicate}});
 }catch(e){return error(res,e)}
}
