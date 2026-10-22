import {useUnitLive} from './useUnitLive.js';
import {liveShiftState} from '../server/schedules/restaurant-today.js';
import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
const actions={not_started:['clock_in','Registrar entrada'],working:['break_start','Iniciar intervalo'],on_break:['break_end','Retornar do intervalo'],finished:[]};
async function call(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'attendanceV31',action,...extra})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Não foi possível registrar.');return data;
}
export default function MyAttendanceV31({unitId}){
 const [mySchedules,setMySchedules]=useState([]);
 const [profile,setProfile]=useState(null),[clock,setClock]=useState('00:00'),[record,setRecord]=useState(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{try{const d=await call('today');setRecord(d.record);setDay(d.day)}catch(e){setError(e.message)}},[]);
 useEffect(()=>{let active=true;const token=async()=>auth.currentUser?.getIdToken();token().then(t=>t&&fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({action:'masterRegistryPreview'})})).then(r=>r?.ok?r.json():null).then(d=>{if(active)setProfile((d?.registry||[]).find(p=>p.accountUid===auth.currentUser?.uid)||null)}).catch(()=>{});return()=>{active=false}},[unitId]);
 useEffect(()=>{let lastDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());const update=()=>{const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());if(date!==lastDate){lastDate=date;reload();refreshSchedule().catch(e=>setError(e.message));}setClock(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));};update();const timer=setInterval(update,30000);return()=>clearInterval(timer)},[]);
 const refreshSchedule=async()=>{const token=await auth.currentUser?.getIdToken();if(!token)return;const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'schedules',action:'mine'})});const d=await r.json();if(!r.ok)throw Error(d.message);setMySchedules(d.schedules||[])};
 useUnitLive(unitId,()=>Promise.all([reload(),refreshSchedule()]));
 useEffect(()=>{reload();refreshSchedule().catch(e=>setError(e.message))},[unitId,reload]);
 const status=record?.status||'not_started',next=actions[status];
 const operationalDay=day||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const publishedEntries=mySchedules.flatMap(s=>s.entries||[]).sort((a,b)=>a.date.localeCompare(b.date));
 const todayEntry=publishedEntries.find(e=>e.date===operationalDay);
 const nextEntry=publishedEntries.find(e=>e.date>operationalDay&&e.type==='work');
 const off=todayEntry&&todayEntry.type!=='work';
 const live=liveShiftState({day:day||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),clock,employee:todayEntry?.type==='work'?profile||{}:{},attendance:record});
 const labels={not_started:'Entrada ainda não registrada',working:'Entrada declarada · aguardando confirmação presencial',on_break:'Intervalo declarado',finished:'Saída declarada · aguardando confirmação'};
 const submit=async(action=next?.[0])=>{if(!action||busy)return;setBusy(true);setError('');setNotice('');try{const d=await call(action,{requestId:crypto.randomUUID()});setRecord(p=>({...p,status:d.status}));setNotice('Declaração registrada. A confirmação da presença física depende de validação no estabelecimento.');await reload()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <section className="ti-attendance-v31" aria-label="Minha jornada">
  <div className="ti-attendance-v31-content">
   <span className="ti-attendance-eyebrow">MINHA JORNADA E ESCALA · {day||'HOJE'}</span>
   <h2>{status==='not_started'?(off?'Folga ou ausência na escala oficial':!todayEntry?'Sem escala oficial para hoje':live.label):labels[status]}</h2>
   {live.start&&<p>Horário habitual do turno previsto: {live.start}{live.end?'–'+live.end:''} · {live.source==='system'?'Previsto pelo sistema':'Declaração registrada'}</p>}
   {todayEntry&&<p>Escala publicada: {({work:'Trabalho',off:'Folga',monthly_sunday:'Domingo de folga',leave:'Ausência'})[todayEntry.type]}</p>}
   {nextEntry&&<p>Próximo dia de trabalho publicado: {nextEntry.date.split('-').reverse().join('/')}</p>}
   <details><summary>Minha escala completa</summary>{publishedEntries.length?publishedEntries.map(e=><p key={e.uid+e.date}>{e.date.split('-').reverse().join('/')} · {({work:'Trabalho',off:'Folga',monthly_sunday:'Domingo de folga',leave:'Ausência'})[e.type]}</p>):<p>Nenhuma escala publicada para sua ficha.</p>}</details>
   <p>Os horários reais são registrados ao confirmar cada ação. A escala é uma previsão, não comprovação de presença.</p>
  </div>
  <div className="ti-attendance-actions">
   {next?.length>0&&<button className="ti-attendance-primary" type="button" onClick={()=>submit()} disabled={busy}>{busy?'Registrando…':next[1]}</button>}
   {status==='working'&&<button className="ti-attendance-secondary" type="button" onClick={()=>submit('clock_out')} disabled={busy}>Encerrar jornada</button>}
  </div>
  {notice&&<p role="status" className="ti-attendance-notice">{notice}</p>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
