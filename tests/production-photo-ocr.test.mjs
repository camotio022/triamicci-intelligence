import test from 'node:test';
import assert from 'node:assert/strict';
import {readPhoto} from '../server/production/photo-ocr.js';

const result=lines=>Response.json({candidates:[{
 finishReason:'STOP',content:{parts:[{text:JSON.stringify({lines})}]}
}]});

test('envia somente o JPEG ao Gemini e interpreta a leitura estruturada',async()=>{
 const lines=await readPhoto('example',{key:'test-key',fetcher:async(url,options)=>{
  assert.match(url,/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(options.headers['x-goog-api-key'],'test-key');
  const payload=JSON.parse(options.body);
  assert.deepEqual(payload.contents,[{parts:[{inlineData:{mimeType:'image/jpeg',data:'example'}}]}]);
  assert.equal(payload.generationConfig.responseMimeType,'application/json');
  return result([
   {name:'Batata purê',quantity:'',quantityStatus:'absent',dateNote:''},
   {name:'alcatra',quantity:'30',quantityStatus:'legible',dateNote:'Hoje'},
   {name:'frango',quantity:'40',quantityStatus:'unclear',dateNote:''}
  ]);
 }});
 assert.deepEqual(lines,[
  {name:'Batata purê',quantity:'',quantityUnclear:false,dateNote:''},
  {name:'alcatra',quantity:'30',quantityUnclear:false,dateNote:'Hoje'},
  {name:'frango',quantity:'',quantityUnclear:true,dateNote:''}
 ]);
});

test('separa ausência de lista, resposta bloqueada ou inválida e cota esgotada',async()=>{
 const request=fetcher=>readPhoto('example',{key:'test-key',fetcher});
 assert.deepEqual(await request(async()=>result([])),[]);
 await assert.rejects(request(async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})),/GEMINI_RESPONSE_FAILED/);
 await assert.rejects(request(async()=>result(null)),/GEMINI_RESPONSE_FAILED/);
 await assert.rejects(request(async()=>new Response('',{status:429})),/GEMINI_HTTP_429/);
});
