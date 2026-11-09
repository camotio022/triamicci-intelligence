import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {sendQuotaError} from '../quota-error.js';
import {signalUnitChange} from '../live-signal.js';
import {STOCK_UNITS} from '../operations/unit-engine.js';
import {validateUnifiedBalance,applyStorageConsumption} from './balance-engine.js';

const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(x);
const validProduct=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const quantityOk=(n,unit)=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=1e8&&(!['un','duzia','porcao','pacote'].includes(unit)||Number.isInteger(n));
const unitOf=p=>[p.operationalUnitOverride,p.profile?.countUnit,p.operationalUnit,p.unit].find(x=>STOCK_UNITS.includes(x))||null;
const round=n=>Math.round(n*1000)/1000;
export function availableReceiptQuantity({total=0,used=0,quantity=0}){
 if(!Number.isFinite(total)||!Number.isFinite(used)||!Number.isFinite(quantity)||total<0||used<0||quantity<=0||used+quantity>total+1e-9)return {ok:false,reason:'OVER_ALLOCATED'};
 return {ok:true,remaining:round(total-used-quantity)};
}
export default async function storageProduction(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo de unidade obrigatório.');
  const root=getDb().collection('units').doc(m.unitId),action=req.body?.action;
  if(action==='storageProductionOptions'){
   const [shipments,runs]=await Promise.all([
    root.collection('storageReceiptsV1').where('status','==','pending').limit(51).get(),
    root.collection('storageProductionV1').orderBy('at','desc').limit(31).get()
   ]);
   if(shipments.size>50)return send(res,409,'Muitos recebimentos pendentes; revise antes de continuar.');
   return send(res,200,'Origens e preparações consultadas.',{
    shipments:shipments.docs.map(d=>({id:d.id,supplier:d.data().supplier,createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null,lines:(d.data().lines||[]).map((l,i)=>({lineIndex:i,productId:l.productId,productName:l.productName,stockQuantity:l.stockQuantity,stockUnit:l.stockUnit}))})),
    runs:runs.docs.map(d=>({id:d.id,...d.data(),at:d.data().at?.toDate?.()?.toISOString?.()||null})),legacyStockUnchanged:true
   });
  }
  if(action!=='storagePrepare')return send(res,400,'Ação inválida.');
  const {requestId,sourceType,shipmentId=null,lineIndex=null,sourceProductId,sourceStorageId=null,sourceQuantity,outputProductId,outputStorageId,outputQuantity,notes=''}=req.body||{};
  if(!validId(requestId)||!['shipment','stored'].includes(sourceType)||!validProduct(sourceProductId)||!validProduct(outputProductId)||!validId(outputStorageId)||sourceType==='shipment'&&(!validId(shipmentId)||!Number.isInteger(lineIndex)||lineIndex<0||lineIndex>19)||sourceType==='stored'&&!validId(sourceStorageId)||typeof notes!=='string'||notes.length>240)return send(res,400,'Revise origem, insumos e quantidades.');
  const db=getDb(),runs=root.collection('storageProductionV1'),runRef=runs.doc(requestId),sourceRef=root.collection('products').doc(sourceProductId),outputRef=root.collection('products').doc(outputProductId),outputSpace=root.collection('storageSpacesV1').doc(outputStorageId),outputLink=root.collection('storageLinksV1').doc(outputProductId);
  const shipmentRef=sourceType==='shipment'?root.collection('storageReceiptsV1').doc(shipmentId):null;
  const sourceBalanceRef=sourceType==='stored'?root.collection('storageBalancesV1').doc(sourceProductId):null;
  const sourceLinkRef=sourceType==='stored'?root.collection('storageLinksV1').doc(sourceProductId):null;
  const allocationRef=sourceType==='shipment'?root.collection('storageReceiptAllocationsV1').doc(createHash('sha256').update(shipmentId+'|'+lineIndex).digest('hex')):null;
  let saved;
  await db.runTransaction(async tx=>{
   const refs=[db.doc('memberships/'+actor.uid),runRef,sourceRef,outputRef,outputSpace,outputLink,...(shipmentRef?[shipmentRef,allocationRef]:[sourceBalanceRef,sourceLinkRef])];
   const docs=await tx.getAll(...refs);
   const [who,run,source,output,destination,destinationLink,entry,allocationOrLink]=docs;
   if(who.data()?.status!=='active'||who.data()?.unitId!==m.unitId||!['admin','manager','submanager','cook','auxiliar'].includes(who.data()?.role))throw Error('FORBIDDEN');
   if(run.exists)throw Error('CONFLICT');
   if(!source.exists||source.data().status!=='active'||!output.exists||output.data().status!=='active'||!destination.exists||destination.data().active===false||!destinationLink.data()?.allowedStorageIds?.includes(outputStorageId))throw Error('CONFIGURATION');
   const fromUnit=unitOf(source.data()),toUnit=unitOf(output.data());
   if(!fromUnit||!toUnit||!quantityOk(sourceQuantity,fromUnit)||!quantityOk(outputQuantity,toUnit))throw Error('QUANTITY');
   let nextBalance=null,remaining=null;
   if(sourceType==='shipment'){
    if(!entry.exists||entry.data().status!=='pending')throw Error('RECEIPT');
    const line=entry.data().lines?.[lineIndex];
    if(!line||line.productId!==sourceProductId||line.stockUnit!==fromUnit)throw Error('RECEIPT');
    const used=allocationOrLink.data()?.allocatedQuantity||0;
    const available=availableReceiptQuantity({total:line.stockQuantity,used,quantity:sourceQuantity});
    if(!available.ok)throw Error('INSUFFICIENT');
    remaining=available.remaining;
    tx.set(allocationRef,{shipmentId,lineIndex,sourceProductId,unit:fromUnit,allocatedQuantity:round(used+sourceQuantity),updatedAt:new Date()},{merge:true});
   }else{
    if(!entry.exists||!validateUnifiedBalance(entry.data())||entry.data().unit!==fromUnit||!allocationOrLink.data()?.allowedStorageIds?.includes(sourceStorageId))throw Error('BALANCE');
    const consumed=applyStorageConsumption(entry.data(),{storageId:sourceStorageId,quantity:sourceQuantity,unit:fromUnit});
    if(!consumed.ok)throw Error('INSUFFICIENT');
    nextBalance={...consumed.balance,productId:sourceProductId,version:(entry.data().version||0)+1,updatedAt:new Date(),lastOperation:{type:'PRODUCTION_INPUT',operationId:requestId,actorUid:actor.uid}};
    tx.set(sourceBalanceRef,nextBalance);
   }
   const now=new Date();
   tx.create(runRef,{type:'PREPARATION',sourceType,sourceProductId,sourceStorageId:sourceType==='stored'?sourceStorageId:null,shipmentId:sourceType==='shipment'?shipmentId:null,lineIndex:sourceType==='shipment'?lineIndex:null,sourceQuantity,sourceUnit:fromUnit,outputProductId,outputStorageId,outputQuantity,outputUnit:toUnit,notes:notes.trim(),actorUid:actor.uid,at:now,status:'awaiting_output_count',affectsLegacyStock:false});
   tx.create(db.collection('auditLogs').doc(),{event:'storage.production_recorded',unitId:m.unitId,operationId:requestId,actorUid:actor.uid,at:now,sourceType,sourceProductId,outputProductId,sourceQuantity,outputQuantity});
   signalUnitChange(tx,db,m.unitId,['stock','production']);
   saved={id:requestId,sourceType,remaining,outputQuantity,outputUnit:toUnit,sourceStockVersion:nextBalance?.version??null};
  });
  return send(res,200,'Preparação registrada. O resultado deve ser contado e validado pela gestão.',{production:saved,legacyStockUnchanged:true});
 }catch(e){
  if(sendQuotaError(res,e))return;
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  const errors={FORBIDDEN:[403,'Sem permissão.'],CONFLICT:[409,'Preparação já registrada.'],CONFIGURATION:[409,'Configure ambos os insumos e seus armazenamentos.'],QUANTITY:[400,'Quantidades ou unidades incompatíveis.'],RECEIPT:[409,'Recebimento pendente ou item indisponível.'],BALANCE:[409,'Saldo inicial ainda não validado pela gestão.'],INSUFFICIENT:[409,'Quantidade superior à disponível.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('Storage preparation:',e.message);
  return send(res,500,'Não foi possível registrar a preparação.');
 }
}
