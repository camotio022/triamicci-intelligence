import {photoBucket} from './photos.js';
// Claims and attachment/resolution share the metadata document's transaction lock.
export async function cleanupPhoto(db,ref,{apply=false,now=new Date(),bucket=photoBucket}={}){
 let photo;
 const eligible=p=>p&&!p.hold&&p.status!=='deleted'&&p.expiresAt?.toDate?.()<=now;
 if(!apply){photo=(await ref.get()).data();return {eligible:eligible(photo),deleted:false};}
 const claimed=await db.runTransaction(async tx=>{const doc=await tx.get(ref);photo=doc.data();if(!eligible(photo))return false;tx.update(ref,{status:'deleting'});return true;});
 if(!claimed)return {eligible:false,deleted:false};
 if(photo.path!==`checklists/${photo.unitId}/${photo.runId}/${ref.id}.jpg`)throw Error('UNSAFE_PHOTO_PATH');
 try{await bucket().file(photo.path).delete({ignoreNotFound:true,...(photo.generation?{ifGenerationMatch:photo.generation}:{})});}
 catch(e){if(Number(e.code)!==404)throw e;}
 await ref.update({status:'deleted',deletedAt:now,cleanupAt:null});
 return {eligible:true,deleted:true};
}
