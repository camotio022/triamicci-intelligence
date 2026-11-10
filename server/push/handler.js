import {authenticate,membership,getDb,checkRequest,send} from '../_lib.js';
import {deviceId,validSubscription} from './policy.js';
import {pushConfigured,queuePush,tryDrainPush} from './delivery.js';
export default async function handler(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(actor.terminalSessionId)return send(res,403,'Ative avisos somente no seu aparelho pessoal.');
  if(!member)return send(res,403,'Vínculo ativo necessário.');
  const {subscription}=req.body||{},db=getDb();
  const action=String(req.body?.action||'').slice(4).replace(/^./,s=>s.toLowerCase());
  if(action==='configuration')return send(res,200,'Configuração de notificações.',{configured:pushConfigured(),publicKey:pushConfigured()?process.env.WEB_PUSH_PUBLIC_KEY:null});
  if(!validSubscription(subscription))return send(res,400,'Dispositivo de notificações inválido.');
  const ref=db.doc('pushDevices/'+deviceId(subscription.endpoint));
  if(action==='unsubscribe'){
   await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.uid===actor.uid)tx.delete(ref)});
   return send(res,200,'Notificações desativadas neste dispositivo.');
  }
  if(!pushConfigured())return send(res,503,'Notificações ainda estão sendo preparadas.');
  if(action==='subscribe'){
   await db.runTransaction(async tx=>{
    const [current,devices]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(db.collection('pushDevices').where('uid','==',actor.uid))]);
    if(current.data()?.status!=='active'||current.data()?.unitId!==member.unitId)throw Error('FORBIDDEN');
    if(devices.size>=10&&!devices.docs.some(d=>d.id===ref.id))throw Error('DEVICE_LIMIT');
    tx.set(ref,{uid:actor.uid,unitId:member.unitId,subscription:{endpoint:subscription.endpoint,keys:subscription.keys},updatedAt:new Date()});
   });
   return send(res,200,'Notificações ativadas neste dispositivo.');
  }
  if(action==='test'){
   const device=await ref.get();
   if(device.data()?.uid!==actor.uid||device.data()?.unitId!==member.unitId)return send(res,403,'Ative este dispositivo primeiro.');
   const rate=db.doc(`units/${member.unitId}/pushTestLimits/${actor.uid}`),eventId='test_'+actor.uid+'_'+Math.floor(Date.now()/60000);
   await db.runTransaction(async tx=>{const prior=await tx.get(rate);if(prior.data()?.at.toMillis()>Date.now()-60000)throw Error('RATE_LIMIT');tx.set(rate,{at:new Date()});queuePush(tx,db,member.unitId,eventId,{targetDevice:ref.id,uid:actor.uid,title:'Notificações do Triamicci ativadas',page:'my-profile'})});
   await tryDrainPush(member.unitId,eventId);
   const result=await db.doc(`units/${member.unitId}/pushOutbox/${eventId}`).get();
   return send(res,result.data()?.state==='sent'?200:202,result.data()?.state==='sent'?'Teste enviado. Confira as notificações deste dispositivo.':'Teste na fila. O serviço de notificações ainda não confirmou o envio.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');if(e.message==='RATE_LIMIT')return send(res,429,'Aguarde um minuto antes de repetir o teste.');if(e.message==='DEVICE_LIMIT')return send(res,409,'Limite de dez dispositivos atingido.');console.error('Push registration failed');return send(res,500,'Não foi possível configurar as notificações.');}
}
