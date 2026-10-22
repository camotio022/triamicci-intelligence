import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Megaphone,CalendarDays,Clock3,RefreshCw,ChevronRight,Users,ShieldCheck,ClipboardList} from 'lucide-react';
import {doc,onSnapshot} from 'firebase/firestore';
import {auth,db} from './firebase.js';
import PublishedRoster from './PublishedRoster.jsx';
import {rosterToday,liveShiftState} from '../server/schedules/restaurant-today.js';
import './operations-planning.css';

async function read(module,action){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Faça login novamente.');
 const response=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module,action})});
 const data=await response.json();
 if(!response.ok)throw Error(data.message||'Não foi possível atualizar o mural.');
 return data;
}
const monthLabel=period=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(period+'-01T12:00:00Z'));
const todayInSaoPaulo=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export default function TeamMural({membership}){
 const [schedules,setSchedules]=useState([]),[notices,setNotices]=useState([]),[presence,setPresence]=useState({}),[today,setToday]=useState(todayInSaoPaulo),[productionTasks,setProductionTasks]=useState([]),[productionError,setProductionError]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState(null),[staff,setStaff]=useState([]),[clock,setClock]=useState('00:00');
 const refresh=useCallback(async()=>{
  try{
   const [roster,board,people]=await Promise.all([read('schedules','list'),read('mural','publicNotices'),read(undefined,'masterRegistryPreview')]);
   setStaff((people.registry||[]).filter(x=>x.status==='active'));
   setSchedules((roster.schedules||[]).filter(x=>x.status==='published').sort((a,b)=>String(b.period).localeCompare(String(a.period))));
   setNotices(board.items||[]);setError('');
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[membership?.unitId]);
 const refreshProduction=useCallback(async()=>{try{const token=await auth.currentUser?.getIdToken();if(!token)return;const response=await fetch('/api/production/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'dayList'})});if(!response.ok)throw Error('Produção indisponível');const data=await response.json();setProductionTasks(data.tasks||[]);setProductionError('')}catch{setProductionError('Não foi possível consultar o planejamento de hoje.')}},[membership?.unitId]);
 const refreshPresence=useCallback(async()=>{
  try{const result=await read('attendanceV31','teamToday');setPresence(Object.fromEntries((result.presence||[]).map(x=>[x.uid,x])));}
  catch{/* A escala permanece disponível se a presença não puder ser consultada. */}
 },[membership?.unitId]);
 useEffect(()=>{setSchedules([]);setNotices([]);setStaff([]);setPresence({});setProductionTasks([]);setLoading(true);},[membership?.unitId]);
 useEffect(()=>{refresh();refreshPresence();refreshProduction();const onVisible=()=>{if(document.visibilityState==='visible'){setToday(todayInSaoPaulo());refresh();refreshPresence();refreshProduction()}};document.addEventListener('visibilitychange',onVisible);const interval=setInterval(onVisible,60000);return()=>{document.removeEventListener('visibilitychange',onVisible);clearInterval(interval)}},[refresh,refreshPresence,refreshProduction]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')refreshProduction()},30000);return()=>clearInterval(timer)},[refreshProduction]);
 useEffect(()=>{if(!membership?.unitId)return;let first=true;return onSnapshot(doc(db,'units',membership.unitId,'live','attendance'),()=>{if(first){first=false;return}refreshPresence()},()=>{});},[membership?.unitId,refreshPresence]);
 useEffect(()=>{const tick=()=>setClock(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));tick();const timer=setInterval(tick,30000);return()=>clearInterval(timer)},[]);
 const current=useMemo(()=>schedules.find(x=>x.period===today.slice(0,7)),[schedules,today]);
 const selected=expanded===null?current?.id:expanded;
 const active=schedules.find(x=>x.id===selected);
 const roster=useMemo(()=>rosterToday(current,today).filter(x=>x.operationalStatus==='scheduled_unconfirmed').map(entry=>{
  const employee=staff.find(x=>x.id===entry.uid||x.accountUid===entry.uid);
  const shift=({manha:'Manhã',noite:'Noite',intermediario:'Intermediário',variavel:'Variável'})[String(employee?.shift||entry.shift||'').toLowerCase()]||'Turno a definir';
  const area=({cozinha:'Cozinha',frente:'Frente',caixa:'Caixa',apoio:'Apoio',gestao:'Gestão'})[String(employee?.sector||entry.sector||'').toLowerCase()]||'Setor a definir';
  const weekday=['dom','seg','ter','qua','qui','sex','sab'][new Date(today+'T12:00:00Z').getUTCDay()];
  const habitual=Array.isArray(employee?.availability)?employee.availability.find(slot=>slot.day===weekday):null;
  const start=/^([01]\d|2[0-3]):[0-5]\d$/.test(habitual?.start||'')?habitual.start:null;
  const attendance=presence[employee?.accountUid||entry.uid]||presence[entry.uid]||null;
  const live=liveShiftState({day:today,clock,employee:employee||{},attendance});
  return {uid:entry.uid,name:employee?.name||entry.name||'Funcionário',shift,area,start:live.start,status:live.label,source:live.source,ongoing:live.due||Boolean(attendance&&['working','on_break'].includes(attendance.status)),upcoming:live.upcoming};

 }),[current,today,staff,presence,clock]);
 const nowTeam=roster.filter(x=>x.ongoing);
 const nextTeam=roster.filter(x=>!x.ongoing&&x.upcoming).sort((a,b)=>a.start.localeCompare(b.start));
 const withoutTime=roster.filter(x=>!x.start&&!x.ongoing);
 const [showAllNotices,setShowAllNotices]=useState(false);
 const visibleNotices=showAllNotices?notices:notices.slice(0,2);
 const publishedCurrent=Boolean(current);
 const scheduleLabel=publishedCurrent?'Escala do mês publicada':'Sem escala oficial para este mês';
 return <section className="ti-planning ti-mural-home ti-mural-v4" aria-label="Mural da equipe">
  <header className="ti-mural-header"><div><span className="eyebrow">INFORMAÇÕES DA UNIDADE</span><h1>Mural da equipe</h1><p>Comunicados, escala e informações do dia em um só lugar.</p></div><button type="button" className="ti-mural-refresh" aria-label="Atualizar informações do mural" title="Atualizar mural" onClick={()=>{refresh();refreshPresence();refreshProduction()}}><RefreshCw size={17}/><span>Atualizar</span></button></header>
  {error&&<p role="alert" className="team-error">{error}</p>}
  <div className="ti-mural-v4-sections">
   <section className="ti-mural-card ti-mural-notices ti-v4-feature" aria-labelledby="mural-notices-title">
    <header className="ti-v4-section-title"><div className="ti-v4-title-left"><Megaphone size={22} aria-hidden="true"/><div><h2 id="mural-notices-title">Comunicados</h2><p>Mensagens publicadas para a sua unidade.</p></div></div><span className="ti-v4-count" aria-label={notices.length+' comunicados'}>{notices.length}</span></header>
    {loading?<p role="status">Carregando comunicados…</p>:notices.length===0?<p className="ti-mural-empty">Nenhum comunicado publicado no momento.</p>:<>
     <ul className="ti-v4-notice-list">{visibleNotices.map(item=><li key={item.id} className="ti-v4-notice"><div className="ti-v4-notice-symbol"><Megaphone size={16} aria-hidden="true"/></div><div className="ti-v4-notice-copy"><strong>{item.title||'Comunicado da unidade'}</strong><p>{item.body}</p></div></li>)}</ul>
     {notices.length>2&&<button type="button" className="ti-v4-secondary-link" aria-expanded={showAllNotices} onClick={()=>setShowAllNotices(v=>!v)}>{showAllNotices?'Mostrar menos':`Ver todos os ${notices.length} comunicados`} <ChevronRight size={16} aria-hidden="true"/></button>}
    </>}
   </section>
   <section className="ti-mural-card ti-v4-feature ti-v4-production-mural" aria-labelledby="mural-production-title"><header className="ti-v4-section-title"><div className="ti-v4-title-left"><ClipboardList size={22} aria-hidden="true"/><div><h2 id="mural-production-title">Produção de hoje</h2><p>Planejamento compartilhado da cozinha.</p></div></div></header>{productionError?<p role="status" className="ti-mural-empty">{productionError}</p>:productionTasks.length===0?<p className="ti-mural-empty">Nenhuma preparação planejada para hoje.</p>:<ul className="ti-v4-mural-tasks">{productionTasks.map(task=><li key={task.id}><span><strong>{task.recipeName}</strong><small>{task.plannedQuantity?task.plannedQuantity+" porções planejadas":"Quantidade livre"}</small></span><em className={task.status==="completed"?"complete":""}>{task.status==="completed"?"Concluída":"Pendente"}</em></li>)}</ul>}</section>
   <section className="ti-mural-card ti-mural-roster ti-v4-feature" aria-labelledby="mural-roster-title">
    <header className="ti-v4-section-title"><div className="ti-v4-title-left"><CalendarDays size={22} aria-hidden="true"/><div><h2 id="mural-roster-title">Escala da equipe</h2><p>{loading?'Carregando escala…':scheduleLabel}</p></div></div>{publishedCurrent&&<span className="ti-v4-official"><ShieldCheck size={14} aria-hidden="true"/> Oficial</span>}</header>
    <div className="ti-v4-roster-summary">
     <div className="ti-v4-roster-metric"><Users size={18} aria-hidden="true"/><div><strong>Equipe de hoje</strong><span>{!publishedCurrent?'Sem escala publicada':`${roster.length} escalado(s) para hoje`}</span></div></div>
     <div className="ti-v4-roster-metric"><Clock3 size={18} aria-hidden="true"/><div><strong>Em andamento</strong><span>{!publishedCurrent?'Aguardando escala':nowTeam.length?`${nowTeam.length} com turno em andamento`:nextTeam.length?'Nenhum turno em andamento no momento':'Sem turno ativo ou próximo identificado'}</span></div></div>
    </div>
    {publishedCurrent&&nowTeam.length>0&&<div className="ti-mural-now"><h3>Agora <small>{nowTeam.length}</small></h3><ul>{nowTeam.map(p=><li key={p.uid} className={p.source==='employee'?'ti-live-confirmed':''}><strong>{p.name}</strong><span>{p.area} · {p.shift}{p.start?' · '+p.start:''}</span><small>{p.status}</small></li>)}</ul></div>}
    {publishedCurrent&&nextTeam.length>0&&<div className="ti-mural-next"><h3>Próximos a entrar</h3><ul>{nextTeam.map(p=><li key={p.uid}><strong>{p.name}</strong><span>{p.area} · {p.shift} · {p.start||'Horário não informado'}</span></li>)}</ul></div>}
    {withoutTime.length>0&&<div className="ti-mural-next"><h3>Horário a definir <small>· por turno</small></h3><ul>{withoutTime.map(p=><li key={p.uid}><strong>{p.name}</strong><span>{p.area} · {p.shift}</span></li>)}</ul></div>}
    <details className="ti-mural-roster-details ti-v4-roster-details"><summary><CalendarDays size={18} aria-hidden="true"/> Consultar escala mensal e folgas <ChevronRight size={17} aria-hidden="true"/></summary>
    {loading?<p role="status">Carregando escalas…</p>:schedules.length===0?<p className="ti-mural-empty">Nenhuma escala publicada.</p>:<>
     <div className="ti-mural-period-list">{schedules.slice(0,12).map(s=><button type="button" key={s.id} className={selected===s.id?'ti-mural-period active':'ti-mural-period'} aria-pressed={selected===s.id} onClick={()=>setExpanded(s.id)}>{monthLabel(s.period)}{s.id===current?.id&&<small>Mês atual</small>}</button>)}</div>
     {active?<PublishedRoster key={active.id} schedule={active} presence={presence}/>:<p>Escolha uma escala para consultar.</p>}
    </>}
    </details>
   </section>
  </div>
 </section>;
}
