import admin from 'firebase-admin';
import {createHash,randomUUID} from 'node:crypto';
import {send} from '../_lib.js';
import {unitDay} from '../schedules/temporal-policy.js';
import {canExecute,idOk,expiresAfter,jpegDimensions,MAX_PHOTO_BYTES} from './rules.js';
export function photoBucket(){
 const name=process.env.CHECKLIST_STORAGE_BUCKET;
 if(!name||! /^[a-z0-9][a-z0-9._-]{2,221}$/.test(name))throw Error('PHOTO_UNAVAILABLE');
 return admin.storage().bucket(name);
}
export async function photoAction(req,res,ctx){
 const {db,unit,actor,member,actorRef,activeActor}=ctx,body=req.body,photos=unit.collection('checklistPhotos'),now=new Date();
 if(body.action==='captureStart'){
  photoBucket();
  if(!idOk(body.runId)||!idOk(body.itemId)||!idOk(body.requestId))throw Error('INVALID');
  const id=createHash('sha256').update(body.runId+'|'+body.itemId+'|'+actor.uid+'|'+body.requestId).digest('hex').slice(0,40),ref=photos.doc(id),runRef=unit.collection('checklistRuns').doc(body.runId);
  await db.runTransaction(async tx=>{
   const [who,run,prior]=await Promise.all([tx.get(actorRef),tx.get(runRef),tx.get(ref)]);
   if(!activeActor(who,unit.id)||!run.exists||!canExecute(who.data().role,run.data().model))throw Error('FORBIDDEN');
   if(run.data().day!==unitDay())throw Error('INVALID_DAY');
   if(!run.data().model.items.some(x=>x.id===body.itemId)||run.data().answers?.[body.itemId])throw Error('ALREADY_ANSWERED');
   if(prior.exists){if(prior.data().captureExpiresAt.toDate()<=now)throw Error('CAPTURE_EXPIRED');return;}
   if((run.data().captureAttempts||0)>=120)throw Error('LIMIT');
   tx.create(ref,{uid:actor.uid,unitId:unit.id,runId:body.runId,itemId:body.itemId,status:'capturing',createdAt:now,captureExpiresAt:new Date(now.getTime()+3*60000),expiresAt:expiresAfter(now,1),cleanupAt:expiresAfter(now,1),hold:false,attached:false,path:`checklists/${unit.id}/${body.runId}/${id}.jpg`});
   tx.update(runRef,{captureAttempts:(run.data().captureAttempts||0)+1});
  });
  return send(res,200,'Câmera autorizada por três minutos.',{photoId:id});
 }
 if(!idOk(body.photoId))throw Error('INVALID');const ref=photos.doc(body.photoId);
 if(body.action==='photoRead'){
  const doc=await ref.get(),p=doc.data();
  if(p?.status==='deleted'||p?.status==='deleting')return send(res,410,'Foto removida após o prazo de retenção.');
  if(!p||p.status!=='ready')return send(res,404,'Foto indisponível.');
  if(!p.hold&&p.expiresAt.toDate()<=now)return send(res,410,'Foto removida após o prazo de retenção.');
  const run=await unit.collection('checklistRuns').doc(p.runId).get();
  if(!run.exists||!canExecute(member.role,run.data().model)||(!p.attached&&p.uid!==actor.uid))throw Error('FORBIDDEN');
  const [bytes]=await photoBucket().file(p.path).download();
  return send(res,200,'Foto privada.',{dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')});
 }
 if(body.action!=='photoUpload')throw Error('INVALID');
 if(typeof body.base64!=='string'||body.base64.length>Math.ceil(MAX_PHOTO_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64))throw Error('PHOTO_INVALID');
 const bytes=Buffer.from(body.base64,'base64'),dimensions=jpegDimensions(bytes);if(!dimensions||bytes.length>MAX_PHOTO_BYTES)throw Error('PHOTO_INVALID');
 const digest=createHash('sha256').update(bytes).digest('hex'),lease=randomUUID();let data,duplicate=false;
 await db.runTransaction(async tx=>{
  const [who,doc]=await Promise.all([tx.get(actorRef),tx.get(ref)]);data=doc.data();
  if(!activeActor(who,unit.id)||!data||data.uid!==actor.uid)throw Error('FORBIDDEN');
  const run=await tx.get(unit.collection('checklistRuns').doc(data.runId));
  if(!run.exists||!canExecute(who.data().role,run.data().model)||run.data().answers?.[data.itemId])throw Error('FORBIDDEN');
  if(data.status==='ready'&&data.sha256===digest){duplicate=true;return;}
  if(data.status!=='capturing'||data.captureExpiresAt.toDate()<=now)throw Error('CAPTURE_EXPIRED');
  tx.update(ref,{status:'uploading',lease,sha256:digest});
 });
 if(duplicate)return send(res,200,'Foto já enviada.',{photoId:ref.id});
 const file=photoBucket().file(data.path);
 try{
  await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'image/jpeg',cacheControl:'private, no-store',metadata:{unitId:unit.id,runId:data.runId,photoId:ref.id,sha256:digest}}});
  const [metadata]=await file.getMetadata();
  await db.runTransaction(async tx=>{
   const [who,photo,run]=await Promise.all([tx.get(actorRef),tx.get(ref),tx.get(unit.collection('checklistRuns').doc(data.runId))]);
   if(!activeActor(who,unit.id)||!run.exists||!canExecute(who.data().role,run.data().model))throw Error('FORBIDDEN');
   if(photo.data()?.lease!==lease||photo.data()?.status!=='uploading'||run.data().answers?.[data.itemId])throw Error('CONFLICT');
   tx.update(ref,{status:'ready',generation:metadata.generation,size:bytes.length,...dimensions,uploadedAt:new Date()});
  });
 }catch(e){
  // Keep the object reference for the cleanup worker, including partially completed uploads.
  await db.runTransaction(async tx=>{const photo=await tx.get(ref);if(photo.data()?.lease===lease&&photo.data()?.status==='uploading')tx.update(ref,{status:'failed',expiresAt:expiresAfter(new Date(),1),cleanupAt:expiresAfter(new Date(),1)});});
  throw e;
 }
 return send(res,200,'Foto enviada. Confirme o item para concluir.',{photoId:ref.id});
}
