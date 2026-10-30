import {apiFetch} from './api-fetch.js';
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Megaphone,CalendarDays,Clock3,RefreshCw,ChevronRight,Users,ShieldCheck,ClipboardList,Sun,Moon,ChevronDown,UserRound} from 'lucide-react';
import {auth} from './firebase.js';
import {useUnitLive} from './useUnitLive.js';
import LiveStatus from './LiveStatus.jsx';
import {noticeExpired,noticeHistorical} from '../server/workflows/notice-policy.js';
import PublishedRoster from './PublishedRoster.jsx';
import {rosterToday,liveShiftState} from '../server/schedules/restaurant-today.js';
import './operations-planning.css';
import './mural-v5.css';

async function read(module,action,payload={}){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Faça login novamente.');
 const response=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module,action,...payload})});
 const data=await response.json();
 if(!response.ok)throw Error(data.message||'Não foi possível atualizar o mural.');
 return data;
}
const monthLabel=period=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(period+'-01T12:00:00Z'));
const todayInSaoPaulo=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export default function TeamMural({membership}){
 const [schedules,setSchedules]=useState([]),[notices,setNotices]=useState([]),[presence,setPresence]=useState({}),[today,setToday]=useState(todayInSaoPaulo),[productionTasks,setProductionTasks]=useState([]),[productionError,setProductionError]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState(null),[staff,setStaff]=useState([]),[clock,setClock]=useState('00:00');
 const [noticeCursor,setNoticeCursor]=useState(null),[presenceError,setPresenceError]=useState(''),[showNoticeHistory,setShowNoticeHistory]=useState(false);
 const manager=['admin','manager','submanager'].includes(membership.role);
 const refresh=useCallback(async()=>{
  try{
   const [roster,board,people]=await Promise.all([read('schedules','list'),read('mural','publicNotices'),read('attendanceV31','teamDirectory')]);
   setStaff(people.registry||[]);
   setSchedules((roster.schedules||[]).filter(x=>x.status==='published').sort((a,b)=>String(b.period).localeCompare(String(a.period))));
   setNotices(board.items||[]);setNoticeCursor(board.nextCursor||null);setError('');return true;
  }catch(e){setError(e.message);return false}finally{setLoading(false)}
 },[membership?.unitId,membership?.role]);
 const refreshProduction=useCallback(async()=>{try{const token=await auth.currentUser?.getIdToken();if(!token)return;const response=await apiFetch('/api/production/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'dayList'})});if(!response.ok)throw Error('Produção indisponível');const data=await response.json();setProductionTasks(data.tasks||[]);setProductionError('');return true}catch{setProductionError('Não foi possível consultar o planejamento de hoje.');return false}},[membership?.unitId]);
 const refreshPresence=useCallback(async()=>{
  try{const result=await read('attendanceV31','teamToday');setPresence(Object.fromEntries((result.presence||[]).map(x=>[x.uid,x])));setPresenceError('');return true;}
  catch{setPresenceError('Presenças indisponíveis. A escala prevista não confirma quem está trabalhando.');return false;}
 },[membership?.unitId]);
 useEffect(()=>{setSchedules([]);setNotices([]);setStaff([]);setPresence({});setProductionTasks([]);setLoading(true);},[membership?.unitId]);

 const live=useUnitLive(membership?.unitId,(_initial,changes)=>Promise.all([
  !changes||changes.some(x=>['team','schedules','mural'].includes(x))?refresh():true,
  !changes||changes.some(x=>['attendance','team'].includes(x))?refreshPresence():true,
  !changes||changes.includes('production')?refreshProduction():true
 ]),{domains:['attendance','team','schedules','mural','production'],refreshKey:membership.role});
 useEffect(()=>{let lastDate=todayInSaoPaulo();const tick=()=>{const date=todayInSaoPaulo();if(date!==lastDate){lastDate=date;refresh();refreshPresence();refreshProduction();}setToday(date);setClock(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));};tick();const timer=setInterval(tick,30000);return()=>clearInterval(timer)},[refresh,refreshPresence,refreshProduction]);
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
  return {uid:entry.uid,name:employee?.name||entry.name||'Funcionário',shift,area,start:live.start,status:live.label,source:live.source,badge:live.badge,declared:live.declared,active:live.active,scheduledNow:live.due,ongoing:live.active,upcoming:live.upcoming};

 }),[current,today,staff,presence,clock]);
 const nowTeam=roster.filter(x=>x.ongoing);
 const nextTeam=roster.filter(x=>!x.ongoing&&x.upcoming).sort((a,b)=>a.start.localeCompare(b.start));
 const withoutTime=roster.filter(x=>!x.start&&!x.ongoing);
 const [teamFilter,setTeamFilter]=useState('all');
 const [openShifts,setOpenShifts]=useState({Manhã:true,Noite:false,Intermediário:false,Variável:false});
 const endedTeam=roster.filter(x=>x.start&&!x.ongoing&&!x.upcoming);
 const visibleTeam=teamFilter==='now'?nowTeam:teamFilter==='next'?nextTeam:teamFilter==='ended'?endedTeam:roster;
 const [noticeForm,setNoticeForm]=useState({title:'',body:'',priority:'normal',expiresOn:''}),[publishing,setPublishing]=useState(false);
 const publishNotice=async e=>{e.preventDefault();if(publishing||!window.confirm('Publicar este comunicado para a unidade?'))return;setPublishing(true);try{const token=await auth.currentUser.getIdToken();const write=async(action,payload)=>{const response=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'mural',action,...payload})});const d=await response.json();if(!response.ok)throw Error(d.message);return d};const draft=await write('saveDraft',{item:{kind:'notice',...noticeForm}});await write('publish',{id:draft.id});setNoticeForm({title:'',body:'',priority:'normal',expiresOn:''});await refresh()}catch(e){setError(e.message)}finally{setPublishing(false)}};
 const [showAllNotices,setShowAllNotices]=useState(false);
 const historicalNotices=notices.filter(item=>noticeHistorical(item,today));
 const archiveNotice=async id=>{if(!window.confirm('Arquivar este comunicado? Ele continuará no histórico da unidade.'))return;try{await read('mural','archive',{id});await refresh()}catch(e){setError(e.message)}};
 const prioritized=notices.filter(item=>!noticeHistorical(item,today)).sort((a,b)=>({urgent:2,important:1,normal:0}[b.priority||'normal']-({urgent:2,important:1,normal:0}[a.priority||'normal']))||String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
 const visibleNotices=showAllNotices?prioritized:prioritized.slice(0,2);
 const loadOlder=async()=>{try{const d=await read('mural','publicNotices',{before:noticeCursor});setNotices(a=>[...a,...(d.items||[]).filter(p=>!a.some(x=>x.id===p.id))]);setNoticeCursor(d.nextCursor||null)}catch(e){setError(e.message)}};
 const markRead=async id=>{try{await read('mural','noticeRead',{id});setNotices(a=>a.map(x=>x.id===id?{...x,read:true}:x))}catch(e){setError(e.message)}};
 const publishedCurrent=Boolean(current);
 const scheduleLabel=publishedCurrent?'Escala do mês publicada':'Sem escala oficial para este mês';
 return <section className="ti-planning ti-mural-home ti-mural-v4" aria-label="Mural da equipe">
  <header className="ti-mural-v5-hero"><div className="ti-mural-v5-overline"><Megaphone size={18}/> MURAL DA EQUIPE</div><h1>Tudo da sua unidade em um só lugar</h1><p>Comunicados, escala, folgas e informações do dia.</p><LiveStatus state={live}/></header>
  <section className="ti-mural-v5-stats" aria-label="Resumo de hoje"><div><Users size={18}/><strong>{roster.length}</strong><small>Equipe de hoje</small></div><div><ShieldCheck size={18}/><strong>{presenceError?'—':roster.filter(p=>p.declared).length}</strong><small>Entradas declaradas</small></div><div><Clock3 size={18}/><strong>{presenceError?'—':roster.filter(p=>!p.declared).length}</strong><small>Sem entrada declarada</small></div><div><Sun size={18}/><strong>{roster.filter(p=>p.shift==='Manhã').length}</strong><small>Manhã · {roster.filter(p=>p.shift==='Noite').length} noite</small></div></section>
  {error&&<p role="alert" className="team-error">{error}</p>}{presenceError&&<p role="status" className="team-error">{presenceError}</p>}
  <nav className="ti-mural-v5-nav" aria-label="Navegar no mural">{[['mural-v5-team','Equipe de hoje'],['mural-v5-notices','Comunicados'],['mural-v5-schedule','Escala mensal'],['mural-v5-production','Produção']].map(([target,label])=><button type="button" key={target} onClick={()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'})}>{label}</button>)}</nav>
  <div className="ti-mural-v4-sections">
   <section id="mural-v5-team" className="ti-mural-card ti-mural-roster ti-v4-feature ti-mural-v5-roster" aria-labelledby="mural-roster-title">
    <header className="ti-v4-section-title"><div className="ti-v4-title-left"><CalendarDays size={22} aria-hidden="true"/><div><h2 id="mural-roster-title">Escala da equipe</h2><p>{loading?'Carregando escala…':scheduleLabel}</p></div></div>{publishedCurrent&&<span className="ti-v4-official"><ShieldCheck size={14} aria-hidden="true"/> Oficial</span>}</header>
    <div className="ti-v4-roster-summary">
     <div className="ti-v4-roster-metric"><Users size={18} aria-hidden="true"/><div><strong>Equipe de hoje</strong><span>{!publishedCurrent?'Sem escala publicada':`${roster.length} escalado(s) para hoje`}</span></div></div>
     <div className="ti-v4-roster-metric"><Clock3 size={18} aria-hidden="true"/><div><strong>Jornadas declaradas</strong><span>{presenceError?'Presenças indisponíveis':!publishedCurrent?'Aguardando escala':`${nowTeam.length} em trabalho ou intervalo declarado`}</span><small>{roster.filter(p=>p.scheduledNow).length} com horário previsto em curso · não confirma presença</small></div></div>
    </div>
    {publishedCurrent&&<div className="ti-mural-v5-shifts">{['Manhã','Noite','Intermediário','Variável','Turno a definir'].filter(shift=>roster.some(p=>p.shift===shift)).map(shift=>{const members=roster.filter(p=>p.shift===shift);const isOpen=openShifts[shift]??false;return <section key={shift} className="ti-mural-v5-shift"><button type="button" className="ti-mural-v5-shift-toggle" aria-expanded={isOpen} onClick={()=>setOpenShifts(v=>({...v,[shift]:!isOpen}))}>{shift==='Noite'?<Moon size={17}/>:<Sun size={17}/>}<strong>{shift==='Turno a definir'?shift:'Turno '+shift.toLowerCase()}</strong><span>{members.length} colaboradores</span><ChevronDown size={17}/></button>{isOpen&&<ul className="ti-mural-v5-staff">{members.map(p=><li key={p.uid} className={!presenceError&&p.active?'confirmed':''}><div className="ti-mural-v5-avatar"><UserRound size={18}/></div><div className="ti-mural-v5-person"><strong>{p.name}</strong><small>{p.area} · {p.shift}</small></div><div className="ti-mural-v5-time"><strong>{p.start||'—'}</strong><small>{p.start?'Horário previsto':'A definir'}</small></div><span className={!presenceError&&p.active?'ti-mural-v5-status confirmed':'ti-mural-v5-status'}>{presenceError?'Presença indisponível':p.badge}</span></li>)}</ul>}</section>})}</div>}
    <details id="mural-v5-schedule" className="ti-mural-roster-details ti-v4-roster-details"><summary><CalendarDays size={18} aria-hidden="true"/> Consultar escala mensal e folgas <ChevronRight size={17} aria-hidden="true"/></summary>
    {loading?<p role="status">Carregando escalas…</p>:schedules.length===0?<p className="ti-mural-empty">Nenhuma escala publicada.</p>:<>
     <div className="ti-mural-period-list">{schedules.slice(0,12).map(s=><button type="button" key={s.id} className={selected===s.id?'ti-mural-period active':'ti-mural-period'} aria-pressed={selected===s.id} onClick={()=>setExpanded(s.id)}>{monthLabel(s.period)}{s.id===current?.id&&<small>Mês atual</small>}</button>)}</div>
     {active?<PublishedRoster key={active.id} schedule={active} presence={presence}/>:<p>Escolha uma escala para consultar.</p>}
    </>}
    </details>
   </section>
   <section id="mural-v5-notices" className="ti-mural-card ti-mural-notices ti-v4-feature" aria-labelledby="mural-notices-title">
    <header className="ti-v4-section-title"><div className="ti-v4-title-left"><Megaphone size={22} aria-hidden="true"/><div><h2 id="mural-notices-title">Comunicados</h2><p>Mensagens publicadas para a sua unidade.</p></div></div><span className="ti-v4-count" aria-label={prioritized.length+' comunicados atuais'}>{prioritized.length}</span></header>
    {loading?<p role="status">Carregando comunicados…</p>:prioritized.length===0?<p className="ti-mural-empty">Nenhum comunicado atual no momento.</p>:<>
     <ul className="ti-v4-notice-list">{visibleNotices.map(item=><li key={item.id} className="ti-v4-notice"><div className="ti-v4-notice-symbol"><Megaphone size={16} aria-hidden="true"/></div><div className="ti-v4-notice-copy"><span className={'ti-v4-notice-priority '+(item.priority||'normal')}>{({normal:'Comunicado',important:'Importante',urgent:'Urgente'})[item.priority||'normal']}</span><strong>{item.title||'Comunicado da unidade'}{!item.read&&<span className="ti-v4-count">Novo</span>}</strong><details><summary>{item.body?.slice(0,140)}{item.body?.length>140?'…':''}</summary><p>{item.body}</p></details><small>{item.publishedByName||'Gestão da unidade'}{item.publishedAt?' · '+new Date(item.publishedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):''}</small>{item.expiresOn&&<small>Válido até {item.expiresOn.split('-').reverse().join('/')}</small>}{!item.read&&<button type="button" className="ti-v4-secondary-link" onClick={()=>markRead(item.id)}>Marcar como lido</button>}{manager&&<button type="button" className="ti-v4-secondary-link" onClick={()=>archiveNotice(item.id)}>Arquivar comunicado</button>}</div></li>)}</ul>
     {prioritized.length>2&&<button type="button" className="ti-v4-secondary-link" aria-expanded={showAllNotices} onClick={()=>setShowAllNotices(v=>!v)}>{showAllNotices?'Mostrar menos':`Ver todos os ${prioritized.length} comunicados`} <ChevronRight size={16} aria-hidden="true"/></button>}
    </>}
    {noticeCursor&&<button type="button" className="ti-v4-secondary-link" onClick={loadOlder}>Carregar comunicados anteriores</button>}
    <button type="button" className="ti-v4-secondary-link" aria-expanded={showNoticeHistory} onClick={()=>setShowNoticeHistory(v=>!v)}>Comunicados anteriores · {historicalNotices.length}</button>
    {showNoticeHistory&&<div className="ti-v4-notice-list">{historicalNotices.length?historicalNotices.map(item=><article key={item.id} className="ti-v4-notice"><div className="ti-v4-notice-copy"><strong>{item.title}</strong><small>{item.status==='archived'?'Arquivado':noticeExpired(item,today)?'Validade encerrada':''}{item.expiresOn?' · '+item.expiresOn.split('-').reverse().join('/'):''}</small><p>{item.body}</p>{manager&&item.status!=='archived'&&<button type="button" onClick={()=>archiveNotice(item.id)}>Arquivar comunicado</button>}</div></article>):<p>Nenhum comunicado anterior nesta consulta.</p>}</div>}
    {manager&&<details className="ti-mural-roster-details"><summary>Publicar comunicado</summary><form className="stock-action-form" onSubmit={publishNotice}><label>Título<input required minLength={3} maxLength={100} value={noticeForm.title} onChange={e=>setNoticeForm(x=>({...x,title:e.target.value}))}/></label><label>Prioridade<select value={noticeForm.priority} onChange={e=>setNoticeForm(x=>({...x,priority:e.target.value}))}><option value="normal">Normal</option><option value="important">Importante</option><option value="urgent">Urgente</option></select></label><label>Válido até (opcional)<input type="date" min={today} value={noticeForm.expiresOn} onChange={e=>setNoticeForm(x=>({...x,expiresOn:e.target.value}))}/></label><small>Sem data, permanece publicado até a gestão arquivar.</small><label>Mensagem<textarea required maxLength={3000} value={noticeForm.body} onChange={e=>setNoticeForm(x=>({...x,body:e.target.value}))}/></label><button type="submit" disabled={publishing}>{publishing?'Publicando…':'Revisar e publicar'}</button></form></details>}
   </section>

   <section id="mural-v5-production" className="ti-mural-card ti-v4-feature ti-v4-production-mural" aria-labelledby="mural-production-title"><header className="ti-v4-section-title"><div className="ti-v4-title-left"><ClipboardList size={22} aria-hidden="true"/><div><h2 id="mural-production-title">Produção de hoje</h2><p>Planejamento compartilhado da cozinha.</p></div></div></header>{productionError?<p role="status" className="ti-mural-empty">{productionError}</p>:productionTasks.length===0?<p className="ti-mural-empty">Nenhuma preparação planejada para hoje.</p>:<ul className="ti-v4-mural-tasks">{productionTasks.map(task=><li key={task.id}><span><strong>{task.recipeName}</strong><small>{task.plannedQuantity?task.plannedQuantity+" "+(task.unit||"un")+" planejadas":"Quantidade livre"}</small></span><em className={task.status==="completed"?"complete":""}>{task.status==="completed"?"Concluída":task.status==="partial"?"Parcial":"Pendente"}</em></li>)}</ul>}</section>
  </div>
 </section>;
}
