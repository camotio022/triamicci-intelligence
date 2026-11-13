import admin from 'firebase-admin';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
import {decodePhotoDataUrl,extractVisionText} from '../../server/production/photo-vision.js';

const canPlan=role=>['admin','manager','submanager','cook','auxiliar'].includes(role);
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId||!canPlan(member.role))return send(res,403,'Sem permissão para planejar produção.');
  if(req.body?.action!=='recognizePhoto'||req.body?.consent!==true)return send(res,400,'Confirme o envio da foto para reconhecimento online.');
  const {content}=decodePhotoDataUrl(req.body?.image);
  if(process.env.PHOTO_OCR_PROVIDER!=='google-vision')return send(res,503,'Reconhecimento online ainda não está configurado. Use a revisão manual.');
  const db=getDb(),day=new Date().toISOString().slice(0,10);
  const quotaRef=db.collection('units').doc(member.unitId).collection('photoOcrQuotas').doc(actor.uid+'-'+day);
  // Transactional per-user daily ceiling prevents unbounded third-party OCR charges.
  await db.runTransaction(async tx=>{
   const snap=await tx.get(quotaRef),count=snap.data()?.count||0;
   if(count>=20)throw Error('OCR_LIMIT');
   tx.set(quotaRef,{count:count+1,updatedAt:new Date(),unitId:member.unitId,uid:actor.uid},{merge:true});
  });
  const credential=admin.app().options.credential;
  const token=await credential.getAccessToken();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  let upstream;
  try{
   upstream=await fetch('https://vision.googleapis.com/v1/images:annotate',{
    method:'POST',signal:controller.signal,
    headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({requests:[{image:{content},features:[{type:'DOCUMENT_TEXT_DETECTION'}],imageContext:{languageHints:['pt']}}]})
   });
  }finally{clearTimeout(timeout);}
  if(!upstream.ok){console.error('Photo OCR provider status:',upstream.status);return send(res,502,'Serviço de reconhecimento indisponível. Tente novamente mais tarde.');}
  const result=extractVisionText(await upstream.json());
  return send(res,200,'Reconhecimento concluído. Revise cada item.',{...result,provider:'google-vision'});
 }catch(error){
  if(error.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');
  if(error.message==='INVALID_IMAGE')return send(res,400,'Imagem inválida ou muito grande. Tente outra foto.');
  if(error.message==='OCR_LIMIT')return send(res,429,'Limite diário de 20 leituras atingido. Use a inclusão manual.');
  console.error('Photo OCR:',error.message);
  return send(res,502,'Não foi possível reconhecer a foto. Nenhuma tarefa foi criada.');
 }
}
