export const DEVICE_KEY='triamicci.terminal.v1';
export const SESSION_KEY='triamicci.terminal-session.v1';
export function storedDevice(){try{const d=JSON.parse(localStorage.getItem(DEVICE_KEY));return d&&typeof d.id==='string'&&typeof d.secret==='string'?d:null}catch{return null}}
export function randomKey(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
export async function terminalCall(action,payload={},credential,signal){
 const response=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify({module:'terminals',action,...payload}),signal});
 const data=await response.json();if(!response.ok){const error=new Error(data.message||'Não foi possível acessar o terminal.');error.status=response.status;throw error}return data;
}
export async function terminalStream(action,payload,credential,onEvent,signal){
 const response=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify({module:'terminals',action,...payload}),signal});
 if(!response.ok){const data=await response.json();const error=new Error(data.message||'Conexão indisponível.');error.status=response.status;throw error}
 if(!response.body)throw Error('Conexão indisponível.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>1000000)throw Error('Resposta inválida.');let i;while((i=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line)onEvent(JSON.parse(line))}}}finally{await reader.cancel().catch(()=>{})}
}
