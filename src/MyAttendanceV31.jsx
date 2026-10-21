import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
const actions={not_started:['clock_in','Registrar entrada'],working:['break_start','Iniciar intervalo'],on_break:['break_end','Retornar do intervalo'],finished:[]};
async function call(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'attendanceV31',action,...extra})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Não foi possível registrar.');return data;
}
export default function MyAttendanceV31(){
 const [record,setRecord]=useState(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{try{const d=await call('today');setRecord(d.record);setDay(d.day)}catch(e){setError(e.message)}},[]);
 useEffect(()=>{reload();const onVisible=()=>{if(document.visibilityState==='visible')reload()};document.addEventListener('visibilitychange',onVisible);return()=>document.removeEventListener('visibilitychange',onVisible)},[reload]);
 const status=record?.status||'not_started',next=actions[status];
 const labels={not_started:'Entrada ainda não registrada',working:'Entrada confirmada · em serviço',on_break:'Intervalo registrado',finished:'Turno encerrado'};
 const submit=async()=>{if(!next?.length||busy)return;setBusy(true);setError('');setNotice('');try{const d=await call(next[0],{requestId:crypto.randomUUID()});setRecord(p=>({...p,status:d.status}));setNotice(d.message);await reload()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <section className="ti-attendance-v31" aria-label="Minha presença de hoje">
  <div><strong>Minha presença · Hoje</strong><p>{day||'Data do restaurante'} · {labels[status]}</p><small>Este é um registro operacional declarado por você, não um ponto homologado.</small></div>
  {next?.length>0&&<button type="button" onClick={submit} disabled={busy}>{busy?'Registrando…':next[1]}</button>}
  {status==='working'&&<button type="button" onClick={async()=>{setBusy(true);setError('');try{await call('clock_out',{requestId:crypto.randomUUID()});await reload()}catch(e){setError(e.message)}finally{setBusy(false)}}} disabled={busy}>Registrar saída</button>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
