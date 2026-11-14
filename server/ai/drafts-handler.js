import {authenticate,checkRequest,getDb,membership,send} from '../_lib.js';
import {AI_ENABLED,aiDraftType,requireAiAccess} from './permissions-v1.js';

const clean=s=>typeof s==='string'?s.trim():'';
const maxTitle=100,maxBody=3500;
export function validateAiDraft(payload){
 if(!payload||!aiDraftType(payload.type)||typeof payload.title!=='string'||clean(payload.title).length<3||payload.title.length>maxTitle||
    typeof payload.body!=='string'||clean(payload.body).length<5||payload.body.length>maxBody)return null;
 return {type:payload.type,title:clean(payload.title),body:clean(payload.body)};
}
export default async function aiDraftsHandler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 if(!AI_ENABLED())return send(res,404,'Recurso não habilitado nesta implantação.');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!requireAiAccess(member,'recipeDraft'))return send(res,403,'Apenas gestão autorizada.');
  const action=req.body?.action,db=getDb();
  // Drafts are in a completely separate private namespace; no operational writes, notifications or approvals.
  const root=db.collection('units').doc(member.unitId).collection('aiDrafts').doc(actor.uid).collection('items');
  if(action==='assistantDraftList'){
   const snap=await root.orderBy('updatedAt','desc').limit(21).get();
   return send(res,200,'Rascunhos privados.',{drafts:snap.docs.slice(0,20).map(d=>({id:d.id,type:d.data().type,title:d.data().title,updatedAt:d.data().updatedAt?.toDate?.()?.toISOString?.()||null})),incomplete:snap.size>20});
  }
  if(action==='assistantDraftCreate'){
   const body=validateAiDraft(req.body?.draft);
   if(!body)return send(res,400,'Rascunho inválido.');
   const count=await root.limit(51).get();
   if(count.size>=50)return send(res,429,'Limite de rascunhos atingido.');
   const ref=root.doc();
   await ref.create({...body,status:'draft',createdAt:new Date(),updatedAt:new Date(),authorUid:actor.uid});
   return send(res,201,'Rascunho privado criado. Nenhuma operação foi executada.',{id:ref.id});
  }
  if(action==='assistantDraftGet'){
   const id=req.body?.id;
   if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(id))return send(res,400,'ID inválido.');
   const snap=await root.doc(id).get();
   return snap.exists?send(res,200,'Rascunho privado.',{draft:{id:snap.id,type:snap.data().type,title:snap.data().title,body:snap.data().body,status:'draft'}}):send(res,404,'Não encontrado.');
  }
  if(action==='assistantDraftDelete'){
   const id=req.body?.id;
   if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(id))return send(res,400,'ID inválido.');
   await root.doc(id).delete();
   return send(res,200,'Rascunho descartado. Nenhum registro operacional alterado.');
  }
  return send(res,400,'Operação não autorizada pela fase 1.');
 }catch(error){
  if(error.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  console.error('AI draft:',error.name);
  return send(res,503,'Não foi possível acessar o rascunho.');
 }
}
