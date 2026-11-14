import {AI_DRAFTS} from './permissions-v1.js';

// A draft is created only after a manager explicitly asks to prepare one.
// Generic questions and recommendations are not silently persisted as drafts.
export function draftIntent(question=''){
 const s=String(question).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!/rascunho|prepare|preparar|monte uma proposta|crie uma proposta|elabore um/.test(s))return null;
 if(/ficha tecnica|receita|preparac/.test(s))return 'recipeDraft';
 if(/notifica|comunicad|aviso/.test(s))return 'notificationDraft';
 if(/cobertura|dobr|substitui/.test(s))return 'coverageDraft';
 if(/escala|folga|turnos/.test(s))return 'scheduleDraft';
 if(/registr|ajust|baixa.*estoque|lancamento/.test(s))return 'productionDraft';
 if(/plano|planej|produc/.test(s))return 'planDraft';
 return null;
}
export async function persistAiDraft(db,member,uid,type,title,body){
 if(!AI_DRAFTS.includes(type))return null;
 const unit=db.collection('units').doc(member.unitId),root=unit.collection('aiDrafts').doc(uid).collection('items');
 const snapshot=await root.limit(51).get();
 if(snapshot.size>=50)return null;
 const at=new Date(),ref=root.doc(),batch=db.batch();
 batch.create(ref,{type,title:String(title).slice(0,100),body:String(body).slice(0,3500),
  status:'draft',createdAt:at,updatedAt:at,authorUid:uid,generatedByAI:true});
 batch.create(db.collection('auditLogs').doc(),{event:'ai.v1.draft_created',at,unitId:member.unitId,
  actorUid:uid,type,draftId:ref.id,generatedByAI:true});
 await batch.commit();
 return {id:ref.id,type};
}
