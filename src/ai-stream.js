// A Vercel response can be chunked at arbitrary byte boundaries.
export async function consumeAssistantSSE(response,onDelta){
 if(!response.ok){
  let data={};try{data=await response.json();}catch{}
  throw Error(data.message||'Não foi possível consultar o assistente.');
 }
 if(!response.body?.getReader)throw Error('Seu navegador não conseguiu receber a resposta em tempo real.');
 const decoder=new TextDecoder(),reader=response.body.getReader();
 let buffer='',text='',completed=false,saved=false;
 const process=frame=>{
  for(const row of frame.split('\n')){
   if(!row.startsWith('data:'))continue;
   const raw=row.slice(5).trim();if(!raw)continue;
   let event;try{event=JSON.parse(raw);}catch{throw Error('Resposta interrompida.');}
   if(event.type==='delta'&&typeof event.text==='string'){
    text+=event.text;onDelta(text);
   }else if(event.type==='done'){completed=true;saved=!!event.historySaved;}
   else if(event.type==='error')throw Error(event.message||'A transmissão foi interrompida.');
  }
 };
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');
   let i;while((i=buffer.indexOf('\n\n'))>=0){process(buffer.slice(0,i));buffer=buffer.slice(i+2);}
   if(buffer.length>120000)throw Error('Resposta muito longa.');
  }
  buffer+=decoder.decode();
  if(buffer.trim())process(buffer);
 }finally{reader.releaseLock();}
 if(!completed)throw Error('A resposta foi interrompida antes de terminar.');
 return {text,historySaved:saved};
}
