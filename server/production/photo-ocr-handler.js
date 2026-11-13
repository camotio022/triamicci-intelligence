import {authenticate,checkRequest,getDb,membership,send} from '../_lib.js';
import {sendQuotaError} from '../quota-error.js';
import {canPlanProduction} from './planning-permissions.js';
import {readPhoto} from './photo-ocr.js';

export default async function photoOcrHandler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId||!canPlanProduction(member.role))return send(res,403,'Sem permissão para planejar produção.');
  const {image}=req.body;
  if(typeof image!=='string'||image.length>1800000||image.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))
   return send(res,400,'Imagem inválida ou muito grande.');
  const bytes=Buffer.from(image,'base64');
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)
   return send(res,400,'Envie uma imagem JPEG válida.');
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)return send(res,503,'A leitura automática ainda não está habilitada. Você pode revisar pelo catálogo.',{code:'PHOTO_OCR_UNAVAILABLE'});

  // The unit-wide window also applies across concurrent serverless instances.
  const db=getDb();
  const limit=db.collection('units').doc(member.unitId).collection('operationalLimits').doc('production-photo-ocr');
  const now=Date.now();
  const allowed=await db.runTransaction(async tx=>{
   const snapshot=await tx.get(limit);
   const {startedAt=0,count=0}=snapshot.data()||{};
   const sameWindow=now-startedAt<60000;
   if(sameWindow&&count>=10)return false;
   tx.set(limit,{startedAt:sameWindow?startedAt:now,count:sameWindow?count+1:1});
   return true;
  });
  if(!allowed)return send(res,429,'Muitas leituras nesta unidade. Tente novamente em um minuto.');
  const lines=await readPhoto(image,{key});
  return send(res,200,'Leitura concluída.',{lines});
 }catch(error){
  if(error.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(error.message==='GEMINI_HTTP_429')return send(res,429,'A cota do Gemini foi atingida. Revise pelo catálogo ou tente mais tarde.',{code:'PHOTO_OCR_QUOTA'});
  if(sendQuotaError(res,error))return;
  console.error('Production photo OCR:',error.name,error.message.match(/^GEMINI_[A-Z0-9_]+$/)?.[0]||'REQUEST_FAILED');
  return send(res,503,'O serviço de leitura está indisponível. Tente novamente ou revise pelo catálogo.',{code:'PHOTO_OCR_UNAVAILABLE'});
 }
}
