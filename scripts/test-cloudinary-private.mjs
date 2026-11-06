import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cloudinaryBucket,cloudinaryConfig} from '../server/checklists/cloudinary-storage.js';
import {checklistPhotoBase64} from '../tests/fixtures/checklist-photo.js';
// Explicit workflow_dispatch only. Synthetic JPEG; no restaurant/employee data.
const config=cloudinaryConfig(),bucket=cloudinaryBucket({config});
const id=randomBytes(20).toString('hex');
const path=`checklists/qa-cloudinary/run-${Date.now()}/${id}.jpg`,file=bucket.file(path);
let uploaded=false;
try{
 const bytes=Buffer.from(checklistPhotoBase64,'base64');await file.save(bytes);uploaded=true;
 const [metadata]=await file.getMetadata();assert.ok(metadata.generation);
 const unsigned=`https://res.cloudinary.com/${config.cloud}/image/authenticated/triamicci/${path}`;
 const response=await fetch(unsigned,{redirect:'error',signal:AbortSignal.timeout(20000)});
 assert.ok([401,403,404].includes(response.status),'Acesso sem assinatura precisa ser negado');await response.body?.cancel();
 const [read]=await file.download();assert.deepEqual(read,bytes,'Leitura privada deve preservar bytes');
 console.log('PASS: upload authenticated, acesso público negado e leitura privada confirmados.');
}finally{
 if(uploaded){await file.delete();console.log('PASS: imagem sintética removida.');await file.delete();console.log('PASS: exclusão idempotente.');}
}
