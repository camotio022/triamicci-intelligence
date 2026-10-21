import {doc,onSnapshot} from 'firebase/firestore';
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth,db} from './firebase.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import {rosterToday} from '../server/schedules/restaurant-today.js';
async function request(module,action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module,action,...extra})});
 const d=await r.json();if(!r.ok)throw Error(d.message||'Dados indisponíveis.');return d;
}
export default function TeamTodayV31({unitId}){
 const [correction,setCorrection]=useState({targetUid:'',workDay:restaurantDay(),status:'working',reason:''}),[correctionBusy,setCorrectionBusy]=useState(false),[correctionNotice,setCorrectionNotice]=useState('');
 const [clock,setClock]=useState(()=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));
 const [today,setToday]=useState(()=>restaurantDay()),[staff,setStaff]=useState([]),[schedules,setSchedules]=useState([]),[presence,setPresence]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const refresh=useCallback(async()=>{setClock(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));setBusy(true);try{
  const [a,b,c]=await Promise.all([request('schedules','list'),request('attendanceV31','teamToday'),request(undefined,'masterRegistryPreview')]);
  setToday(b.day);setSchedules((a.schedules||[]).filter(x=>x.status==='published'&&x.period===b.day.slice(0,7)));
  setPresence(Object.fromEntries((b.presence||[]).map(x=>[x.uid,x])));
  setStaff((c.registry||[]).filter(x=>x.status==='active'));
  setError('');
 }catch(e){setError(e.message)}finally{setBusy(false)}},[]);
 useEffect(()=>{if(!unitId)return;let initial=true;return onSnapshot(doc(db,'units',unitId,'live','attendance'),()=>{if(initial){initial=false;return;}refresh()},()=>{});},[unitId,refresh]);
 useEffect(()=>{refresh();const onVisible=()=>{if(document.visibilityState==='visible')refresh()};const timer=setInterval(onVisible,15000);document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)}},[refresh]);
 const submitCorrection=async e=>{e.preventDefault();if(correctionBusy)return;setCorrectionBusy(true);setCorrectionNotice('');setError('');try{
  const result=await request('attendanceV31','correct',{...correction,requestId:crypto.randomUUID()});setCorrectionNotice(result.message);setCorrection(p=>({...p,reason:''}));await refresh()
 }catch(e){setError(e.message)}finally{setCorrectionBusy(false)}};
 const people=useMemo(()=>{
  const schedule=schedules.at(-1);
  const entries=rosterToday(schedule,today);
  const planned=new Set(entries.map(x=>x.uid));
  const all=entries.filter(x=>x.operationalStatus==='scheduled_unconfirmed');
  const weekday=['dom','seg','ter','qua','qui','sex','sab'][new Date(today+'T12:00:00Z').getUTCDay()];
  return all.map(x=>{
   const profile=staff.find(y=>y.id===x.uid||y.accountUid===x.uid);
   const key=profile?.accountUid||x.uid;
   const attendance=presence[key];
   const presenceStatus=attendance?.status;
   const confirmed=presenceStatus==='working'&&attendance?.lastAction==='break_end'?'Retorno do intervalo declarado':({working:'Entrada declarada · não verificada',on_break:'Intervalo declarado',finished:'Saída registrada',absent:'Ausência confirmada pela gestão'})[presenceStatus];
   const sector=String(profile?.sector||x.sector||'').toLowerCase();
   const area=({cozinha:'Cozinha',frente:'Frente',caixa:'Caixa',apoio:'Apoio',gestao:'Gestão'})[sector]||'Setor não informado';
   const shiftCode=String(profile?.shift||x.shift||'').toLowerCase();
   const shift=({manha:'Manhã',noite:'Noite',intermediario:'Intermediário',variavel:'Variável'})[shiftCode]||'Turno não informado';
   const weekday=['dom','seg','ter','qua','qui','sex','sab'][new Date(today+'T12:00:00Z').getUTCDay()];
   const habitual=Array.isArray(profile?.availability)?profile.availability.find(slot=>slot.day===weekday):null;
   const startTime=/^([01]\\d|2[0-3]):[0-5]\\d$/.test(habitual?.start||'')?habitual.start:null;
   const timeLabel=habitual?.start&&habitual?.end?'Jornada habitual: '+habitual.start+'–'+habitual.end:'Turno: '+shift;
   const status=confirmed||(startTime&&clock>=startTime?'Entrada não confirmada':'Escalado · presença não confirmada');
   return {key:x.uid,name:profile?.name||x.name||'Colaborador',status,timeLabel,area,shift};

  });
 },[schedules,today,staff,presence,clock]);
 return <section className="ti-team-today" aria-label="Equipe de hoje">
  <header><div><small>OPERAÇÃO · {today}</small><h2>Equipe de hoje</h2><p>Escala publicada e presença registrada são informações diferentes.</p></div><button type="button" onClick={refresh} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button></header>
  {error&&<p role="alert">{error}</p>}
  {!error&&!busy&&people.length===0&&<p>Não há colaboradores escalados para trabalhar hoje nesta publicação.</p>}
  {['Manhã','Intermediário','Tarde','Noite','Variável','Turno não informado'].map(shift=>{
   const group=people.filter(p=>p.shift===shift);
   return group.length?<section key={shift} className="ti-team-shift-group" aria-label={'Equipe '+shift}>
    <h3>{shift} <small>{group.length} escalado{group.length!==1?'s':''}</small></h3>
    <div className="ti-team-today-grid">{group.map(p=><article key={p.key}><strong>{p.name}</strong><small>{p.area} · {p.timeLabel}</small><span>{p.status}</span></article>)}</div>
   </section>:null;
  })}
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
