import test from 'node:test';
import assert from 'node:assert/strict';
import {photoLines,readPhoto} from '../server/production/photo-ocr.js';

const word=(text,confidence,type)=>({
 confidence,
 symbols:[...text].map((character,index)=>({
  text:character,confidence:character==='3'?.65:confidence,
  ...(type&&index===text.length-1?{property:{detectedBreak:{type}}}:{})
 }))
});
const annotation={pages:[{blocks:[{paragraphs:[{words:[
 word('Batata',.95,'SPACE'),word('purê',.95,'EOL_SURE_SPACE'),
 word('30',.92,'SPACE'),word('alcatra',.96,'LINE_BREAK'),word('frango')
]}]}]}]};

test('transcrição por linha preserva acento e reduz a confiança de um número parcialmente ilegível',()=>{
 assert.deepEqual(photoLines(annotation),[
  [{text:'Batata',confidence:.95},{text:'purê',confidence:.95}],
  [{text:'30',confidence:.65},{text:'alcatra',confidence:.96}],
  [{text:'frango',confidence:0}]
 ]);
});

test('solicita reconhecimento de documentos em português no servidor',async()=>{
 const lines=await readPhoto('example',{
  key:'test-key',
  fetcher:async(url,options)=>{
   assert.equal(url,'https://vision.googleapis.com/v1/images:annotate');
   assert.equal(options.headers['x-goog-api-key'],'test-key');
   const [request]=JSON.parse(options.body).requests;
   assert.deepEqual(request.features,[{type:'DOCUMENT_TEXT_DETECTION'}]);
   assert.deepEqual(request.imageContext.languageHints,['pt']);
   assert.deepEqual(request.image,{content:'example'});
   return Response.json({responses:[{fullTextAnnotation:annotation}]});
  }
 });
 assert.deepEqual(lines,photoLines(annotation));
});

test('distingue foto sem texto, falha do provedor e HTTP indisponível',async()=>{
 const request=fetcher=>readPhoto('example',{key:'test-key',fetcher});
 assert.deepEqual(await request(async()=>Response.json({responses:[{}]})),[]);
 await assert.rejects(request(async()=>Response.json({responses:[{error:{code:3}}]})),/VISION_RESPONSE_FAILED/);
 await assert.rejects(request(async()=>new Response('',{status:429})),/VISION_HTTP_429/);
});
