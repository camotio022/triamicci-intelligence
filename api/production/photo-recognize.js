import {authenticate,membership,checkRequest,send} from '../../server/_lib.js';

// Recognition only. Never writes stock, tasks or images to Firestore.
// GOOGLE_VISION_API_KEY is a server-only Vercel environment variable.
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req);
  const member=await membership(actor.uid);
  if(!member?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const key=process.env.GOOGLE_VISION_API_KEY;
  if(!key)return send(res,503,'Leitura de manuscritos não configurada.',{code:'HANDWRITING_NOT_CONFIGURED'});
  const {image,mimeType}=req.body||{};
  if(!['image/jpeg','image/png','image/webp'].includes(mimeType)||
     typeof image!=='string'||image.length>4_000_000||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(image)||image.length%4!==0)
   return send(res,400,'Imagem inválida ou muito grande.');
  const bytes=Buffer.from(image,'base64');
  if(bytes.length<100||bytes.length>3_000_000)return send(res,400,'Tamanho da imagem inválido.');
  const signature=mimeType==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8:
   mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
   bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!signature)return send(res,400,'Formato de imagem incompatível.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  let response;
  try{
   response=await fetch('https://vision.googleapis.com/v1/images:annotate?key='+encodeURIComponent(key),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({requests:[{image:{content:image},features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]}),
    signal:controller.signal
   });
  }finally{clearTimeout(timeout)}
  if(!response.ok){
   console.error('photo OCR provider status',response.status);
   return send(res,502,'Serviço de leitura indisponível.',{code:'HANDWRITING_PROVIDER_ERROR'});
  }
  const result=await response.json();
  if(result.responses?.[0]?.error)return send(res,502,'Serviço de leitura recusou a imagem.',{code:'HANDWRITING_PROVIDER_ERROR'});
  const annotation=result.responses?.[0]?.fullTextAnnotation;
  const text=String(annotation?.text||'').slice(0,1600);
  const words=(annotation?.pages||[]).flatMap(page=>(page.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(p=>p.words||[])));
  const confidence=words.length?100*words.reduce((sum,word)=>sum+(Number(word.confidence)||0),0)/words.length:null;
  return send(res,200,'Leitura concluída.',{text,confidence,engine:'cloud-vision'});
 }catch(error){
  if(error.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  console.error('photo OCR failure',error.name||'error');
  return send(res,502,'Não foi possível processar a imagem.',{code:'HANDWRITING_FAILED'});
 }
}
