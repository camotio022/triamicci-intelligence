import {apiFetch} from './api-fetch.js';
import {useUnitLive} from './useUnitLive.js';
import {liveShiftState} from '../server/schedules/restaurant-today.js';
import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import './my-journey-v41.css';
import './my-journey-v5.css';
const actions={not_started:['clock_in','Registrar entrada'],working:['break_start','Iniciar intervalo'],on_break:['break_end','Retornar do intervalo'],finished:[]};
async function call(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const r=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'attendanceV31',action,...extra})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Não foi possível registrar.');return data;
}
export default function MyAttendanceV31({unitId}){
 const [mySchedules,setMySchedules]=useState([]);
 const [expandedSchedule,setExpandedSchedule]=useState(true),[expandedTimeline,setExpandedTimeline]=useState(false),[monthOffset,setMonthOffset]=useState(0);
 const [profile,setProfile]=useState(null),[clock,setClock]=useState('00:00'),[record,setRecord]=useState(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{try{const d=await call('today');setRecord(d.record);setDay(d.day)}catch(e){setError(e.message)}},[]);
 const refreshProfile=async()=>{try{const token=await auth.currentUser?.getIdToken();if(!token)return false;const r=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'myProfile'})});const d=await r.json();if(!r.ok)throw Error(d.message);setProfile(d.professional||null);return true}catch(e){setError(e.message);return false}};
 useEffect(()=>{let lastDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());const update=()=>{const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());if(date!==lastDate){lastDate=date;reload();refreshSchedule().catch(e=>setError(e.message));}setClock(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));};update();const timer=setInterval(update,30000);return()=>clearInterval(timer)},[]);
 const refreshSchedule=async()=>{const token=await auth.currentUser?.getIdToken();if(!token)return;const r=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'schedules',action:'mine'})});const d=await r.json();if(!r.ok)throw Error(d.message);setMySchedules(d.schedules||[])};
 useUnitLive(unitId,(_initial,changes)=>Promise.all([!changes||changes.includes('attendance')?reload():true,!changes||changes.some(x=>['schedules','team'].includes(x))?refreshSchedule():true,!changes||changes.some(x=>['profile','team'].includes(x))?refreshProfile():true]),{domains:['attendance','schedules','team','profile']});

 const status=record?.status||'not_started';
 const events=record?.events||[];
 const hasEvent=action=>events.some(event=>event.action===action);
 const eventDate=value=>{
  if(!value)return null;
  const seconds=value._seconds??value.seconds;
  const parsed=typeof seconds==='number'?new Date(seconds*1000):new Date(value);
  return Number.isNaN(parsed.getTime())?null:parsed;
 };
 const eventTime=action=>{
  const event=[...events].reverse().find(item=>item.action===action);
  const at=eventDate(event?.at);
  return at?at.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}):'—';
 };
 const returnedFromBreak=hasEvent('break_end');
 const next=status==='working'&&returnedFromBreak?['clock_out','Encerrar jornada']:actions[status];
 const operationalDay=day||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const publishedEntries=mySchedules.flatMap(s=>s.entries||[]).sort((a,b)=>a.date.localeCompare(b.date));
 const todayEntry=publishedEntries.find(e=>e.date===operationalDay);
 const nextEntry=publishedEntries.find(e=>e.date>operationalDay&&e.type==='work');
 const off=todayEntry&&todayEntry.type!=='work';
 const stages=[
  {key:'schedule',title:'Escala oficial',detail:todayEntry?(todayEntry.type==='work'?'Dia de trabalho publicado':'Dia de folga ou ausência publicado'):'Sem escala publicada para hoje',kind:todayEntry?'planned':'unknown'},
  {key:'clock_in',title:'Entrada',detail:status==='not_started'?'Aguardando seu registro':'Entrada declarada pelo colaborador',kind:status==='not_started'?'pending':'declared'},
  {key:'break_start',title:'Início do intervalo',detail:hasEvent('break_start')?'Intervalo registrado':'Aguardando declaração',kind:hasEvent('break_start')?'declared':'pending'},
  {key:'break_end',title:'Retorno do intervalo',detail:hasEvent('break_end')?'Retorno registrado':'Aguardando retorno',kind:hasEvent('break_end')?'declared':'pending'},
  {key:'clock_out',title:'Saída',detail:status==='finished'?'Saída declarada · confirmação presencial pendente':'Aguardando declaração',kind:status==='finished'?'declared':'pending'}
 ];
 const months=[...new Set(publishedEntries.map(e=>e.date.slice(0,7)))];
 const currentMonth=operationalDay.slice(0,7);
 const baseMonthIndex=Math.max(0,months.indexOf(currentMonth));
 const selectedMonth=months[Math.min(Math.max(baseMonthIndex+monthOffset,0),Math.max(0,months.length-1))]||currentMonth;
 const monthEntries=publishedEntries.filter(e=>e.date.startsWith(selectedMonth));
 const upcoming=publishedEntries.filter(e=>e.date>operationalDay).slice(0,3);
 const dateLabel=date=>date?.split('-').reverse().join('/')||'—';
 const typeLabel={work:'Trabalho',off:'Folga',monthly_sunday:'Domingo de folga',leave:'Ausência'};

 const live=liveShiftState({day:day||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),clock,employee:todayEntry?.type==='work'?profile||{}:{},attendance:record});
 const labels={not_started:'Entrada ainda não registrada',working:'Entrada declarada · aguardando confirmação presencial',on_break:'Intervalo declarado',finished:'Saída declarada · aguardando confirmação'};
 const submit=async(action=next?.[0])=>{if(!action||busy)return;setBusy(true);setError('');setNotice('');try{const d=await call(action,{requestId:crypto.randomUUID()});setRecord(p=>({...p,status:d.status,events:[...(p?.events||[]),{action,at:new Date().toISOString()}]}));setNotice('Declaração registrada. A confirmação da presença física depende de validação no estabelecimento.');await reload()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <section className="ti-attendance-v31 ti-attendance-v5" aria-label="Minha jornada">
  <div className="ti-attendance-v5-heading"><div><span className="ti-attendance-eyebrow">JORNADA DE HOJE · {day||'HOJE'}</span><h2>Minha jornada</h2><p>{status==='not_started'?(off?'Folga ou ausência na escala oficial':!todayEntry?'Sem escala oficial para hoje':live.label):status==='working'&&returnedFromBreak?'Retorno do intervalo registrado · jornada em andamento':labels[status]}</p></div><span className="ti-attendance-v5-state">{status==='finished'?'Encerrada':status==='not_started'?'Não iniciada':'Em andamento'}</span></div>
  <div className="ti-attendance-v5-schedule"><span>Horário previsto: <strong>{live.start||'Não informado'}{live.end?'–'+live.end:''}</strong></span><span>{todayEntry?'Escala: '+(typeLabel[todayEntry.type]||'Publicada'):'Sem escala oficial para hoje'}</span></div>
  <div className="ti-attendance-v5-progress" aria-label="Etapas da jornada">{stages.map((stage,i)=><div key={stage.key} className={'ti-attendance-v5-milestone '+stage.kind}><span className="ti-attendance-v5-circle" aria-hidden="true"/><strong>{stage.title}</strong><small>{i===0?(live.start||'—'):eventTime(stage.key)}</small></div>)}</div>
  <div className="ti-attendance-actions ti-attendance-v5-actions">
   {next?.length>0&&<button className="ti-attendance-primary" type="button" onClick={()=>submit()} disabled={busy}>{busy?'Registrando…':next[1]}</button>}
   {status==='working'&&!returnedFromBreak&&<button className="ti-attendance-secondary" type="button" onClick={()=>submit('clock_out')} disabled={busy}>Encerrar jornada</button>}
  </div>
  {notice&&<p role="status" className="ti-attendance-notice">{notice}</p>}
  {error&&<p role="alert">{error}</p>}
  <button className="ti-attendance-v5-expand" type="button" onClick={()=>setExpandedTimeline(v=>!v)} aria-expanded={expandedTimeline}>{expandedTimeline?'Ocultar detalhes da jornada':'Ver detalhes da jornada'} <span aria-hidden="true">{expandedTimeline?'−':'+'}</span></button>
  {expandedTimeline&&<div className="ti-attendance-v5-expanded"><section className="ti-journey-timeline" aria-label="Linha do tempo da jornada"><div className="ti-journey-heading"><strong>Eventos do dia</strong><span>Previstos e declarados</span></div><ol>{stages.map(stage=><li key={stage.key} className={'ti-journey-step ti-journey-'+stage.kind}><span className="ti-journey-dot" aria-hidden="true"/><div><strong>{stage.title}</strong><small>{stage.detail}{stage.key!=='schedule'&&eventTime(stage.key)!=='—'?' · '+eventTime(stage.key):''}</small></div></li>)}</ol></section><p>Os horários das marcações são extraídos dos eventos registrados. O horário da escala é previsto; declarações exigem validação presencial.</p></div>}
  <div className="ti-attendance-v5-bottom">   {upcoming.length>0&&<section className="ti-journey-upcoming" aria-label="Próximos dias publicados"><strong>Próximos dias</strong><div className="ti-journey-nextgrid">{upcoming.map(e=><article key={e.uid+e.date}><small>{dateLabel(e.date)}</small><b>{typeLabel[e.type]||'Escala'}</b></article>)}</div></section>}
   <section className="ti-journey-month">
    <button type="button" className="ti-journey-month-toggle" aria-expanded={expandedSchedule} onClick={()=>setExpandedSchedule(v=>!v)}><span><strong>Minha escala completa</strong><small>Calendário mensal, folgas e jornadas publicadas</small></span><span aria-hidden="true">{expandedSchedule?'−':'+'}</span></button>
    {expandedSchedule&&<div className="ti-journey-month-body">
     <div className="ti-journey-monthnav"><button type="button" onClick={()=>setMonthOffset(v=>v-1)} disabled={baseMonthIndex+monthOffset<=0} aria-label="Mês anterior">‹</button><strong>{selectedMonth.split('-').reverse().join('/')}</strong><button type="button" onClick={()=>setMonthOffset(v=>v+1)} disabled={baseMonthIndex+monthOffset>=months.length-1} aria-label="Mês seguinte">›</button></div>
     {monthEntries.length?<div className="ti-v5-calendar" role="grid" aria-label="Dias da escala">{['D','S','T','Q','Q','S','S'].map((d,i)=><span key={'h'+i} className="ti-v5-cal-head">{d}</span>)}{Array.from({length:new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7))-1,1).getDay()},(_,i)=><span key={'pad'+i}/>)}{Array.from({length:new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7)),0).getDate()},(_,i)=>{const n=i+1,dt=selectedMonth+'-'+String(n).padStart(2,'0'),entry=monthEntries.find(e=>e.date===dt);return <span key={dt} title={entry?typeLabel[entry.type]||'Escala':'Não publicado'} className={'ti-v5-cal-day '+(dt===operationalDay?'today ':'')+(entry?.type==='work'?'work':entry?'off':'')}><b>{n}</b>{entry&&<i/>}</span>})}</div>:<p>Nenhuma escala publicada para este mês.</p>}
    </div>}
   </section>
  </div>
 </section>;
}
