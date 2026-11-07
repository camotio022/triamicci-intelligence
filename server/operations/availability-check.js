import {conferenceProfile} from './conference-profile.js';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {isOperationalProduct} from './catalog-identity.js';
import {TEAM_ROLES} from '../permissions/v31-policy.js';
import {signalUnitChange} from '../live-signal.js';
import {historyActor} from './history-names.js';
import {sendQuotaError} from '../quota-error.js';
export default async function availabilityCheck(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||!TEAM_ROLES.includes(m.role))return send(res,403,'Vínculo ativo necessário.');
  const {productId,location,observation,requestId}=req.body||{};
  if(!/^[a-f0-9]{40}$/.test(productId||'')||!['reserva','giro'].includes(location)||!['available','low','missing'].includes(observation)||!/^[a-f0-9-]{36}$/i.test(requestId||''))return send(res,400,'Confira o produto, local e disponibilidade.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),id=createHash('sha256').update(productId+':'+location).digest('hex'),at=new Date();
  const ref=unit.collection('availabilityChecks').doc(id),event=unit.collection('availabilityHistory').doc(requestId),signal=unit.collection('stockSignals').doc(id);
  await db.runTransaction(async tx=>{
   const [a,p,profile,old,previous]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(unit.collection('products').doc(productId)),tx.get(unit.collection('operationalProfiles').doc(productId)),tx.get(event),tx.get(signal)]);
   if(a.data()?.status!=='active'||a.data()?.unitId!==m.unitId||!TEAM_ROLES.includes(a.data()?.role))throw Error('FORBIDDEN');
   if(old.exists){const x=old.data();if(x.actorUid===actor.uid&&x.productId===productId&&x.location===location&&x.observation===observation)return;throw Error('CONFLICT');}
   if(!p.exists||!isOperationalProduct(p.data())||!conferenceProfile(p.data(),profile.data())?.locations?.includes(location))throw Error('MISSING');
   const record={productId,productName:p.data().name,location,observation,at,actorUid:actor.uid,actorName:historyActor(a.data(),actor),unitId:m.unitId,requestId};
   tx.set(ref,record);tx.create(event,record);
   // A positive check never clears a shortage awaiting a management decision.
   if(observation!=='available'){
    const prior=previous.data()||{};tx.set(signal,{productId,productName:p.data().name,location,status:'reported',observation,updatedAt:at,resolution:null,version:(prior.version||0)+1,reports:[...(prior.reports||[]).slice(-19),{actorUid:actor.uid,observation,at,note:'Conferência de disponibilidade'}]});
   }
   tx.create(db.collection('auditLogs').doc(),{event:'stock.availability_checked',actorUid:actor.uid,unitId:m.unitId,productId,location,observation,at});
   signalUnitChange(tx,db,m.unitId,['stock','notifications']);
  });
  return send(res,200,observation==='available'?'Disponibilidade registrada. Pendências anteriores continuam para revisão.':'Aviso enviado à equipe. Nenhuma quantidade foi alterada.');
 }catch(e){const errors={UNAUTHENTICATED:401,FORBIDDEN:403,MISSING:404,CONFLICT:409};if(errors[e.message])return send(res,errors[e.message],'Não foi possível registrar. Confira acesso, produto e atualização dos dados.');if(sendQuotaError(res,e))return;console.error('Availability check:',e.message);return send(res,500,'Não foi possível salvar a disponibilidade.');}
}
