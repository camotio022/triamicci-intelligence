import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {auth,db} from './firebase.js';
import PublishedRoster from './PublishedRoster.jsx';
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
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState(null);
 const refresh=useCallback(async()=>{
  try{
   const [roster,board]=await Promise.all([read('schedules','list'),read('mural','publicNotices')]);
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
 const current=useMemo(()=>schedules.find(x=>x.period===today.slice(0,7)),[schedules,today]);
 const selected=expanded===null?current?.id:expanded;
 const active=schedules.find(x=>x.id===selected);
 return <section className="ti-planning ti-mural-home" aria-label="Mural da equipe">
  <header className="ti-mural-header"><div><span className="eyebrow">INFORMAÇÕES DA UNIDADE</span><h1>Mural da equipe</h1><p>Escalas e comunicados importantes, organizados para consulta.</p></div><button type="button" className="ti-mural-refresh" onClick={()=>{refresh();refreshPresence()}}>Atualizar</button></header>
  {error&&<p role="alert" className="team-error">{error}</p>}
  <div className="ti-mural-home-layout">
   <section className="ti-mural-card ti-mural-roster" aria-labelledby="mural-roster-title">
    <header className="ti-mural-section-header"><div><h2 id="mural-roster-title">Escala da equipe</h2><p>Consulte quem trabalha hoje e as folgas publicadas.</p></div></header>
    {loading?<p role="status">Carregando escalas…</p>:schedules.length===0?<p className="ti-mural-empty">Nenhuma escala publicada.</p>:<>
     <div className="ti-mural-period-list">{schedules.slice(0,12).map(s=><button type="button" key={s.id} className={selected===s.id?'ti-mural-period active':'ti-mural-period'} aria-pressed={selected===s.id} onClick={()=>setExpanded(s.id)}>{monthLabel(s.period)}{s.id===current?.id&&<small>Mês atual</small>}</button>)}</div>
     {active?<PublishedRoster key={active.id} schedule={active} presence={presence}/>:<p>Escolha uma escala para consultar.</p>}
    </>}
   </section>
   <aside className="ti-mural-card ti-mural-notices" aria-labelledby="mural-notices-title">
    <header className="ti-mural-section-header"><div><h2 id="mural-notices-title">Comunicados</h2><p>Informações publicadas para a equipe.</p></div><span className="ti-mural-count">{notices.length}</span></header>
    {loading?<p role="status">Carregando comunicados…</p>:notices.length===0?<p className="ti-mural-empty">Nenhum comunicado publicado no momento.</p>:
     <ul className="ti-mural-notice-list">{notices.map(item=><li key={item.id}><strong>{item.title}</strong><p>{item.body}</p></li>)}</ul>}
   </aside>
  </div>
 </section>;
}
