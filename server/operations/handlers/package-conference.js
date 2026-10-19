// Registro auditável de conferência por apresentação. Não modifica saldos físicos.
import {getDb,authenticate,membership,checkRequest,send} from '../../_lib.js';
import {validateConference} from '../package-conference.js';
const id=/^[a-f0-9]{40}$/;
const requestId=/^[a-f0-9-]{36}$/i;
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  if(req.body?.action!=='record'||!id.test(req.body?.productId||'')||!requestId.test(req.body?.requestId||''))return send(res,400,'Conferência inválida.');
  const {productId,requestId:rid,area}=req.body;
  if(!['reserva','giro'].includes(area))return send(res,400,'Selecione Reserva ou Giro para a conferência.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const product=unit.collection('products').doc(productId),profile=unit.collection('measurementProfiles').doc(productId);
  const count=unit.collection('packageConferences').doc(rid),actorRef=db.doc('memberships/'+actor.uid);
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const [a,p,config,existing]=await Promise.all([tx.get(actorRef),tx.get(product),tx.get(profile),tx.get(count)]);
   const member=a.data();
   if(!member||member.status!=='active'||member.unitId!==m.unitId)throw Error('FORBIDDEN');
   if(!p.exists||p.data().status!=='active')throw Error('NOT_FOUND');
   if(!config.exists)throw Error('PROFILE_MISSING');
   const method=config.data().countingMethod;
   if(method?.kind!=='packages')throw Error('COUNTING_NOT_CONFIGURED');
   const result=validateConference({method,packages:config.data().packages,closed:req.body.closed,opened:req.body.opened,presentation:req.body.presentation});
   if(!result.ok)throw Error('INVALID');
   if(req.body.profileVersion!==config.data().version)throw Error('VERSION_CONFLICT');
   if(existing.exists){
    const old=existing.data();
    if(old.actorUid!==actor.uid||old.productId!==productId||old.profileVersion!==config.data().version||
      old.closed!==result.closed||old.opened!==result.opened||old.presentation!==result.presentation||old.area!==area)throw Error('CONFLICT');
    duplicate=true;return;
   }
   const now=new Date(),record={productId,productName:p.data().name,unitId:m.unitId,actorUid:actor.uid,
    profileVersion:config.data().version,area,presentation:result.presentation,closed:result.closed,opened:result.opened,
    remainderStatus:result.opened>0?'UNKNOWN':'NONE',stockEffect:'NONE',at:now};
   tx.create(count,record);
   tx.create(db.collection('auditLogs').doc(),{event:'physical.package_conference_recorded',unitId:m.unitId,
     productId,operationId:rid,actorUid:actor.uid,details:record,at:now});
  });
  return send(res,200,duplicate?'Conferência já registrada.':'Conferência registrada sem movimentar saldos.',{duplicate,conferenceId:rid});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Acesso negado.');
  if(e.message==='NOT_FOUND')return send(res,404,'Produto não encontrado.');
  if(e.message==='PROFILE_MISSING'||e.message==='COUNTING_NOT_CONFIGURED')return send(res,409,'Configure o método de contagem do produto antes de registrar.');
  if(e.message==='VERSION_CONFLICT'||e.message==='CONFLICT')return send(res,409,'Conferência desatualizada ou já registrada com outros dados.');
  if(e.message==='INVALID')return send(res,400,'Dados de conferência incompatíveis com o cadastro.');
  console.error('Package conference:',e.message);return send(res,500,'Falha ao registrar conferência.');
 }
}
