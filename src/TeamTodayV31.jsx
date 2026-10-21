import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import {rosterToday} from '../server/schedules/restaurant-today.js';
async function request(module,action){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module,action})});
 const d=await r.json();if(!r.ok)throw Error(d.message||'Dados indisponíveis.');return d;
}
export default function TeamTodayV31(){
 const [today,setToday]=useState(()=>restaurantDay()),[staff,setStaff]=useState([]),[schedules,setSchedules]=useState([]),[presence,setPresence]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const refresh=useCallback(async()=>{setBusy(true);try{
  const [a,b,c]=await Promise.all([request('schedules','list'),request('attendanceV31','teamToday'),request(undefined,'masterRegistryPreview')]);
  setToday(b.day);setSchedules((a.schedules||[]).filter(x=>x.status==='published'&&x.period===b.day.slice(0,7)));
  setPresence(Object.fromEntries((b.presence||[]).map(x=>[x.uid,x.status])));
  setStaff((c.registry||[]).filter(x=>x.status==='active'));
  setError('');
 }catch(e){setError(e.message)}finally{setBusy(false)}},[]);
 useEffect(()=>{refresh();const timer=setInterval(refresh,60000);return()=>clearInterval(timer)},[refresh]);
 const people=useMemo(()=>{const schedule=schedules.at(-1);return rosterToday(schedule,today).map(x=>{
  const profile=staff.find(y=>y.id===x.uid||y.accountUid===x.uid);
  const key=profile?.accountUid||x.uid;
  const status= x.operationalStatus==='day_off'?'Folga':x.operationalStatus==='absence_recorded'?'Ausência registrada':({working:'Em serviço',on_break:'Em intervalo',finished:'Turno encerrado',absent:'Ausente confirmado'})[presence[key]]||'Escalado · sem confirmação';
  return {key:x.uid,name:profile?.name||x.name||'Colaborador',status};
 })},[schedules,today,staff,presence]);
 return <section className="ti-team-today" aria-label="Equipe de hoje">
  <header><div><small>OPERAÇÃO · {today}</small><h2>Equipe de hoje</h2><p>Escala publicada e presença registrada são informações diferentes.</p></div><button type="button" onClick={refresh} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button></header>
  {error&&<p role="alert">{error}</p>}
  {!error&&!busy&&people.length===0&&<p>Nenhuma escala publicada ou lançamento encontrado para hoje. Não é possível confirmar a equipe presente.</p>}
  <div className="ti-team-today-grid">{people.map(p=><article key={p.key}><strong>{p.name}</strong><span>{p.status}</span></article>)}</div>
 </section>;
}
