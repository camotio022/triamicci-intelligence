import {createHash} from 'node:crypto';
import {MAX_PHOTO_BYTES,jpegDimensions} from './rules.js';

// Credentials never leave the server. All paths are deterministic, immutable evidence IDs.
export function cloudinaryConfig(env=process.env){
 const cloud=env.CHECKLIST_CLOUDINARY_CLOUD_NAME,key=env.CHECKLIST_CLOUDINARY_API_KEY,secret=env.CHECKLIST_CLOUDINARY_API_SECRET,preset=env.CHECKLIST_CLOUDINARY_PRESET;
 if(!/^[a-z0-9_-]{2,100}$/.test(cloud||'')||!/^\d{5,30}$/.test(key||'')||!secret||secret.length<8||!/^[a-zA-Z0-9_-]{3,100}$/.test(preset||''))throw Error('PHOTO_UNAVAILABLE');
 return {cloud,key,secret,preset};
}
export function cloudinarySignature(params,secret){
 const payload=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&');
 return createHash('sha256').update(payload+secret).digest('hex');
}
const safePublicId=path=>{
 if(!/^checklists\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{8,80}\/[a-f0-9]{40}\.jpg$/.test(path))throw Error('UNSAFE_PHOTO_PATH');
 return 'triamicci/'+path.slice(0,-4);
};
async function boundedBytes(response,max){
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw Error('PHOTO_INVALID');}
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('PHOTO_INVALID');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export function cloudinaryBucket({config=cloudinaryConfig(),fetcher=fetch}={}){
 const base=`https://api.cloudinary.com/v1_1/${config.cloud}/image`;
 async function request(operation,params,bytes){
  const signed={...params,timestamp:Math.floor(Date.now()/1000)};
  const form=new FormData();for(const [key,value] of Object.entries(signed))form.set(key,String(value));
  // Official server-to-server Basic authentication; secret stays in HTTPS header.
  const authorization='Basic '+Buffer.from(config.key+':'+config.secret).toString('base64');
  if(bytes)form.set('file',new Blob([bytes],{type:'image/jpeg'}),'evidence.jpg');
  let response;try{response=await fetcher(`${base}/${operation}`,{method:'POST',headers:{Authorization:authorization},body:form,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('PHOTO_UNAVAILABLE');}
  if(!response.ok){
   let message='';try{message=JSON.parse((await boundedBytes(response,32768)).toString('utf8')).error?.message||'';}catch{}
   const providerReason=/invalid signature/i.test(message)?'INVALID_SIGNATURE':/preset/i.test(message)?'PRESET':/permission|not allowed|access|role/i.test(message)?'PERMISSION':'UNKNOWN';
   throw Object.assign(Error('PHOTO_UNAVAILABLE'),{providerStatus:response.status,providerReason});
  }
  let result;try{result=JSON.parse((await boundedBytes(response,32768)).toString('utf8'));}catch{throw Error('PHOTO_UNAVAILABLE');}
  return result;
 }
 return {provider:'cloudinary',storageCloud:config.cloud,file(path){
  const publicId=safePublicId(path);let metadata;
  return {
   async save(bytes){
    const result=await request('authenticated',{public_id:publicId,overwrite:false,upload_preset:config.preset},bytes);
    if(result.type!=='authenticated'||result.public_id!==publicId||result.resource_type!=='image'||result.format!=='jpg'||!result.asset_id||!result.version||result.existing)throw Error('PHOTO_PRIVACY_REQUIRED');
    metadata={generation:String(result.version),assetId:result.asset_id};
   },
   async getMetadata(){if(!metadata)throw Error('PHOTO_UNAVAILABLE');return [metadata];},
   async download(){
    // Proxy signed CDN delivery: never return reusable provider URLs to the client.
    const toSign=`${publicId}.jpg`;
    const signature=createHash('sha256').update(toSign+config.secret).digest('base64url').slice(0,8);
    const url=`https://res.cloudinary.com/${config.cloud}/image/authenticated/s--${signature}--/${toSign}`;
    let response;try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw Error('PHOTO_UNAVAILABLE');}
    if(!response.ok)throw Error('PHOTO_UNAVAILABLE');
    const bytes=await boundedBytes(response,MAX_PHOTO_BYTES);if(!jpegDimensions(bytes))throw Error('PHOTO_INVALID');return [bytes];
   },
   async delete(){const result=await request('destroy',{public_id:publicId,type:'authenticated',invalidate:true});if(!['ok','not found'].includes(result.result))throw Error('PHOTO_UNAVAILABLE');}
  };
 }};
}
