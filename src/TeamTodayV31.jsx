import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import {rosterToday} from '../server/schedules/restaurant-today.js';
async function request(module,action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module,action,...extra})});
 const d=await r.json();if(!r.ok)throw Error(d.message||'Dados indisponíveis.');return d;
}
export default function TeamTodayV31(){
 const [correction,setCorrection]=useState({targetUid:'',workDay:restaurantDay(),status:'working',reason:''}),[correctionBusy,setCorrectionBusy]=useState(false),[correctionNotice,setCorrectionNotice]=useState('');
 const [today,setToday]=useState(()=>restaurantDay()),[staff,setStaff]=useState([]),[schedules,setSchedules]=useState([]),[presence,setPresence]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const refresh=useCallback(async()=>{setBusy(true);try{
  const [a,b,c]=await Promise.all([request('schedules','list'),request('attendanceV31','teamToday'),request(undefined,'masterRegistryPreview')]);
  setToday(b.day);setSchedules((a.schedules||[]).filter(x=>x.status==='published'&&x.period===b.day.slice(0,7)));
  setPresence(Object.fromEntries((b.presence||[]).map(x=>[x.uid,x])));
  setStaff((c.registry||[]).filter(x=>x.status==='active'));
  setError('');
 }catch(e){setError(e.message)}finally{setBusy(false)}},[]);
 useEffect(()=>{refresh();const timer=setInterval(refresh,60000);return()=>clearInterval(timer)},[refresh]);
 const submitCorrection=async e=>{e.preventDefault();if(correctionBusy)return;setCorrectionBusy(true);setCorrectionNotice('');setError('');try{
  const result=await request('attendanceV31','correct',{...correction,requestId:crypto.randomUUID()});setCorrectionNotice(result.message);setCorrection(p=>({...p,reason:''}));await refresh()
 }catch(e){setError(e.message)}finally{setCorrectionBusy(false)}};
 const people=useMemo(()=>{
  const schedule=schedules.at(-1);
  const entries=rosterToday(schedule,today);
  const planned=new Set(entries.map(x=>x.uid));
  const all=[...entries,...staff.filter(x=>!planned.has(x.id)).map(x=>({uid:x.id,name:x.name,operationalStatus:'not_scheduled'}))];
  return all.map(x=>{
   const profile=staff.find(y=>y.id===x.uid||y.accountUid===x.uid);
   const key=profile?.accountUid||x.uid;
   const attendance=presence[key];
   const presenceStatus=attendance?.status;
   const confirmed=presenceStatus==='working'&&attendance?.lastAction==='break_end'?'Retornou do intervalo':({working:'Em serviço',on_break:'Em intervalo',finished:'Turno encerrado',absent:'Ausência confirmada'})[presenceStatus];
   const status=confirmed|| (x.operationalStatus==='day_off'?'Folga prevista':x.operationalStatus==='absence_recorded'?'Ausência na escala':x.operationalStatus==='not_scheduled'?'Sem lançamento na escala':'Escalado · presença não confirmada');
   return {key:x.uid,name:profile?.name||x.name||'Colaborador',status};
  });
 },[schedules,today,staff,presence]);
 return <section className="ti-team-today" aria-label="Equipe de hoje">
  <header><div><small>OPERAÇÃO · {today}</small><h2>Equipe de hoje</h2><p>Escala publicada e presença registrada são informações diferentes.</p></div><button type="button" onClick={refresh} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button></header>
  {error&&<p role="alert">{error}</p>}
  {!error&&!busy&&people.length===0&&<p>Não há colaboradores ativos no Cadastro Mestre. Confira os vínculos antes de consultar a equipe.</p>}
  <div className="ti-team-today-grid">{people.map(p=><article key={p.key}><strong>{p.name}</strong><span>{p.status}</span></article>)}</div>
  <details className="ti-team-correction"><summary>Corrigir presença de um funcionário</summary><p>Ajustes são auditados. Use somente após conferir a ocorrência real; motivos pessoais permanecem restritos à gestão.</p>
   <form onSubmit={submitCorrection}><label>Funcionário<select required value={correction.targetUid} onChange={e=>setCorrection(p=>({...p,targetUid:e.target.value}))}><option value="">Selecione uma conta vinculada</option>{staff.filter(p=>p.accountUid).map(p=><option key={p.id} value={p.accountUid}>{p.name}</option>)}</select></label>
   <label>Data da jornada<input required type="date" max={today} value={correction.workDay} onChange={e=>setCorrection(p=>({...p,workDay:e.target.value}))}/></label>
   <label>Situação corrigida<select value={correction.status} onChange={e=>setCorrection(p=>({...p,status:e.target.value}))}><option value="working">Em serviço</option><option value="on_break">Em intervalo</option><option value="finished">Turno encerrado</option><option value="absent">Ausência confirmada</option></select></label>
   <label>Justificativa gerencial<textarea required minLength={8} maxLength={240} value={correction.reason} onChange={e=>setCorrection(p=>({...p,reason:e.target.value}))}/></label>
   <button disabled={correctionBusy||!correction.targetUid} type="submit">{correctionBusy?"Registrando…":"Salvar correção auditada"}</button></form>
   {correctionNotice&&<p role="status">{correctionNotice}</p>}
  </details>
 </section>;
}
