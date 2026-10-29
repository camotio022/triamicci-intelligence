import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import TriamicciHistory from './TriamicciHistory.jsx';
import {auth} from './firebase.js';
import './operations-planning.css';
import './leave-v4.css';
async function api(action,extra={}){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Sessão expirada.');
 const res=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'schedules',action,...extra})});
 const body=await res.json();
 if(!res.ok)throw Error(body.message||'Falha na solicitação.');
 return body;
}
const statuses={pending:'Pendente',approved:'Aprovada',rejected:'Recusada'};
const todayInUnit=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value||'Data indisponível';
 return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
};
export default function LeaveRequests({membership}){
 const [requests,setRequests]=useState([]),[date,setDate]=useState(''),[reason,setReason]=useState(''),[notes,setNotes]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 const [reviewId,setReviewId]=useState(null),[showForm,setShowForm]=useState(false),[filter,setFilter]=useState('pending');
 const [context,setContext]=useState(null);
 useEffect(()=>{let active=true;setContext(null);if(date)api('leaveContext',{date}).then(d=>{if(active)setContext(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[date,membership.unitId]);
 const manager=['admin','manager','submanager'].includes(membership.role);
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{const d=await api('leaveList');setRequests(d.requests||[]);setError('');}
  catch(e){setError(e.message);}
  finally{setLoading(false);}
 },[membership.unitId]);
 useUnitLive(membership?.unitId,()=>load(true));
 useEffect(()=>{setRequests([]);setReviewId(null);setNotes({});setError('');setNotice('');load();},[load]);
 const filtered=useMemo(()=>manager&&filter!=='all'?requests.filter(x=>x.status===filter):requests,[requests,manager,filter]);
 const pendingCount=requests.filter(x=>x.status==='pending').length;
 const submit=async e=>{
  e.preventDefault();if(busy)return;
  if(date<todayInUnit()){setError('Escolha uma data de hoje em diante.');return;}
  if(!window.confirm('Enviar a solicitação de folga para '+dateLabel(date)+'? A aprovação não muda automaticamente a escala.'))return;
  setBusy(true);setError('');setNotice('');
  try{const d=await api('leaveRequest',{date,reason:reason.trim()});setNotice(d.message);setReason('');setDate('');setShowForm(false);await load();}
  catch(e){setError(e.message);}
  finally{setBusy(false);}
 };
 const decide=async(id,decision)=>{
  if(busy)return;
  const note=(notes[id]||'').trim();
  if(note.length<8){setError('Informe uma justificativa com pelo menos 8 caracteres.');return;}
  if(!window.confirm((decision==='approved'?'Aprovar':'Recusar')+' esta solicitação? A decisão ficará registrada e não alterará a escala oficial automaticamente.'))return;
  setBusy(true);setError('');setNotice('');
  try{const d=await api('leaveDecision',{id,decision,note});setNotice(d.message);setReviewId(null);await load();}
  catch(e){setError(e.message);}
  finally{setBusy(false);}
 };
 return <section className="ti-planning ti-leave-v4">
  <p className="eyebrow">EQUIPE · FOLGAS</p>
  <h1>Solicitações de folga</h1>
  <p>A aprovação não altera a escala oficial. A gestão deve revisar e publicar a escala correspondente.</p>
  <div className="ti-leave-v4-intro">
   <div><strong>{manager?pendingCount:requests.filter(x=>x.status==='pending').length}</strong><span>{manager?'Pedidos aguardando decisão':'Meus pedidos pendentes'}</span></div>
   <button type="button" className="ti-leave-v4-primary" onClick={()=>setShowForm(v=>!v)} aria-expanded={showForm} aria-controls="ti-leave-request-form">{showForm?'Fechar formulário':'Solicitar folga'}</button>
  </div>
  {showForm&&<section id="ti-leave-request-form" className="ti-planning-card ti-leave-v4-form">
   <h2>Novo pedido</h2>
   <p>Informe a data desejada e o motivo. A disponibilidade depende da escala oficial e da aprovação.</p>
   <form onSubmit={submit}>
    <label>Data desejada<input required type="date" min={todayInUnit()} value={date} onChange={e=>setDate(e.target.value)}/></label>
    {date&&context&&<p role="status" className="receiving-notice">{context.official?'Escala oficial: pedidos comuns encerrados. Utilize troca ou cobertura.':context.pending?'Já existe um pedido em análise para esta data.':context.entry?('Programação: '+({work:'trabalho',off:'folga',monthly_sunday:'domingo de folga',leave:'ausência'})[context.entry.type]):'Sem escala oficial para esta data. O pedido será analisado no planejamento.'}{context.nextOff&&' Próxima folga publicada: '+dateLabel(context.nextOff)+'.'}</p>}
    <label>Justificativa<textarea required minLength={10} maxLength={400} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button type="submit" className="ti-leave-v4-primary" disabled={busy||reason.trim().length<10||!date||context?.official||context?.pending}> {busy?'Enviando...':'Revisar e enviar pedido'}</button>
   </form>
  </section>}
  <section className="ti-planning-card ti-leave-v4-requests">
   <div className="ti-planning-heading">
    <div><h2>{manager?'Pedidos da equipe':'Meus pedidos'}</h2><small>{filtered.length} {filtered.length===1?'registro':'registros'} na lista</small></div>
    <button type="button" onClick={load} disabled={loading||busy}>Atualizar</button>
   </div>
   {manager&&<div className="ti-leave-v4-filters" role="group" aria-label="Filtrar solicitações">
    {[['pending','Pendentes'],['all','Todas'],['approved','Aprovadas'],['rejected','Recusadas']].map(([key,label])=><button type="button" key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>{setFilter(key);setReviewId(null)}}>{label}</button>)}
   </div>}
   {loading?<p role="status">Carregando solicitações...</p>:filtered.length===0?<p className="ti-leave-v4-empty">Nenhuma solicitação neste filtro.</p>:<div className="ti-leave-v4-list">{filtered.map(x=><article className="ti-leave-v4-item" key={x.id}>
    <div className="ti-leave-v4-item-head"><div><strong>{dateLabel(x.date)}</strong><span className={'ti-leave-v4-status '+(x.status||'')}>{statuses[x.status]||x.status}</span></div>
    {manager&&x.status==='pending'&&<button type="button" disabled={busy} aria-expanded={reviewId===x.id} onClick={()=>setReviewId(v=>v===x.id?null:x.id)}>{reviewId===x.id?'Fechar revisão':'Revisar pedido'}</button>}</div>
    <p>{x.reason}</p>
    {x.note&&<small className="ti-leave-v4-note">Decisão: {x.note}</small>}
    {manager&&reviewId===x.id&&x.status==='pending'&&<div className="ti-leave-v4-review">
     <label>Justificativa da decisão<textarea rows={3} maxLength={400} minLength={8} value={notes[x.id]||''} onChange={e=>setNotes(n=>({...n,[x.id]:e.target.value}))} placeholder="Registre o motivo da decisão"/></label>
     <div className="ti-leave-v4-actions"><button type="button" disabled={busy||(notes[x.id]||'').trim().length<8} onClick={()=>decide(x.id,'approved')}>Aprovar</button><button type="button" disabled={busy||(notes[x.id]||'').trim().length<8} onClick={()=>decide(x.id,'rejected')}>Recusar</button></div>
     <small>A decisão não altera a escala automaticamente.</small>
    </div>}
   </article>)}</div>}
  </section>
  <section className="ti-planning-card"><TriamicciHistory title="Histórico de solicitações" records={requests.filter(x=>x.status==='approved'||x.status==='rejected')}
    getId={x=>x.id} getTitle={x=>dateLabel(x.date)} getDate={x=>x.decidedAt||x.updatedAt||x.createdAt||x.date||null}
    getQuantity={x=>statuses[x.status]||x.status} getDescription={x=>x.reason||'Solicitação de folga'}
    getPerson={x=>x.actorName||x.requesterName||x.employeeName}
    renderDetails={x=><div>{x.note?'Decisão: '+x.note:'Sem observações'} · ID: {x.id}</div>}
    empty="Nenhuma solicitação concluída no período."/></section>
  {notice&&<p role="status" className="ti-leave-v4-message">{notice}</p>}
  {error&&<p role="alert" className="team-error">{error}</p>}
 </section>;
}
