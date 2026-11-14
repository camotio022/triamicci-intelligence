import React,{useEffect,useRef,useState} from 'react';
import {Bot,ArrowUp,ImagePlus,X,ShieldCheck,History,Plus,Trash2,PanelLeftClose,SquarePen,Search} from 'lucide-react';
import {sessionAuth as auth} from './firebase.js';
import {apiFetch} from './api-fetch.js';
import AIMessageFormat from './AIMessageFormat.jsx';
import {consumeAssistantSSE} from './ai-stream.js';
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
 const [liveText,setLiveText]=useState('');
 const dialogRef=useRef(null);
 const [threadId,setThreadId]=useState(()=>crypto.randomUUID());
 const [threads,setThreads]=useState([]);
 const [showHistory,setShowHistory]=useState(false);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [historyError,setHistoryError]=useState('');
 const [historySearch,setHistorySearch]=useState('');
 const [viewportHeight,setViewportHeight]=useState(null);
 const composerRef=useRef(null),textareaRef=useRef(null),historyTriggerRef=useRef(null),drawerRef=useRef(null);
 const fileRef=useRef(null),endRef=useRef(null);
 async function historyApi(action,threadId){
  const token=await auth.currentUser?.getIdToken();
  if(!token)throw Error('Faça login novamente.');
  const response=await apiFetch('/api/production/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({action,threadId})});
  const data=await response.json();
  if(!response.ok)throw Error(data.message||'Não foi possível consultar as conversas.');
  return data;
 }
 async function refreshThreads(){
  const data=await historyApi('assistantHistoryList');
  setThreads(data.threads||[]);
 }
 useEffect(()=>{refreshThreads().catch(e=>setHistoryError(e.message));},[]);
 useEffect(()=>{
  const viewport=window.visualViewport;
  if(!viewport)return;
  const update=()=>setViewportHeight(Math.round(viewport.height+viewport.offsetTop));
  update();viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);
  return()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);};
 },[]);
 useEffect(()=>{const field=textareaRef.current;if(field){field.style.height='auto';field.style.height=Math.min(field.scrollHeight,144)+'px';}},[draft]);
 useEffect(()=>{
  if(!showHistory)return;
  const onKey=e=>{if(e.key==='Escape'){setShowHistory(false);historyTriggerRef.current?.focus();}};
  document.addEventListener('keydown',onKey);
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  drawerRef.current?.querySelector('input')?.focus();
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=old;};
 },[showHistory]);
 useEffect(()=>{const area=dialogRef.current;if(area)area.scrollTop=area.scrollHeight;},[messages.length,liveText]);
 function newConversation(){
  if(pending)return;
  setThreadId(crypto.randomUUID());setMessages([]);setDraft('');setAttachment(null);setError('');setShowHistory(false);textareaRef.current?.focus();
 }
 async function openConversation(id){
  if(pending||historyBusy)return;
  setHistoryBusy(true);setHistoryError('');
  try{const data=await historyApi('assistantHistoryGet',id);setThreadId(id);setMessages(data.messages||[]);setDraft('');setAttachment(null);setError('');setShowHistory(false);}
  catch(e){setHistoryError(e.message);}finally{setHistoryBusy(false);}
 }
 async function deleteConversation(id){
  if(pending||historyBusy||!window.confirm('Apagar esta conversa do histórico?'))return;
  setHistoryBusy(true);setHistoryError('');
  try{await historyApi('assistantHistoryDelete',id);setThreads(old=>old.filter(t=>t.id!==id));if(threadId===id)newConversation();}
  catch(e){setHistoryError(e.message);}finally{setHistoryBusy(false);}
 }
 async function submit(event){
  event.preventDefault();
  const message=draft.trim();
  if(pending||message.length<2)return;
  const previous=messages;
  const own={role:'user',text:message,hasPhoto:!!attachment};
  setMessages([...previous,own]);setDraft('');setError('');setLiveText('');setPending(true);
  try{
   const image=attachment?await jpegBase64(attachment):undefined;
   const token=await auth.currentUser?.getIdToken();
   if(!token)throw Error('Faça login para conversar com o assistente.');
   // Streaming requests bypass the JSON caching client: consume bytes as they arrive.
   const response=await fetch('/api/production/manage',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    cache:'no-store',
    body:JSON.stringify({action:'assistantChat',stream:true,threadId,message,image,
     history:previous.slice(-6).map(({role,text})=>({role,text}))})});
   const result=await consumeAssistantSSE(response,part=>setLiveText(part));
   if(!result.text.trim())throw Error('O assistente não retornou uma resposta.');
   setMessages(old=>[...old,{role:'assistant',text:result.text}]);
   setLiveText('');setAttachment(null);
   if(result.historySaved)refreshThreads().catch(()=>{});
   else setHistoryError('Resposta recebida, mas não foi possível guardar esta conversa.');
  }catch(e){setError(e.message||'Erro temporário.');setMessages(previous);setLiveText('');setDraft(message);}
  finally{setPending(false);}
 }
 const filteredThreads=threads.filter(t=>(t.title||'').toLocaleLowerCase('pt-BR').includes(historySearch.toLocaleLowerCase('pt-BR')));
 return <section className="ti-ai-page" style={viewportHeight?{'--ti-ai-viewport-height':viewportHeight+'px'}:undefined} aria-label="Assistente operacional">
  <header className="ti-ai-head">
   <div className="ti-ai-heading"><span className="ti-ai-symbol"><Bot size={21}/></span><div><h1>Assistente Triamicci</h1><p>Inteligência operacional</p></div></div>
   <div className="ti-ai-heading-actions">
    <button ref={historyTriggerRef} type="button" className="ti-ai-icon-button" onClick={()=>setShowHistory(true)} aria-label="Abrir histórico de conversas" aria-haspopup="dialog" disabled={pending}><History size={21}/></button>
    <button type="button" className="ti-ai-icon-button" onClick={newConversation} aria-label="Nova conversa" disabled={pending}><SquarePen size={21}/></button>
   </div>
  </header>
  <p className="ti-ai-privacy"><ShieldCheck size={14}/> Recomendações de apoio · sem alterar dados da loja</p>
  <div className="ti-ai-dialog" ref={dialogRef} role="log" aria-live="off" aria-label="Mensagens da conversa">
   {!messages.length&&!pending&&<div className="ti-ai-welcome">
    <span className="ti-ai-welcome-icon"><Bot size={25}/></span>
    <h2>Como posso ajudar hoje?</h2>
    <p>Consulte sua operação e receba sugestões para a unidade.</p>
    <div className="ti-ai-chips">{['O que precisa de reposição?','Organize a produção de hoje','Como planejar a escala?'].map(q=><button key={q} type="button" onClick={()=>{setDraft(q);textareaRef.current?.focus();}}>{q}</button>)}</div>
   </div>}
   {messages.map((m,i)=><article className={'ti-ai-msg '+(m.role==='user'?'is-user':'is-ai')} key={i}>
     {m.role==='assistant'?<div className="ti-ai-agent-name"><Bot size={17}/> Assistente</div>:null}
     {m.role==='assistant'?<AIMessageFormat text={m.text}/>:<p>{m.text}</p>}
     {m.hasPhoto&&<small>Foto anexada</small>}
    </article>)}
   {pending&&(liveText?<article className="ti-ai-msg is-ai ti-ai-streaming"><div className="ti-ai-agent-name"><Bot size={17}/> Assistente <i className="ti-ai-cursor" aria-hidden="true"/></div><AIMessageFormat text={liveText}/></article>:<p className="ti-ai-loading" role="status">Preparando a resposta…</p>)}
   <div ref={endRef}/>
  </div>
  <form className="ti-ai-compose" ref={composerRef} onSubmit={submit}>
   {attachment&&<div className="ti-ai-file"><span>{attachment.name}</span><button type="button" aria-label="Remover anexo" onClick={()=>setAttachment(null)}><X size={17}/></button></div>}
   {error&&<p className="ti-ai-error" role="alert">{error}</p>}
   <label className="sr-only" htmlFor="ti-ai-question">Pergunte algo sobre sua operação</label>
   <textarea ref={textareaRef} id="ti-ai-question" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} maxLength={1800} rows={1} placeholder="Pergunte sobre sua operação…" disabled={pending}/>
   <div className="ti-ai-actions">
    <input ref={fileRef} className="sr-only" type="file" accept="image/*" aria-label="Selecionar foto" onChange={e=>setAttachment(e.target.files?.[0]||null)}/>
    <button type="button" className="ti-ai-attach" onClick={()=>fileRef.current?.click()} disabled={pending} aria-label="Anexar foto"><ImagePlus size={19}/></button>
    <span className="ti-ai-compose-hint">Somente leitura</span>
    <button className="ti-ai-send" type="submit" aria-label="Enviar pergunta" disabled={pending||draft.trim().length<2}><ArrowUp size={20}/></button>
   </div>
  </form>
  {showHistory&&<div className="ti-ai-drawer-layer">
   <button type="button" className="ti-ai-drawer-backdrop" aria-label="Fechar histórico" onClick={()=>setShowHistory(false)}/>
   <aside className="ti-ai-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Histórico do Assistente Triamicci">
    <div className="ti-ai-drawer-top"><strong>Conversas</strong><button type="button" aria-label="Fechar painel de conversas" onClick={()=>{setShowHistory(false);historyTriggerRef.current?.focus();}}><PanelLeftClose size={22}/></button></div>
    <button type="button" className="ti-ai-new-thread" onClick={newConversation} disabled={pending}><Plus size={19}/> Nova conversa</button>
    <label className="ti-ai-history-search"><Search size={17}/><input type="search" value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Buscar conversa" aria-label="Buscar conversa pelo título"/></label>
    {historyError&&<p className="ti-ai-error" role="alert">{historyError}</p>}
    <div className="ti-ai-threads">
     {!filteredThreads.length&&<p className="ti-ai-history-empty">{threads.length?'Nenhum resultado encontrado.':'Nenhuma conversa salva ainda.'}</p>}
     {filteredThreads.map(t=><div className="ti-ai-thread" key={t.id}>
      <button type="button" onClick={()=>openConversation(t.id)} disabled={historyBusy||pending} aria-current={t.id===threadId?'page':undefined}><span>{t.title||'Conversa sem título'}</span><small>{t.updatedAt?new Date(t.updatedAt).toLocaleDateString('pt-BR'):'Sem data'}</small></button>
      <button type="button" className="ti-ai-remove-thread" disabled={historyBusy||pending} aria-label={'Apagar '+t.title} onClick={()=>deleteConversation(t.id)}><Trash2 size={16}/></button>
     </div>)}
    </div>
    <div className="ti-ai-drawer-note"><ShieldCheck size={15}/> Histórico privado da sua conta e unidade</div>
   </aside>
  </div>}
 </section>;
}
