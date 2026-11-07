import {createHash,randomUUID} from 'node:crypto';
import {authenticate,membership,getDb,checkRequest,send} from '../_lib.js';
import {isManagement,TEAM_ROLES} from '../permissions/v31-policy.js';
import {unitDay} from '../schedules/temporal-policy.js';
import {signalUnitChange} from '../live-signal.js';
import {sendQuotaError} from '../quota-error.js';
import {normalizeTemplate,idOk,canExecute,scheduledOn,validateAnswer,runProgress,expiresAfter} from './rules.js';
import {photoAction} from './photos.js';
import {ensureDailyRun,dailyRunId} from './routine.js';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,40);
const serialize=v=>v?.toDate?v.toDate().toISOString():Array.isArray(v)?v.map(serialize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,serialize(x)])):v;
const view=d=>({id:d.id,...serialize(d.data())});
const compactRun=d=>{const r=view(d),m=r.model;return {id:r.id,templateId:r.templateId,day:r.day,model:{name:m.name,dueTime:m.dueTime,frequency:m.frequency,roles:m.roles,items:m.items.map(i=>({critical:i.critical}))},progress:runProgress(d.data()),evidence:Object.values(r.answers||{}).filter(a=>Boolean(a.photoId)).map(a=>a.photoId)};};
export const activeActor=(snap,unitId,manage=false)=>snap.exists&&snap.data().status==='active'&&snap.data().unitId===unitId&&TEAM_ROLES.includes(snap.data().role)&&(!manage||isManagement(snap.data().role));
export function audit(tx,db,unitId,uid,event,details={}){tx.create(db.collection('auditLogs').doc(),{event:'checklist.'+event,unitId,actorUid:uid,at:new Date(),...details});signalUnitChange(tx,db,unitId,['checklists']);}
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId||!TEAM_ROLES.includes(member.role))return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(member.unitId),actorRef=db.doc('memberships/'+actor.uid),templates=unit.collection('checklistTemplates'),runs=unit.collection('checklistRuns');
  const ctx={db,unit,actor,member,actorRef,activeActor,audit},body=req.body||{},action=body.action,day=unitDay();
  if(['configuration','captureStart','photoUpload','photoRead'].includes(action))return await photoAction(req,res,ctx);
  if(action==='today'){
   const [models,initial]=await Promise.all([templates.where('archived','==',false).limit(101).get(),runs.where('day','==',day).limit(101).get()]);
   if(models.size>100)throw Error('LIMIT');
   const known=new Set(initial.docs.map(d=>d.id));let created=false;
   for(const d of models.docs){const model=d.data().published;if(model&&canExecute(member.role,model)&&scheduledOn(model,day)&&!known.has(dailyRunId(d.id,day)))created=await ensureDailyRun(db,unit,d.id,day)||created;}
   const instances=created?await runs.where('day','==',day).limit(101).get():initial;
   const activeIds=new Set(models.docs.map(d=>d.id));
   if(instances.size>100)return send(res,409,'Limite de consulta atingido. Consulte a gestão.');
   return send(res,200,'Checklists de hoje.',{day,photoEnabled:process.env.CHECKLIST_PHOTO_PROVIDER==='cloudinary'?Boolean(process.env.CHECKLIST_CLOUDINARY_CLOUD_NAME&&process.env.CHECKLIST_CLOUDINARY_API_KEY&&process.env.CHECKLIST_CLOUDINARY_API_SECRET&&process.env.CHECKLIST_CLOUDINARY_PRESET):Boolean(process.env.CHECKLIST_STORAGE_BUCKET),templates:models.docs.filter(d=>!d.data().archived&&d.data().published&&canExecute(member.role,d.data().published)&&(scheduledOn(d.data().published,day)||d.data().published.frequency==='manual')).map(d=>{const m=d.data().published;return {id:d.id,version:d.data().version,model:{name:m.name,dueTime:m.dueTime,frequency:m.frequency,roles:m.roles,items:m.items.map(i=>({critical:i.critical}))}};}),runs:instances.docs.filter(d=>activeIds.has(d.data().templateId)&&canExecute(member.role,d.data().model)).map(compactRun)});
  }
  if(action==='history'){
   // The current-day archive is a separate collection pass, so active runs today
   // never consume the pagination window reserved for older history.
   let query=runs.where('day','<',day).orderBy('day','desc').orderBy('__name__','desc');
   if(body.before){if(!idOk(body.before))throw Error('INVALID');const cursor=await runs.doc(body.before).get();if(!cursor.exists)throw Error('NOT_FOUND');query=query.startAfter(cursor);}
   const old=await query.limit(31).get();
   let archivedToday=[];
   if(!body.before){
    const [archived,current]=await Promise.all([templates.where('archived','==',true).limit(101).get(),runs.where('day','==',day).limit(101).get()]);
    const ids=new Set(archived.docs.map(d=>d.id));
    archivedToday=current.docs.filter(d=>ids.has(d.data().templateId)&&canExecute(member.role,d.data().model)).map(compactRun);
   }
   return send(res,200,'Histórico de checklists.',{runs:[...archivedToday,...old.docs.slice(0,30).filter(d=>canExecute(member.role,d.data().model)).map(compactRun)],next:old.size>30?old.docs[29].id:null});
  }
  if(action==='templates'){
   if(!isManagement(member.role))throw Error('FORBIDDEN');
   let query=templates.orderBy('updatedAt','desc').orderBy('__name__','desc');
   if(body.before){if(!idOk(body.before))throw Error('INVALID');const cursor=await templates.doc(body.before).get();if(!cursor.exists)throw Error('NOT_FOUND');query=query.startAfter(cursor);}
   const snap=await query.limit(31).get();
   return send(res,200,'Modelos da unidade.',{templates:snap.docs.slice(0,30).map(view),next:snap.size>30?snap.docs[29].id:null});
  }
  if(['saveTemplate','publishTemplate','archiveTemplate'].includes(action)){
   if(!isManagement(member.role))throw Error('FORBIDDEN');
   if(!idOk(body.id)||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0)throw Error('INVALID');
   const model=action==='saveTemplate'?normalizeTemplate(body.model,{allowEmptyItems:true}):null;if(action==='saveTemplate'&&!model)throw Error('INVALID');
   const ref=templates.doc(body.id);
   await db.runTransaction(async tx=>{
    const [who,old]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!activeActor(who,unit.id,true))throw Error('FORBIDDEN');
    const data=old.data();if((data?.revision||0)!==body.expectedRevision)throw Error('CONFLICT');
    if(data?.archived)throw Error('ARCHIVED');
    const now=new Date(),revision=body.expectedRevision+1;
    if(action==='saveTemplate')tx.set(ref,{draft:model,hasDraft:true,revision,version:data?.version||0,archived:false,createdAt:data?.createdAt||now,createdBy:data?.createdBy||actor.uid,updatedAt:now,updatedBy:actor.uid},{merge:true});
    else{
     if(!old.exists)throw Error('NOT_FOUND');
     if(action==='publishTemplate'){
      const valid=normalizeTemplate(data.draft);if(!valid||!data.hasDraft)throw Error('INVALID');
      tx.update(ref,{published:valid,hasDraft:false,version:data.version+1,revision,publishedAt:now,publishedBy:actor.uid,updatedAt:now});
     }else tx.update(ref,{archived:true,revision,archivedAt:now,archivedBy:actor.uid});
    }
    audit(tx,db,unit.id,actor.uid,action,{templateId:ref.id});
   });
   return send(res,200,action==='saveTemplate'?'Rascunho salvo. A versão publicada foi preservada.':action==='publishTemplate'?'Checklist publicado para a unidade.':'Modelo arquivado. Histórico preservado.');
  }
  if(action==='start'){
   if(!idOk(body.templateId)||!idOk(body.requestId))throw Error('INVALID');
   const templateRef=templates.doc(body.templateId);let runId;
   await db.runTransaction(async tx=>{
    const [who,template]=await Promise.all([tx.get(actorRef),tx.get(templateRef)]);
    if(!activeActor(who,unit.id))throw Error('FORBIDDEN');
    const t=template.data();if(!t?.published||t.archived)throw Error('NOT_FOUND');
    if(!canExecute(who.data().role,t.published))throw Error('FORBIDDEN');
    if(t.published.frequency!=='manual'&&!scheduledOn(t.published,day))throw Error('INVALID_DAY');
    runId=hash(body.templateId+'|'+day+'|'+(t.published.frequency==='manual'?body.requestId:'daily'));
    const ref=runs.doc(runId),old=await tx.get(ref);if(old.exists)return;
    const dayRef=unit.collection('checklistDays').doc(day),dayCount=await tx.get(dayRef);
    if((dayCount.data()?.runs||0)>=100)throw Error('LIMIT');
    tx.set(dayRef,{runs:(dayCount.data()?.runs||0)+1},{merge:true});
    const now=new Date();tx.create(ref,{templateId:body.templateId,templateVersion:t.version,model:t.published,day,answers:{},revision:0,createdAt:now,createdBy:actor.uid,unitId:unit.id});
    audit(tx,db,unit.id,actor.uid,'started',{runId});
   });
   return send(res,200,'Checklist iniciado.',{runId});
  }
  if(action==='run'){
   if(!idOk(body.runId))throw Error('INVALID');const doc=await runs.doc(body.runId).get();if(!doc.exists)throw Error('NOT_FOUND');
   if(!canExecute(member.role,doc.data().model))throw Error('FORBIDDEN');
   return send(res,200,'Conferência carregada.',{run:{...view(doc),progress:runProgress(doc.data())}});
  }
  if(['answer','resolveProblem'].includes(action)){
   if(!idOk(body.runId)||!idOk(body.itemId)||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0)throw Error('INVALID');
   const ref=runs.doc(body.runId);
   await db.runTransaction(async tx=>{
    const [who,doc]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!activeActor(who,unit.id,action==='resolveProblem'))throw Error('FORBIDDEN');
    if(!doc.exists)throw Error('NOT_FOUND');const run=doc.data(),item=run.model.items.find(i=>i.id===body.itemId);
    if(!item||!canExecute(who.data().role,run.model))throw Error('FORBIDDEN');
    if(run.revision!==body.expectedRevision)throw Error('CONFLICT');
    const now=new Date(),previous=run.answers?.[body.itemId],answers={...run.answers};
    if(action==='answer'){
     if(run.day!==day)throw Error('INVALID_DAY');
     if(previous)throw Error('ALREADY_ANSWERED');
     if(!validateAnswer(item,body))throw Error('INVALID');
     if(body.photoId){
      const photoRef=unit.collection('checklistPhotos').doc(body.photoId),photo=await tx.get(photoRef),p=photo.data();
      if(!p||p.status!=='ready'||p.runId!==body.runId||p.itemId!==item.id||p.uid!==actor.uid||p.attached||p.expiresAt.toDate()<=now)throw Error('PHOTO_REQUIRED');
      tx.update(photoRef,{attached:true,hold:body.status==='problem',expiresAt:expiresAfter(now),cleanupAt:body.status==='problem'?null:expiresAfter(now),attachedAt:now});
     }
     answers[item.id]={status:body.status,note:(body.note||'').trim(),photoId:body.photoId||null,uid:actor.uid,name:who.data().name||actor.name||'Colaborador',at:now};
    }else{
     if(!previous||previous.status!=='problem'||previous.resolution||typeof body.note!=='string'||body.note.trim().length<5||body.note.length>600)throw Error('INVALID');
     if(previous.photoId){const pr=unit.collection('checklistPhotos').doc(previous.photoId),pd=await tx.get(pr);if(pd.exists&&pd.data().status==='ready')tx.update(pr,{hold:false,expiresAt:expiresAfter(now),cleanupAt:expiresAfter(now)});}
     answers[item.id]={...previous,resolution:{note:body.note.trim(),uid:actor.uid,name:who.data().name||actor.name||'Gestão',at:now}};
    }
    const progress=runProgress({...run,answers});
    tx.update(ref,{answers,revision:run.revision+1,updatedAt:now,completedAt:progress.status==='completed'?now:null});
    audit(tx,db,unit.id,actor.uid,action,{runId:body.runId,itemId:item.id,status:body.status||null});
   });
   return send(res,200,action==='answer'?'Conferência registrada.':'Tratamento da ocorrência registrado.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão nesta unidade ou função.'],NOT_FOUND:[404,'Registro não encontrado nesta unidade.'],INVALID:[400,'Revise os campos do checklist.'],CONFLICT:[409,'Outra pessoa alterou este registro. Recarregue antes de continuar.'],ARCHIVED:[409,'Modelo arquivado. Duplique para criar outro.'],INVALID_DAY:[409,'A conferência deve corresponder ao dia atual da unidade.'],ALREADY_ANSWERED:[409,'Este item já foi conferido. O registro original foi preservado.'],PHOTO_REQUIRED:[409,'Fotografe este item e aguarde o envio antes de confirmar.'],LIMIT:[409,'Limite de consulta atingido.'],PHOTO_PRIVACY_REQUIRED:[503,'A proteção de acesso das fotos não foi confirmada. A gestão precisa revisar o armazenamento privado.'],PHOTO_UNAVAILABLE:[503,'Fotos ainda não configuradas. A gestão precisa configurar o armazenamento privado.'],CAPTURE_EXPIRED:[409,'A sessão da câmera expirou. Tire outra foto.'],PHOTO_INVALID:[400,'Envie uma foto JPEG de até 600 KB capturada pelo app.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  if(sendQuotaError(res,e))return;
  console.error('Checklists:',e.code||e.message);return send(res,500,'Não foi possível concluir. Nenhuma confirmação de envio foi recebida.');
 }
}
