import {doc,onSnapshot} from 'firebase/firestore';
import React,{useCallback,useEffect,useState} from 'react';
import {auth,db} from './firebase.js';
const actions={not_started:['clock_in','Registrar entrada'],working:['break_start','Iniciar intervalo'],on_break:['break_end','Retornar do intervalo'],finished:[]};
async function call(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'attendanceV31',action,...extra})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Não foi possível registrar.');return data;
}
export default function MyAttendanceV31({unitId}){
 const [record,setRecord]=useState(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{try{const d=await call('today');setRecord(d.record);setDay(d.day)}catch(e){setError(e.message)}},[]);
 useEffect(()=>{if(!unitId)return;let initial=true;return onSnapshot(doc(db,'units',unitId,'live','attendance'),()=>{if(initial){initial=false;return;}reload()},()=>{});},[unitId,reload]);
 useEffect(()=>{reload();const onVisible=()=>{if(document.visibilityState==='visible')reload()};document.addEventListener('visibilitychange',onVisible);const timer=setInterval(onVisible,15000);return()=>{document.removeEventListener('visibilitychange',onVisible);clearInterval(timer)}},[reload]);
 const status=record?.status||'not_started',next=actions[status];
 const labels={not_started:'Entrada ainda não registrada',working:'Entrada declarada · aguardando confirmação presencial',on_break:'Intervalo declarado',finished:'Saída declarada · aguardando confirmação'};
 const submit=async(action=next?.[0])=>{if(!action||busy)return;setBusy(true);setError('');setNotice('');try{const d=await call(action,{requestId:crypto.randomUUID()});setRecord(p=>({...p,status:d.status}));setNotice('Declaração registrada. A confirmação da presença física depende de validação no estabelecimento.');await reload()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <section className="ti-attendance-v31" aria-label="Minha jornada">
  <div className="ti-attendance-v31-content">
   <span className="ti-attendance-eyebrow">MINHA JORNADA · {day||'HOJE'}</span>
   <h2>{labels[status]}</h2>
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
