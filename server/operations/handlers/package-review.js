import {sendQuotaError} from '../../quota-error.js';
// Prévia de homologação: leitura e cálculo apenas. Nunca altera physicalBalances ou physicalLots.
import {getDb,authenticate,membership,checkRequest,send} from '../../_lib.js';
import {reconcilePackageCount} from '../package-reconciliation.js';
import {countUnit} from '../logic.js';
import {areaTotals} from '../lot-logic.js';
import {reviewReadiness} from '../package-review-rules.js';
import {validateLotAllocation} from '../package-lot-allocation.js';
const productPattern=/^[a-f0-9]{40}$/;
const requestPattern=/^[a-f0-9-]{36}$/i;
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||!['admin','manager'].includes(m.role))return send(res,403,'Somente gerência pode revisar conciliações.');
  const {productId,conferenceId,openedMeasurements=[],lotAllocations=[]}=req.body||{};
  if(req.body?.action!=='preview'||!productPattern.test(productId||'')||!requestPattern.test(conferenceId||'')||!Array.isArray(openedMeasurements)||openedMeasurements.length>100||!Array.isArray(lotAllocations)||lotAllocations.length>100)
   return send(res,400,'Revisão inválida.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const [conference,profile,product,balance]=await Promise.all([
   unit.collection('packageConferences').doc(conferenceId).get(),
   unit.collection('measurementProfiles').doc(productId).get(),
   unit.collection('products').doc(productId).get(),
   unit.collection('physicalBalances').doc(productId).get()
  ]);
  if(!conference.exists||conference.data().productId!==productId||conference.data().unitId!==m.unitId||!product.exists||!profile.exists)
   return send(res,404,'Conferência ou configuração não encontrada.');
  const data=conference.data(),cfg=profile.data(),p=product.data(),method=cfg.countingMethod;
  if(!['reserva','giro'].includes(data.area))return send(res,409,'Conferência antiga sem área física; faça nova conferência por Reserva/Giro.');
  if(p.status!=='active'||method?.kind!=='packages'||method.presentation!==data.presentation||data.profileVersion!==cfg.version)
   return send(res,409,'Produto, método ou configuração foram alterados. Faça nova conferência.');
  const catalog=p.catalogId?await db.collection('productCatalog').doc(p.catalogId).get():null;
  const physicalUnit=countUnit(p,catalog?.data());
  const base=balance.data();
  if(!balance.exists||base.unit!==physicalUnit)return send(res,409,'Saldo ausente ou em outra unidade; recontagem e conciliação necessárias.');
  const rule=(cfg.packages||[]).find(x=>x.presentation===data.presentation);
  const computed=reconcilePackageCount({
   closed:data.closed,opened:data.opened,presentation:data.presentation,
   rule,profileVersion:cfg.version,stockUnit:physicalUnit,openedMeasurements
  });
  let lotStatus='NOT_TRACKED',lotAllocation=null;
  if(p.trackExpiry===true){
   const snap=await unit.collection('physicalLots').doc(productId).collection('lots').limit(101).get();
   const totals=snap.size<=100?areaTotals(snap.docs.map(d=>d.data())):null;
   lotStatus=totals&&totals.reserva===base.reserve&&totals.giro===base.rotation?'BALANCED':'NEEDS_LOT_RECONCILIATION';
   if(computed.ok&&lotStatus==='BALANCED'&&lotAllocations.length){
    lotAllocation=validateLotAllocation({area:data.area,quantity:computed.quantity,unit:physicalUnit,
     allocations:lotAllocations,lots:snap.docs.map(d=>({id:d.id,...d.data()}))});
   }
   if(!lotAllocation?.ok)lotStatus='NEEDS_EXPLICIT_LOT_ALLOCATION';
  }
  const readiness=reviewReadiness({review:computed,area:data.area,
   referenceBalance:base[data.area==='reserva'?'reserve':'rotation'],lotStatus,
   profileVersion:cfg.version,conferenceProfileVersion:data.profileVersion});
  const result={...computed,...readiness,lotStatus,lotAllocation,conferenceId,productId,area:data.area,referenceBalance:base[data.area==='reserva'?'reserve':'rotation'],referenceUnit:base.unit,
   requiresReview:true,stockEffect:'NONE'};
  return send(res,200,computed.ok?'Prévia calculada para avaliação gerencial.':'Prévia não conciliável.',{review:result});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(sendQuotaError(res,e))return;console.error('Package reconciliation review:',e.message);
  return send(res,500,'Não foi possível revisar a conferência.');
 }
}
