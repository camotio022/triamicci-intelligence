import {authenticate,checkRequest,getDb,membership,send} from '../_lib.js';
import {sendQuotaError} from '../quota-error.js';
import {AI_ENABLED,requireAiAccess} from './permissions-v1.js';

const idPattern=/^[a-f0-9-]{36}$/i;
const safeText=v=>typeof v==='string'?v.slice(0,4000):'';
const root=(db,unitId,uid)=>db.collection('units').doc(unitId).collection('aiConversations').doc(uid).collection('threads');
const sanitize=messages=>Array.isArray(messages)?messages.slice(-24).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string')
  .map(m=>({role:m.role,text:safeText(m.text),hasPhoto:!!m.hasPhoto})):[];

export async function saveConversation(db,unitId,uid,threadId,question,answer,hasPhoto=false){
 if(!idPattern.test(threadId))return false;
 const ref=root(db,unitId,uid).doc(threadId),now=new Date();
 await db.runTransaction(async tx=>{
  const doc=await tx.get(ref),old=doc.exists?doc.data():{};
  const messages=sanitize(old.messages);
  messages.push({role:'user',text:question.slice(0,1800),hasPhoto:!!hasPhoto},{role:'assistant',text:answer.slice(0,4000),hasPhoto:false});
  tx.set(ref,{title:doc.exists?safeText(old.title).slice(0,65):question.slice(0,65),messages:messages.slice(-24),
   createdAt:doc.exists?old.createdAt||now:now,updatedAt:now}, {merge:true});
 });
 return true;
}
export default async function historyHandler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||AI_ENABLED()&&!requireAiAccess(m,'stock'))return send(res,403,'Unidade ou cargo não autorizado.');
  const {action,threadId}=req.body||{};
  const ref=root(getDb(),m.unitId,actor.uid);
  if(action==='assistantHistoryList'){
   const snap=await ref.orderBy('updatedAt','desc').limit(20).get();
   return send(res,200,'Conversas encontradas.',{threads:snap.docs.map(d=>({id:d.id,title:safeText(d.data().title).slice(0,65),updatedAt:d.data().updatedAt?.toDate?.()?.toISOString?.()||null}))});
  }
  if(!idPattern.test(threadId||''))return send(res,400,'Conversa inválida.');
  if(action==='assistantHistoryGet'){
   const doc=await ref.doc(threadId).get();
   return doc.exists?send(res,200,'Conversa carregada.',{threadId,messages:sanitize(doc.data().messages)}):send(res,404,'Conversa não encontrada.');
  }
  if(action==='assistantHistoryDelete'){
   await ref.doc(threadId).delete();
   return send(res,200,'Conversa apagada.');
  }
  return send(res,400,'Ação inválida.');
 }catch(error){
  if(error.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');
  if(sendQuotaError(res,error))return;
  console.error('Assistant history:',error.name);
  return send(res,503,'Não foi possível consultar o histórico.');
 }
}
