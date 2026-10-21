import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {auth,db} from './firebase.js';
import PublishedRoster from './PublishedRoster.jsx';
import {rosterToday} from '../server/schedules/restaurant-today.js';
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
 const [schedules,setSchedules]=useState([]),[notices,setNotices]=useState([]),[presence,setPresence]=useState({}),[today,setToday]=useState(todayInSaoPaulo);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState(null),[staff,setStaff]=useState([]),[clock,setClock]=useState('00:00');
 const refresh=useCallback(async()=>{
  try{
   const [roster,board,people]=await Promise.all([read('schedules','list'),read('mural','publicNotices'),read(undefined,'masterRegistryPreview')]);
   setStaff((people.registry||[]).filter(x=>x.status==='active'));
   setSchedules((roster.schedules||[]).filter(x=>x.status==='published').sort((a,b)=>String(b.period).localeCompare(String(a.period))));
   setNotices(board.items||[]);setError('');
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[]);
 const refreshPresence=useCallback(async()=>{
  try{const result=await read('attendanceV31','teamToday');setPresence(Object.fromEntries((result.presence||[]).map(x=>[x.uid,x.status])));}
  catch{/* A escala permanece disponível se a presença não puder ser consultada. */}
 },[]);
 useEffect(()=>{refresh();refreshPresence();const onVisible=()=>{if(document.visibilityState==='visible'){setToday(todayInSaoPaulo());refresh();refreshPresence()}};document.addEventListener('visibilitychange',onVisible);const interval=setInterval(onVisible,60000);return()=>{document.removeEventListener('visibilitychange',onVisible);clearInterval(interval)}},[refresh,refreshPresence]);
 useEffect(()=>{if(!membership?.unitId)return;let first=true;return onSnapshot(doc(db,'units',membership.unitId,'live','attendance'),()=>{if(first){first=false;return}refreshPresence()},()=>{});},[membership?.unitId,refreshPresence]);
 useEffect(()=>{const tick=()=>setClock(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));tick();const timer=setInterval(tick,30000);return()=>clearInterval(timer)},[]);
 const current=useMemo(()=>schedules.find(x=>x.period===today.slice(0,7)),[schedules,today]);
 const selected=expanded===null?current?.id:expanded;
 const active=schedules.find(x=>x.id===selected);
 const roster=useMemo(()=>rosterToday(current,today).filter(x=>x.operationalStatus==='scheduled_unconfirmed').map(entry=>{
  const employee=staff.find(x=>x.id===entry.uid||x.accountUid===entry.uid);
  const hours=String(employee?.shift||entry.shift||'');
  const match=hours.match(/([01]\d|2[0-3]):[0-5]\d/);
  const start=match?.[0]||null;
  const h=start?Number(start.slice(0,2)):null;
  const shift=/manh[aã]/i.test(hours)?'Manhã':/tarde/i.test(hours)?'Tarde':/noite/i.test(hours)?'Noite':h===null?'Turno a definir':h<12?'Manhã':h<18?'Tarde':'Noite';
  const rawArea=String(employee?.area||employee?.sector||employee?.department||entry.area||'').toLowerCase();
  const area=/cozinha|kitchen/.test(rawArea)?'Cozinha':/frente|sal[aã]o|atendimento/.test(rawArea)?'Frente':'Setor a definir';
  const state=presence[employee?.accountUid||entry.uid]||presence[entry.uid];
  const status=({working:'Entrada declarada',on_break:'Em intervalo',finished:'Saída registrada',absent:'Ausência confirmada'})[state]||(start&&clock>=start?'Entrada não confirmada':'Previsto');
  return {uid:entry.uid,name:employee?.name||entry.name||'Funcionário',shift,area,start,status,ongoing:state==='working'||state==='on_break'||(start&&clock>=start&&state!=='finished'&&state!=='absent')};
 }),[current,today,staff,presence,clock]);
 const nowTeam=roster.filter(x=>x.ongoing);
 const nextTeam=roster.filter(x=>!x.ongoing&&x.start&&x.status==='Previsto').sort((a,b)=>a.start.localeCompare(b.start));
 const withoutTime=roster.filter(x=>!x.start&&!x.ongoing);
 return <section className="ti-planning ti-mural-home" aria-label="Mural da equipe">
  <header className="ti-mural-header"><div><span className="eyebrow">INFORMAÇÕES DA UNIDADE</span><h1>Mural da equipe</h1><p>Escalas e comunicados importantes, organizados para consulta.</p></div><button type="button" className="ti-mural-refresh" onClick={()=>{refresh();refreshPresence()}}>Atualizar</button></header>
  {error&&<p role="alert" className="team-error">{error}</p>}
  <div className="ti-mural-home-layout">
   <section className="ti-mural-card ti-mural-roster" aria-labelledby="mural-roster-title">
    <header className="ti-mural-section-header"><div><h2 id="mural-roster-title">Equipe de hoje</h2><p>Quem deveria estar em serviço e quem entra depois.</p></div></header>
    <div className="ti-mural-now"><h3>Agora <small>{nowTeam.length} escalado(s)</small></h3>{nowTeam.length?<ul>{nowTeam.map(p=><li key={p.uid}><strong>{p.name}</strong><span>{p.area} · {p.shift}{p.start?' · '+p.start:''}</span><small>{p.status}</small></li>)}</ul>:<p>Ninguém com início previsto até agora.</p>}</div>
    <div className="ti-mural-next"><h3>Próximos a entrar</h3>{nextTeam.length?<ul>{nextTeam.map(p=><li key={p.uid}><strong>{p.name}</strong><span>{p.area} · {p.shift} · {p.start||'Horário não informado'}</span></li>)}</ul>:<p>Nenhuma próxima entrada identificada.</p>}</div>
    {withoutTime.length>0&&<div className="ti-mural-next"><h3>Horário não definido <small>· consultar escala</small></h3><ul>{withoutTime.map(p=><li key={p.uid}><strong>{p.name}</strong><span>{p.area} · {p.shift}</span></li>)}</ul></div>}
    <details className="ti-mural-roster-details"><summary>Consultar escala completa e folgas</summary>
    {loading?<p role="status">Carregando escalas…</p>:schedules.length===0?<p className="ti-mural-empty">Nenhuma escala publicada.</p>:<>
     <div className="ti-mural-period-list">{schedules.slice(0,12).map(s=><button type="button" key={s.id} className={selected===s.id?'ti-mural-period active':'ti-mural-period'} aria-pressed={selected===s.id} onClick={()=>setExpanded(s.id)}>{monthLabel(s.period)}{s.id===current?.id&&<small>Mês atual</small>}</button>)}</div>
     {active?<PublishedRoster key={active.id} schedule={active} presence={presence}/>:<p>Escolha uma escala para consultar.</p>}
    </>}
    </details>
   </section>
   <aside className="ti-mural-card ti-mural-notices" aria-labelledby="mural-notices-title">
    <header className="ti-mural-section-header"><div><h2 id="mural-notices-title">Comunicados</h2><p>Informações publicadas para a equipe.</p></div><span className="ti-mural-count">{notices.length}</span></header>
    {loading?<p role="status">Carregando comunicados…</p>:notices.length===0?<p className="ti-mural-empty">Nenhum comunicado publicado no momento.</p>:
     <ul className="ti-mural-notice-list">{notices.map(item=><li key={item.id}><strong>{item.title}</strong><p>{item.body}</p></li>)}</ul>}
   </aside>
  </div>
 </section>;
}
