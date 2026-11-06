import admin from 'firebase-admin';
import {cloudinaryBucket} from './cloudinary-storage.js';
import {createHash,randomUUID} from 'node:crypto';
import {send} from '../_lib.js';
import {unitDay} from '../schedules/temporal-policy.js';
import {isManagement} from '../permissions/v31-policy.js';
import {canExecute,idOk,expiresAfter,jpegDimensions,MAX_PHOTO_BYTES} from './rules.js';
export function photoBucket(photo){
 const provider=photo ? (photo.provider||'firebase') : (process.env.CHECKLIST_PHOTO_PROVIDER||'firebase');
 if(provider==='cloudinary'){const bucket=cloudinaryBucket();if(photo?.storageCloud&&photo.storageCloud!==bucket.storageCloud)throw Error('PHOTO_UNAVAILABLE');return bucket;}
 if(provider!=='firebase')throw Error('PHOTO_UNAVAILABLE');
 const name=process.env.CHECKLIST_STORAGE_BUCKET;
 if(!name||! /^[a-z0-9][a-z0-9._-]{2,221}$/.test(name))throw Error('PHOTO_UNAVAILABLE');
 return admin.storage().bucket(name);
}
export const privateEvidenceStorage=metadata=>metadata?.iamConfiguration?.publicAccessPrevention==='enforced';
export async function privatePhotoBucket(photo){
 const bucket=photoBucket(photo);
 if(bucket.provider==='cloudinary')return bucket;
 // Only isolated demo projects can bypass cloud bucket metadata in the emulator.
 if(process.env.APP_ENV==='staging'&&process.env.FIREBASE_EXPECTED_PROJECT_ID?.startsWith('demo-')&&process.env.FIREBASE_STORAGE_EMULATOR_HOST)return bucket;
 let metadata;try{[metadata]=await bucket.getMetadata();}catch{throw Error('PHOTO_UNAVAILABLE');}
 if(!privateEvidenceStorage(metadata))throw Error('PHOTO_PRIVACY_REQUIRED');
 return bucket;
}
export async function photoAction(req,res,ctx){
 const {db,unit,actor,member,actorRef,activeActor}=ctx,body=req.body,photos=unit.collection('checklistPhotos'),now=new Date();
 if(body.action==='configuration'){
  if(!isManagement(member.role))throw Error('FORBIDDEN');
  if(process.env.CHECKLIST_PHOTO_PROVIDER!=='cloudinary'&&!process.env.CHECKLIST_STORAGE_BUCKET)return send(res,200,'Armazenamento de fotos não configurado.',{ready:false,code:'MISSING_BUCKET',retentionDays:90});
  if(process.env.CHECKLIST_PHOTO_PROVIDER==='cloudinary'){try{cloudinaryBucket();return send(res,200,'Cloudinary configurado no servidor. A conexão e a privacidade ainda precisam do teste de envio e leitura.',{ready:false,code:'CLOUDINARY_CONFIGURED',retentionDays:90});}catch{return send(res,200,'Configure as credenciais do Cloudinary no servidor.',{ready:false,code:'MISSING_CLOUDINARY_CONFIG',retentionDays:90});}}
  try{await privatePhotoBucket();return send(res,200,'Bucket acessível e protegido contra acesso público. Revise também as regras do Storage e a rotina diária.',{ready:true,code:'BUCKET_READY',retentionDays:90});}
  catch(e){return send(res,200,e.message==='PHOTO_PRIVACY_REQUIRED'?'Ative a prevenção de acesso público no bucket antes de receber evidências.':'Não foi possível acessar o bucket. Confira o nome e as permissões da credencial de serviço.',{ready:false,code:e.message,retentionDays:90});}
 }
 if(body.action==='captureStart'){
  const captureBucket=await privatePhotoBucket();
  if(!idOk(body.runId)||!idOk(body.itemId)||!idOk(body.requestId))throw Error('INVALID');
  const id=createHash('sha256').update(body.runId+'|'+body.itemId+'|'+actor.uid+'|'+body.requestId).digest('hex').slice(0,40),ref=photos.doc(id),runRef=unit.collection('checklistRuns').doc(body.runId);
  await db.runTransaction(async tx=>{
   const [who,run,prior]=await Promise.all([tx.get(actorRef),tx.get(runRef),tx.get(ref)]);
   if(!activeActor(who,unit.id)||!run.exists||!canExecute(who.data().role,run.data().model))throw Error('FORBIDDEN');
   if(run.data().day!==unitDay())throw Error('INVALID_DAY');
   if(!run.data().model.items.some(x=>x.id===body.itemId)||run.data().answers?.[body.itemId])throw Error('ALREADY_ANSWERED');
   if(prior.exists){if(prior.data().captureExpiresAt.toDate()<=now)throw Error('CAPTURE_EXPIRED');return;}
   if((run.data().captureAttempts||0)>=120)throw Error('LIMIT');
   tx.create(ref,{provider:captureBucket.provider||'firebase',...(captureBucket.storageCloud?{storageCloud:captureBucket.storageCloud}:{}),uid:actor.uid,unitId:unit.id,runId:body.runId,itemId:body.itemId,status:'capturing',createdAt:now,captureExpiresAt:new Date(now.getTime()+3*60000),expiresAt:expiresAfter(now,1),cleanupAt:expiresAfter(now,1),hold:false,attached:false,path:`checklists/${unit.id}/${body.runId}/${id}.jpg`});
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
  const [bytes]=await (await privatePhotoBucket(p)).file(p.path).download();
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
 try{
  const bucket=await privatePhotoBucket(data);
  const file=bucket.file(data.path);
  await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'image/jpeg',cacheControl:'private, no-store',metadata:{unitId:unit.id,runId:data.runId,photoId:ref.id,sha256:digest}}});
  const [metadata]=await file.getMetadata();
  await db.runTransaction(async tx=>{
   const [who,photo,run]=await Promise.all([tx.get(actorRef),tx.get(ref),tx.get(unit.collection('checklistRuns').doc(data.runId))]);
   if(!activeActor(who,unit.id)||!run.exists||!canExecute(who.data().role,run.data().model))throw Error('FORBIDDEN');
   if(photo.data()?.lease!==lease||photo.data()?.status!=='uploading'||run.data().answers?.[data.itemId])throw Error('CONFLICT');
   tx.update(ref,{status:'ready',generation:metadata.generation,...(metadata.assetId?{assetId:metadata.assetId}:{}),size:bytes.length,...dimensions,uploadedAt:new Date()});
  });
 }catch(e){
  // Keep the object reference for the cleanup worker, including partially completed uploads.
  await db.runTransaction(async tx=>{const photo=await tx.get(ref);if(photo.data()?.lease===lease&&photo.data()?.status==='uploading')tx.update(ref,{status:'failed',expiresAt:expiresAfter(new Date(),1),cleanupAt:expiresAfter(new Date(),1)});});
  throw e;
 }
 return send(res,200,'Foto enviada. Confirme o item para concluir.',{photoId:ref.id});
}
