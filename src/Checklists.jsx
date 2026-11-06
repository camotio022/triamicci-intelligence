import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ClipboardCheck,Camera,ChevronLeft,Clock,Plus,AlertCircle,CheckCircle2} from 'lucide-react';
import {auth} from './firebase.js';
import {apiFetch} from './api-fetch.js';
import {useUnitLive} from './useUnitLive.js';
import {isManagement} from '../server/permissions/v31-policy.js';
import ChecklistEditor from './ChecklistEditor.jsx';
import ChecklistCamera from './ChecklistCamera.jsx';
import './checklists.css';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
const statusName={pending:'Em andamento',problem:'Com pendências',completed:'Concluído'};
const roleName={auxiliar:'Auxiliar',cook:'Cozinheiro',manager:'Gerente',submanager:'Subgerente',admin:'Administrador'};
const date=x=>x?new Date(x).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export async function checklistCall(action,payload={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const res=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'checklists',action,...payload})});
 const d=await res.json();if(!res.ok)throw Error(d.message||'Não foi possível enviar. Tente novamente.');return d;
}
function Evidence({id,call}){
 const [image,setImage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const open=async()=>{setBusy(true);setError('');try{setImage((await call('photoRead',{photoId:id})).dataUrl);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="ti-check-evidence">{image?<><img src={image} alt="Evidência privada da conferência"/><button type="button" className="secondary" onClick={()=>setImage('')}>Fechar foto</button></>:<button type="button" className="secondary" disabled={busy} onClick={open}><Camera size={18}/> {busy?'Carregando…':'Ver foto'}</button>}{error&&<p role="status">{error}</p>}</div>;
}
function Execution({initial,call,management,onBack}){
 const [run,setRun]=useState(initial),[index,setIndex]=useState(()=>Math.max(0,initial.model.items.findIndex(x=>!initial.answers?.[x.id]))),[status,setStatus]=useState(''),[note,setNote]=useState(''),[photoId,setPhotoId]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[resolution,setResolution]=useState('');
 const item=run.model.items[index],answer=run.answers?.[item.id],progress=run.progress;
 const load=async()=>{const data=await call('run',{runId:run.id});setRun(data.run);return data.run;};
 const choose=i=>{setIndex(i);setStatus('');setNote('');setPhotoId(null);setError('');setResolution('');};
 const submit=async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await call('answer',{runId:run.id,itemId:item.id,expectedRevision:run.revision,status,note,photoId});const next=await load();const nextIndex=next.model.items.findIndex(x=>!next.answers?.[x.id]);if(nextIndex>=0)choose(nextIndex);else{setStatus('');setPhotoId(null);setNote('');}}
  catch(e){setError(e.message+' Se necessário, recarregue a conferência.');}
  finally{setBusy(false);}
 };
 const resolve=async e=>{e.preventDefault();setBusy(true);setError('');try{await call('resolveProblem',{runId:run.id,itemId:item.id,expectedRevision:run.revision,note:resolution});await load();setResolution('');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="ti-check-execution">
  <button type="button" className="secondary" onClick={onBack}><ChevronLeft size={18}/> Voltar aos checklists</button>
  <h2>{run.model.name}</h2><p>{run.day.split('-').reverse().join('/')} · {progress.answered} de {progress.total} itens conferidos</p><progress value={progress.answered} max={progress.total}/>
  {progress.status==='completed'&&<p role="status" className="ti-check-success"><CheckCircle2 size={18}/> Conferência concluída e enviada.</p>}
  <nav className="ti-check-item-nav" aria-label="Itens do checklist">{run.model.items.map((x,i)=><button type="button" key={x.id} className={index===i?'selected':''} aria-label={'Item '+(i+1)+': '+x.title} aria-current={index===i?'step':undefined} onClick={()=>choose(i)}>{i+1}{run.answers?.[x.id]?' ✓':''}</button>)}</nav>
  <article className="ti-check-card" aria-label="Conferir item">
   <small>Item {index+1} de {run.model.items.length}</small><div className="ti-check-badges">{item.critical&&<span className="critical">Crítico</span>}{item.required&&<span>Obrigatório</span>}{item.photoRequired&&<span>Foto na hora</span>}</div><h3>{item.title}</h3>{item.guidance&&<p>{item.guidance}</p>}
   {answer?<>
    <p className={answer.status==='problem'?'ti-check-alert':'ti-check-success'}>{({checked:'Conferido',problem:'Problema informado',na:'Não se aplica'})[answer.status]}</p><p>{answer.note}</p><small>{answer.name} · {date(answer.at)}</small>
    {answer.photoId&&<Evidence key={answer.photoId} id={answer.photoId} call={call}/>}
    {answer.resolution?<div className="ti-check-success"><strong>Tratamento registrado</strong><p>{answer.resolution.note}</p><small>{answer.resolution.name} · {date(answer.resolution.at)}</small></div>:answer.status==='problem'&&management&&<form onSubmit={resolve}><label>Tratamento da ocorrência<textarea required minLength={5} maxLength={600} value={resolution} onChange={e=>setResolution(e.target.value)}/></label><button disabled={busy} type="submit">Registrar tratamento</button></form>}
   </>:run.day!==restaurantDay()?<p>Este item não foi conferido naquele dia. O histórico foi preservado.</p>:<form onSubmit={submit}>
    <ChecklistCamera key={item.id} runId={run.id} itemId={item.id} call={call} onUploaded={setPhotoId} disabled={busy}/>
    <fieldset className="ti-check-response" disabled={busy}><legend>Resultado da conferência</legend>{[['checked','Conferido'],['problem','Com problema'],...(item.allowNA?[['na','Não se aplica']]:[])].map(([value,label])=><label key={value} className={status===value?'selected '+value:''}><input required type="radio" name={'answer-'+item.id} value={value} checked={status===value} onChange={()=>setStatus(value)}/>{label}</label>)}</fieldset>
    <label>{['problem','na'].includes(status)?'Explique o ocorrido':'Observação (opcional)'}<textarea required={['problem','na'].includes(status)} minLength={['problem','na'].includes(status)?5:undefined} maxLength={600} value={note} onChange={e=>setNote(e.target.value)}/></label>
    {item.photoRequired&&!photoId&&<p className="ti-check-hint">Este item exige uma foto enviada antes da confirmação.</p>}
    <button className="ti-check-confirm" type="submit" disabled={busy||!status||item.photoRequired&&!photoId}>{busy?'Enviando…':'Confirmar e continuar'}</button>
   </form>}
   {error&&<p role="alert" className="ti-check-alert">{error}</p>}
   <button type="button" className="secondary" disabled={busy} onClick={async()=>{try{await load();setError('');}catch(e){setError(e.message);}}}>Recarregar conferência</button>
  </article>
 </section>;
}
export default function Checklists({membership,call=checklistCall}){
 const management=isManagement(membership.role),[tab,setTab]=useState('today'),[data,setData]=useState(null),[templates,setTemplates]=useState([]),[templateCursor,setTemplateCursor]=useState(null),[history,setHistory]=useState([]),[cursor,setCursor]=useState(null),[run,setRun]=useState(null),[editor,setEditor]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[online,setOnline]=useState(navigator.onLine!==false);
 const currentTab=useRef(tab);currentTab.current=tab;const startId=useRef(null);
 const refresh=useCallback(async()=>{try{const d=await call('today');setData(d);setError('');if(currentTab.current==='management'&&management){const models=await call('templates');setTemplates(models.templates);setTemplateCursor(models.next||null);}return true;}catch(e){setError(e.message);return false;}finally{setLoading(false);}},[call,management]);
 useUnitLive(membership.unitId,refresh,{domains:['checklists'],refreshKey:membership.role});
 useEffect(()=>{const checkDay=()=>{if(data?.day&&data.day!==restaurantDay())refresh();};const timer=setInterval(checkDay,60000);document.addEventListener('visibilitychange',checkDay);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',checkDay);};},[data?.day,refresh]);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine!==false);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const changeTab=async value=>{setTab(value);setEditor(null);setRun(null);setError('');setBusy(true);try{if(value==='management'){const models=await call('templates');setTemplates(models.templates);setTemplateCursor(models.next||null);}if(value==='history'){const d=await call('history');setHistory(d.runs);setCursor(d.next);}}catch(e){setError(e.message);}finally{setBusy(false);}};
 const open=async(template,existing)=>{if(busy||!online)return;setBusy(true);setError('');setNotice('');try{let id=existing?.id;if(!id){startId.current=startId.current?.templateId===template.id?startId.current:{templateId:template.id,id:crypto.randomUUID()};id=(await call('start',{templateId:template.id,requestId:startId.current.id})).runId;startId.current=null;}setRun((await call('run',{runId:id})).run);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const cards=data?[...data.templates.filter(t=>!data.runs.some(r=>r.templateId===t.id&&t.model.frequency!=='manual')).map(t=>({template:t})),...data.runs.map(r=>({run:r}))]:[];
 return <section className="ti-checklists">
  <header className="ti-check-heading"><small>OPERAÇÃO · {membership.unitId}</small><h1><ClipboardCheck size={29}/> Checklists da unidade</h1><p>Conferências da rotina, responsáveis e evidências em um só lugar.</p></header>
  <nav className="ti-check-tabs" aria-label="Áreas dos checklists">{[['today','Hoje'],['history','Histórico'],...(management?[['management','Gestão']]:[])].map(([value,label])=><button type="button" key={value} aria-current={tab===value?'page':undefined} className={tab===value?'selected':''} onClick={()=>changeTab(value)}>{label}</button>)}</nav>
  {!online&&<p role="status" className="ti-check-alert">Você está sem conexão. Nenhuma nova conferência será apresentada como enviada. Reconecte para continuar.</p>}
  {error&&<p role="alert" className="ti-check-alert">{error}</p>}{notice&&<p role="status" className="ti-check-success">{notice}</p>}
  {run?<Execution key={run.id} initial={run} call={call} management={management} onBack={()=>{setRun(null);refresh();}}/>:editor?<ChecklistEditor key={editor.template?.id||'new'} {...editor} call={call} onSaved={async message=>{setNotice(message);setEditor(null);await changeTab('management');refresh();}} onCancel={()=>{setEditor(null);changeTab('management');}}/>:tab==='today'?<>
   {loading?<p role="status">Consultando checklists…</p>:data&&<><p className="ti-check-day">{data.day.split('-').reverse().join('/')} · {cards.length} lista(s)</p>{!data.photoEnabled&&<p className="ti-check-hint">Fotos aguardam configuração do armazenamento privado. Itens com foto obrigatória não podem ser concluídos sem evidência.</p>}{!cards.length?<div className="ti-check-card ti-check-empty"><ClipboardCheck size={36}/><h2>Nenhum checklist para hoje</h2><p>{management?'Crie e publique um modelo na aba Gestão.':'A gestão ainda não publicou listas para sua função neste dia.'}</p></div>:<div className="ti-check-card-grid">{cards.map(({template,run:r})=>{const m=r?.model||template.model,p=r?.progress,overdue=p?.status!=='completed'&&new Date(data.day+'T'+m.dueTime+':00-03:00')<new Date();return <article className="ti-check-card" key={r?.id||template.id}><div className="ti-check-card-top"><h2>{m.name}</h2><span className={'ti-check-pill '+(p?.status||'pending')}>{p?statusName[p.status]:'Não iniciado'}</span></div><p>{p?.answered||0} de {m.items.length} itens conferidos</p><progress value={p?.answered||0} max={m.items.length}/><p className={overdue?'ti-check-late':''}><Clock size={16}/> {overdue?'Prazo ultrapassado':'Prazo'}: {m.dueTime}</p><small>{m.roles.map(x=>roleName[x]).join(' · ')}</small>{(p?.criticalPending||(!r?m.items.filter(i=>i.critical).length:0))>0&&<p className="ti-check-alert"><AlertCircle size={17}/> {p?.criticalPending||m.items.filter(i=>i.critical).length} item(ns) crítico(s) pendente(s)</p>}<button type="button" disabled={busy||!online} onClick={()=>open(template,r)}>{r?p.status==='completed'?'Ver conferência':'Continuar conferência':'Iniciar checklist'}</button></article>;})}</div>}</>}
  </>:tab==='management'?<>
   <div className="ti-check-section-heading"><h2>Modelos da unidade</h2><button type="button" onClick={()=>setEditor({})}><Plus size={18}/> Criar checklist</button></div><p>Você cadastra os itens. Não há listas fixas programadas.</p>
   {!templates.length&&!busy&&<p className="ti-check-card">Nenhum modelo cadastrado.</p>}
   <div className="ti-check-card-grid">{templates.map(t=><article className="ti-check-card" key={t.id}><h3>{(t.draft||t.published).name}</h3><p>{t.archived?'Arquivado':t.published?'Publicado · versão '+t.version:'Rascunho'}{t.hasDraft&&t.published?' · Há alterações não publicadas':''}</p><div className="ti-check-actions">{!t.archived&&<button type="button" className="secondary" onClick={()=>setEditor({template:t})}>Editar modelo</button>}<button type="button" className="secondary" onClick={()=>setEditor({template:t,duplicate:true})}>Duplicar</button>{!t.archived&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{if(!window.confirm('Arquivar este modelo? Conferências existentes serão preservadas.'))return;setBusy(true);try{await call('archiveTemplate',{id:t.id,expectedRevision:t.revision});await changeTab('management');refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Arquivar</button>}</div></article>)}</div>
   {templateCursor&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const d=await call('templates',{before:templateCursor});setTemplates(old=>[...old,...d.templates]);setTemplateCursor(d.next||null);}catch(e){setError(e.message);}finally{setBusy(false);}}}>Carregar outros modelos</button>}
  </>:<><h2>Conferências anteriores</h2><p>Registros preservados por dia, incluindo ocorrências e responsáveis.</p>{!history.length&&!busy&&<p className="ti-check-card">Nenhuma conferência anterior encontrada.</p>}<div className="ti-check-card-grid">{history.map(r=><article className="ti-check-card" key={r.id}><h3>{r.model.name}</h3><p>{r.day.split('-').reverse().join('/')} · {statusName[r.progress.status]}</p><p>{r.progress.answered} de {r.progress.total} itens</p><button type="button" className="secondary" disabled={busy} onClick={()=>open(null,r)}>Ver conferência</button></article>)}</div>{cursor&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const d=await call('history',{before:cursor});setHistory(old=>[...old,...d.runs]);setCursor(d.next);}catch(e){setError(e.message);}finally{setBusy(false);}}}>Carregar anteriores</button>}</>}
 </section>;
}
