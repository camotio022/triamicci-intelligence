import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeAssistantSSE} from '../src/ai-stream.js';

test('SSE progressively displays text even when event JSON splits across chunks',async()=>{
 const chunks=[
  'data: {"type":"delta","text":"Olá',
  '!"}\n\ndata: {"type":"delta","text":" Hoje."}\n\n',
  'data: {"type":"done","historySaved":true}\n\n'
 ];
 let rendered=[];
 const stream=new ReadableStream({start(controller){for(const part of chunks)controller.enqueue(new TextEncoder().encode(part));controller.close();}});
 const result=await consumeAssistantSSE(new Response(stream,{status:200}),text=>rendered.push(text));
 assert.deepEqual(rendered,['Olá!','Olá! Hoje.']);
 assert.deepEqual(result,{text:'Olá! Hoje.',historySaved:true,draftSaved:null});
});
test('SSE interrupted before done is not treated as a saved answer',async()=>{
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"Parcial"}\n\n'));c.close();}});
 await assert.rejects(consumeAssistantSSE(new Response(stream),()=>{}),/interrompida/);
});
test('SSE propagates server-side errors and non-200 messages',async()=>{
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"type":"error","message":"Sem conexão"}\n\n'));c.close();}});
 await assert.rejects(consumeAssistantSSE(new Response(stream),()=>{}),/Sem conexão/);
 await assert.rejects(consumeAssistantSSE(new Response(JSON.stringify({message:'Limite diário'}),{status:429,headers:{'content-type':'application/json'}}),()=>{}),/Limite diário/);
});
