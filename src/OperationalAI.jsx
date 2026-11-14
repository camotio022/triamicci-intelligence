import React,{useRef,useState} from 'react';
import {Bot,Send,ImagePlus,X,ShieldCheck} from 'lucide-react';
import {sessionAuth as auth} from './firebase.js';
import {apiFetch} from './api-fetch.js';
import './operational-ai.css';

async function jpegBase64(file){
 if(!file?.type.startsWith('image/'))throw Error('Selecione uma imagem.');
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close?.();
 const data=canvas.toDataURL('image/jpeg',0.7).split(',')[1];
 if(data.length>1400000)throw Error('A imagem ainda está grande. Escolha uma foto menor.');
 return data;
}
export default function OperationalAI(){
 const [messages,setMessages]=useState([]);
 const [draft,setDraft]=useState('');
 const [attachment,setAttachment]=useState(null);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 const fileRef=useRef(null),endRef=useRef(null);
 async function submit(event){
  event.preventDefault();
  const message=draft.trim();
  if(pending||message.length<2)return;
  const previous=messages;
  const own={role:'user',text:message,hasPhoto:!!attachment};
  setMessages([...previous,own]);setDraft('');setError('');setPending(true);
  try{
   const image=attachment?await jpegBase64(attachment):undefined;
   const token=await auth.currentUser?.getIdToken();
   if(!token)throw Error('Faça login para conversar com o assistente.');
   const response=await apiFetch('/api/production/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'assistantChat',message,image,history:previous.slice(-6).map(({role,text})=>({role,text}))})});
   const data=await response.json();
   if(!response.ok)throw Error(data.message||'Não foi possível obter a resposta.');
   setMessages(old=>[...old,{role:'assistant',text:data.answer}]);setAttachment(null);
  }catch(e){setError(e.message||'Erro temporário.');setDraft(message);}
  finally{setPending(false);setTimeout(()=>endRef.current?.scrollIntoView({block:'end',behavior:'smooth'}),10);}
 }
 return <section className="ti-ai-page" aria-label="Assistente operacional">
  <header className="ti-ai-head"><span className="ti-ai-symbol"><Bot size={23}/></span><div><h1>Assistente Triamicci</h1><p>Ideias e orientações para sua operação</p></div><span className="ti-ai-beta">BETA</span></header>
  <p className="ti-ai-privacy"><ShieldCheck size={17}/> Somente leitura. Não movimenta estoque nem altera escalas. Não envie dados pessoais ou confidenciais.</p>
  <div className="ti-ai-dialog" aria-live="polite">
   {!messages.length&&<div className="ti-ai-welcome"><strong>Como posso ajudar hoje?</strong><p>Consulte informações e receba sugestões para sua unidade.</p>
    <div className="ti-ai-chips">{['O que pode precisar de reposição?','Sugira uma organização para a produção','Como planejar a escala da cozinha?'].map(s=><button key={s} onClick={()=>setDraft(s)} type="button">{s}</button>)}</div></div>}
   {messages.map((m,i)=><article className={'ti-ai-msg '+(m.role==='user'?'is-user':'is-ai')} key={i}><span>{m.role==='user'?'Você':'Assistente'}</span><p>{m.text}</p>{m.hasPhoto&&<small>Foto anexada</small>}</article>)}
   {pending&&<p className="ti-ai-loading" role="status">Analisando sua pergunta…</p>}
   <div ref={endRef}/>
  </div>
  <form className="ti-ai-compose" onSubmit={submit}>
   {attachment&&<div className="ti-ai-file"><span>{attachment.name}</span><button type="button" aria-label="Remover anexo" onClick={()=>setAttachment(null)}><X size={16}/></button></div>}
   {error&&<p className="ti-ai-error" role="alert">{error}</p>}
   <label className="sr-only" htmlFor="ti-ai-question">Sua pergunta</label>
   <textarea id="ti-ai-question" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1800} rows={2} placeholder="Pergunte algo sobre sua operação…" disabled={pending}/>
   <div className="ti-ai-actions">
    <input ref={fileRef} className="sr-only" type="file" accept="image/*" aria-label="Selecionar foto" onChange={e=>setAttachment(e.target.files?.[0]||null)} />
    <button type="button" className="ti-ai-attach" onClick={()=>fileRef.current?.click()} disabled={pending} aria-label="Anexar foto"><ImagePlus size={20}/><span>Foto</span></button>
    <small>Limite diário para preservar o OCR</small>
    <button className="ti-ai-send" type="submit" disabled={pending||draft.trim().length<2}><Send size={18}/> Enviar</button>
   </div>
  </form>
 </section>;
}
