import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cloudinaryConfig,cloudinaryBucket,cloudinarySignature} from '../server/checklists/cloudinary-storage.js';
import {photoBucket} from '../server/checklists/photos.js';
import {cleanupPhoto} from '../server/checklists/cleanup.js';
import {checklistPhotoBase64 as JPEG_BASE64} from './fixtures/checklist-photo.js';
const config={cloud:'demo-test',key:'123456789',secret:'test-secret-only',preset:'checklist_test'};
const path='checklists/barigui/run-00001/'+'a'.repeat(40)+'.jpg',publicId='triamicci/'+path.slice(0,-4);
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
test('Cloudinary rejeita configuração incompleta e caminhos fora de evidências',()=>{
 assert.throws(()=>cloudinaryConfig({}),/PHOTO_UNAVAILABLE/);
 const bucket=cloudinaryBucket({config});for(const p of ['../secret',path+'?url=x','photos/public.jpg'])assert.throws(()=>bucket.file(p),/UNSAFE_PHOTO_PATH/);
});
test('assinatura ordena parâmetros e não inclui valores vazios',()=>{assert.equal(cloudinarySignature({z:'last',a:'first',empty:''},config.secret),createHash('sha256').update('a=first&z=last'+config.secret).digest('hex'));});
test('upload autenticado não sobrescreve e valida resposta do provedor',async()=>{
 let observed;
 const bucket=cloudinaryBucket({config,fetcher:async(url,options)=>{observed={url,options};return json({type:'authenticated',resource_type:'image',format:'jpg',public_id:publicId,asset_id:'asset-test',version:123});}});
 const file=bucket.file(path);await file.save(Buffer.from(JPEG_BASE64,'base64'));
 assert.equal(observed.options.body.get('overwrite'),'false');assert.equal(observed.options.body.get('type'),'authenticated');assert.equal(observed.options.body.get('upload_preset'),config.preset);assert.equal(observed.options.body.get('api_secret'),null);assert.equal(observed.options.headers.Authorization,'Basic '+Buffer.from(config.key+':'+config.secret).toString('base64'));assert.equal(observed.options.body.get('signature'),null);assert.equal(observed.options.redirect,'error');assert.deepEqual(await file.getMetadata(),[{generation:'123',assetId:'asset-test'}]);
 const bad=cloudinaryBucket({config,fetcher:async()=>json({type:'upload',public_id:publicId})});await assert.rejects(()=>bad.file(path).save(Buffer.from('x')),/PHOTO_PRIVACY_REQUIRED/);
});
test('download passa pelo servidor e valida JPEG; erro remoto não revela segredos',async()=>{
 let url;const bytes=Buffer.from(JPEG_BASE64,'base64');
 const bucket=cloudinaryBucket({config,fetcher:async(u)=>{url=u;return new Response(bytes);}});
 assert.deepEqual((await bucket.file(path).download())[0],bytes);assert.match(url,/\/image\/authenticated\/s--/);assert.ok(!url.includes(config.secret));
 const bad=cloudinaryBucket({config,fetcher:async()=>new Response('bad',{status:401})});await assert.rejects(()=>bad.file(path).download(),/PHOTO_UNAVAILABLE/);
 const oversized=cloudinaryBucket({config,fetcher:async()=>new Response('bad',{headers:{'content-length':'9999999'}})});await assert.rejects(()=>oversized.file(path).download(),/PHOTO_INVALID/);
});
test('limpeza Cloudinary aceita exclusão idempotente e nunca usa upload público',async()=>{
 const calls=[];const bucket=cloudinaryBucket({config,fetcher:async(url,options)=>{calls.push({url,options});return json({result:'not found'});}});await bucket.file(path).delete();assert.match(calls[0].url,/\/destroy$/);assert.equal(calls[0].options.body.get('type'),'authenticated');assert.equal(calls[0].options.body.get('invalidate'),'true');
});
test('metadados Cloudinary não podem apontar para outro ambiente',()=>{
 assert.throws(()=>photoBucket({provider:'cloudinary',storageCloud:'other'}));assert.throws(()=>photoBucket({provider:'unknown'}));
});
test('retenção seleciona provedor da foto e preserva ocorrências abertas',async()=>{
 let deleted=0,provider;
 const photo={provider:'cloudinary',unitId:'barigui',runId:'run-00001',path,status:'ready',hold:false,expiresAt:{toDate:()=>new Date(0)}};
 const ref={id:'a'.repeat(40),get:async()=>({data:()=>photo}),update:async patch=>Object.assign(photo,patch)};
 const db={runTransaction:async fn=>fn({get:ref.get,update:(_,p)=>Object.assign(photo,p)})};
 const bucket=p=>{provider=p.provider;return {file:()=>({delete:async()=>{deleted++;}})};};
 photo.hold=true;assert.equal((await cleanupPhoto(db,ref,{apply:true,bucket})).deleted,false);photo.hold=false;
 assert.equal((await cleanupPhoto(db,ref,{apply:true,bucket})).deleted,true);assert.equal(deleted,1);assert.equal(provider,'cloudinary');assert.equal((await cleanupPhoto(db,ref,{apply:true,bucket})).deleted,false);
});
