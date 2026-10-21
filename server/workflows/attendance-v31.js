import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {restaurantDay} from '../schedules/restaurant-today.js';
import {TEAM_ROLES,MANAGEMENT_ROLES} from '../permissions/v31-policy.js';
const next={not_started:['clock_in'],working:['break_start','clock_out'],on_break:['break_end'],finished:[]};
export function attendanceTransition(current,action){return (next[current]||[]).includes(action)?({clock_in:'working',break_start:'on_break',break_end:'working',clock_out:'finished'})[action]:null;}
export default async function attendanceWorkflow(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const user=await authenticate(req),m=await membership(user.uid);
  if(!m?.unitId||!TEAM_ROLES.includes(m.role))return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),actorRef=db.doc('memberships/'+user.uid),day=restaurantDay(),action=req.body?.action;
  const ref=unit.collection('attendanceV31').doc(day+'_'+user.uid);
  if(action==='today'){
   const snap=await ref.get(),record=snap.data()||null;
   return send(res,200,'Sua presença de hoje.',{day,record:record?{status:record.status,events:record.events||[],day}:null});
  }
  if(!['clock_in','break_start','break_end','clock_out'].includes(action))return send(res,400,'Ação de presença desconhecida.');
  const requestId=req.body?.requestId;
  if(typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId))return send(res,400,'Identificador inválido.');
  let result,duplicate=false;
  await db.runTransaction(async tx=>{
   const [actor,prior]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
   if(!actor.exists||actor.data().status!=='active'||actor.data().unitId!==m.unitId||!TEAM_ROLES.includes(actor.data().role))throw Error('FORBIDDEN');
   const old=prior.data()||{status:'not_started',events:[]};
   if(old.events.some(e=>e.requestId===requestId)){
    if(old.events.find(e=>e.requestId===requestId).action!==action)throw Error('CONFLICT');
    result=old.status;duplicate=true;return;
   }
   const status=attendanceTransition(old.status,action);
   if(!status)throw Error('INVALID_TRANSITION');
   const at=new Date(),event={action,requestId,at,by:user.uid};
   tx.set(ref,{uid:user.uid,unitId:m.unitId,day,status,events:[...old.events,event],updatedAt:at},{merge:true});
   tx.create(db.collection('auditLogs').doc(),{event:'attendance.'+action,unitId:m.unitId,actorUid:user.uid,at,details:{day,requestId}});
   result=status;
  });
  return send(res,200,duplicate?'Registro já confirmado.':'Registro de presença confirmado.',{day,status:result,duplicate});
 }catch(e){
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='INVALID_TRANSITION')return send(res,409,'Esta ação não corresponde à sua situação atual.');
  if(e.message==='CONFLICT')return send(res,409,'Registro com identificador diferente.');
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');
  console.error('attendance V3.1',e.message);return send(res,500,'Não foi possível registrar a presença.');
 }
}
