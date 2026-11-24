import useAppConfirmation from './useAppConfirmation.jsx';
import {requestJson} from './api-client.js';
import {MANAGEMENT_ROLES} from '../server/permissions/v31-policy.js';
import {apiFetch} from './api-fetch.js';
import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {sessionAuth as auth} from './firebase.js';import {monthDates} from '../server/schedules/rules.js';import {useFeedback} from './FeedbackProvider.jsx';import './operations-planning.css';import './notifications.css';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import {carryFiveTwoRoster,fiveTwoEntries,fiveTwoWeeks,shiftScheduleDate} from '../server/schedules/five-two.js';
import RosterBoard from './RosterBoard.jsx';

const emptyRoster={weekly:{},sundays:{}};

async function call(action,extra={}){
 return requestJson('/api/members/manage',{module:'schedules',action,...extra},{sessionMessage:'Faça login novamente.',formatError:data=>[data.message,...(data.issues||[]).slice(0,5)].join(' · ')});
}
async function coverageApi(){
 return requestJson('/api/coverage/manage',{action:'planningRules'},{sessionMessage:'Faça login novamente.',formatError:data=>data.message});
}
async function membersApi(){
 const token=await auth.currentUser?.getIdToken();const r=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'profiles'})});const d=await r.json();if(!r.ok)throw Error(d.message);const staff=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'masterRegistryPreview'})});const sd=await staff.json();if(!staff.ok)throw Error(sd.message||'Cadastro Mestre indisponível.');return {activated:!!sd.activated,registeredCount:(sd.registry||[]).filter(p=>p.status==='active').length,people:sd.activated?(sd.registry||[]).filter(p=>p.status==='active').map(p=>({uid:p.id,accountUid:p.accountUid||null,name:p.name,status:p.status,professional:{sector:p.sector,shift:p.shift,availability:p.availability||[],jobTitle:p.jobTitle,skills:p.skills||[],certifications:p.certifications||[]},fixedWeekday:p.fixedWeekday,registry:true})):d.members||[]};
}
const labels={draft:'Rascunho',in_review:'Em análise',approved:'Aprovada',published:'Publicada',work:'Trabalho',off:'Folga',leave:'Ausência',monthly_sunday:'Domingo mensal adicional'};
export default function SchedulePlanner({membership,onOpenCoverage}){
 const {askConfirmation,confirmationSheet}=useAppConfirmation();
 const {notify}=useFeedback(),[plans,setPlans]=useState([]),[people,setPeople]=useState([]),[selected,setSelected]=useState(''),[title,setTitle]=useState('Escala da equipe'),[period,setPeriod]=useState(restaurantDay().slice(0,7)),[entries,setEntries]=useState([]);
 const [coveragePolicy,setCoveragePolicy]=useState({});
 const [coverageRules,setCoverageRules]=useState([]),[draftRevision,setDraftRevision]=useState(null);
 const [roster,setRoster]=useState(emptyRoster),[undoHistory,setUndoHistory]=useState([]),[rosterDirty,setRosterDirty]=useState(false);
 const [titleDirty,setTitleDirty]=useState(false);
 const hasUnsaved=rosterDirty||titleDirty;
 const [scheduleView,setScheduleView]=useState('active');
 const [approvedLeaves,setApprovedLeaves]=useState([]);
 const [registryState,setRegistryState]=useState({activated:false,registeredCount:0});
 const [loaded,setLoaded]=useState(false);
 const [today,setToday]=useState(()=>restaurantDay());
 useEffect(()=>{const interval=setInterval(()=>setToday(restaurantDay()),60000);return()=>clearInterval(interval)},[]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const allowed=MANAGEMENT_ROLES.includes(membership.role);
 const refresh=useCallback(async(silent=false)=>{if(!silent)setLoading(true);setError('');try{const [p,m,l,c]=await Promise.all([call('list'),membersApi(),call('leaveList'),coverageApi()]);setCoverageRules(c.requirements||[]);setCoveragePolicy(c.operationalPolicy||{});setApprovedLeaves((l.requests||[]).filter(x=>x.status==='approved'));setPlans(p.schedules||[]);setRegistryState({activated:m.activated,registeredCount:m.registeredCount});setPeople(m.people.filter(x=>x.status==='active'));setLoaded(true)}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useUnitLive(membership?.unitId,initial=>refresh(!initial),{domains:['schedules','team','coverage'],refreshKey:membership.role});

 const inherited=useMemo(()=>carryFiveTwoRoster(period,plans,people),[period,plans,people]);
 const boardRoster=!selected&&!rosterDirty?inherited:roster;
 const lockedWeeks=useMemo(()=>[...new Set(plans.filter(p=>p.period!==period&&p.status==='published'&&!p.archivedAt&&p.roster)
  .flatMap(p=>Object.keys(p.roster.weekly).filter(week=>fiveTwoWeeks(period).includes(week))))],[plans,period]);
 const chosen=plans.find(x=>x.id===selected);
 const validMonth=monthDates(period).length>0;
 const boardEntries=useMemo(()=>{
  if(!validMonth)return [];
  if(chosen?.roster&&chosen.status!=='draft')return entries;
  const weeks=fiveTwoWeeks(period);
  const extendedDates=weeks.flatMap(week=>Array.from({length:7},(_,index)=>shiftScheduleDate(week,index)));
  return fiveTwoEntries({period,members:people,roster:boardRoster,approvedLeaves,dates:extendedDates});
 },[validMonth,period,people,boardRoster,approvedLeaves,chosen,entries]);
 const setBoard=(next=emptyRoster)=>{setRoster(next);setUndoHistory([]);setRosterDirty(false);setTitleDirty(false);};
 const open=async p=>{
  if(hasUnsaved&&!await askConfirmation('Abrir outra escala e descartar as alterações deste rascunho?'))return;
  setSelected(p.id);setDraftRevision(p.revision);setTitle(p.title);setPeriod(p.period);setEntries(p.entries||[]);
  setBoard(p.roster);setError('');
 };
 const reset=(nextPeriod=period)=>{
  setSelected('');setDraftRevision(null);setTitle('Escala da equipe');setEntries([]);setError('');
  setPeriod(nextPeriod);setBoard(carryFiveTwoRoster(nextPeriod,plans,people));
 };
 const startNew=async(nextPeriod=period)=>{
  if(hasUnsaved&&!await askConfirmation('Descartar as alterações deste rascunho?'))return;
  reset(nextPeriod);
  setScheduleView('active');
 };
 const updateRoster=next=>{setUndoHistory(old=>[...old.slice(-29),{roster:boardRoster,dirty:rosterDirty}]);setRoster(next);setRosterDirty(true);};
 const undoRoster=()=>{
  const previous=undoHistory.at(-1);
  if(!previous)return;
  setRoster(previous.roster);setRosterDirty(previous.dirty);setUndoHistory(old=>old.slice(0,-1));
 };
 const save=async()=>{
  setBusy(true);
  try{
   const payloadEntries=boardEntries.filter(entry=>entry.date.startsWith(period));
   const result=await call('saveDraft',{id:selected||undefined,expectedRevision:draftRevision,period,title,entries:payloadEntries,roster:boardRoster});
   notify(result.message,'success');
   setRoster(boardRoster);
   setSelected(result.id);setDraftRevision(result.revision);setEntries(payloadEntries);
   setRosterDirty(false);setTitleDirty(false);setUndoHistory(old=>old.map(snapshot=>({...snapshot,dirty:true})));
   await refresh(true);
  }catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const transition=async action=>{setBusy(true);try{const d=await call(action,{id:selected});notify(d.message,'success');await refresh()}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 const archivedPlans=plans.filter(p=>p.roster&&p.archivedAt),activePlans=plans.filter(p=>p.roster&&!p.archivedAt);
 const historical=plans.filter(p=>!p.roster&&!p.archivedAt&&p.status==='published');
 const changeArchive=async(p,action)=>{
  if(busy)return;
  if(action==='scheduleArchive'&&!await askConfirmation('Mover esta escala para a lixeira? O histórico será preservado e a escala poderá ser restaurada.'))return;
  setBusy(true);
  try{const result=await call(action,{id:p.id});notify(result.message,'success');if(selected===p.id)reset();await refresh(true)}
  catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 if(!allowed)return <section className="ti-planning"><h1>Escalas</h1><p>Consulte suas escalas publicadas no Mural.</p></section>;
 const workflow=chosen?.archivedAt?null:<div className="ti-planning-actions">
  {chosen?.status==='draft'&&<button disabled={busy||hasUnsaved} type="button" onClick={()=>transition('submit')}>Enviar para análise</button>}
  {chosen?.status==='in_review'&&<button disabled={busy} type="button" onClick={()=>transition('approve')}>Aprovar escala</button>}
  {chosen?.status==='approved'&&<button disabled={busy} type="button" onClick={()=>transition('publish')}>Publicar no Mural</button>}
  {chosen?.status==='published'&&<p role="status">Esta versão está publicada.</p>}
 </div>;
 const canPlan=(!chosen||chosen.status==='draft')&&!chosen?.archivedAt;
 return <section className="ti-roster-planner">
 {validMonth&&<RosterBoard key={period} period={period}
  roster={boardRoster} lockedWeeks={lockedWeeks} approvedLeaves={approvedLeaves} coveragePolicy={coveragePolicy} updateRoster={updateRoster} members={people} entries={boardEntries} requirements={coverageRules}
  editable={canPlan&&!busy&&!loading} saving={busy||loading} onSave={save} canSave={people.length>0&&(!registryState.registeredCount||registryState.activated)}
  saved={Boolean(draftRevision)&&!hasUnsaved} status={chosen?.status&&chosen.status!=='draft'?labels[chosen.status]||chosen.status:null}
  changePeriod={startNew} onUndo={undoRoster} canUndo={undoHistory.length>0}
  loadPending={!loaded&&loading} loadError={!loaded?error:''} retryLoad={()=>refresh()} onOpenCoverage={chosen&&!hasUnsaved&&!chosen.archivedAt&&onOpenCoverage?(date=>onOpenCoverage({date,planId:chosen.id})):null}/>}
 {!registryState.activated&&registryState.registeredCount>0&&<aside className="ti-roster-attention" role="status"><strong>{registryState.registeredCount} fichas profissionais aguardam ativação.</strong><span>O planejador ainda está usando contas de acesso, que podem incluir contas de teste. Ative o Cadastro Mestre após conferir a equipe para planejar com os funcionários reais.</span><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("ti-navigate",{detail:"master-registry"}))}>Abrir Cadastro Mestre</button></aside>}
 {chosen&&<section className="ti-planning-card ti-roster-record">
  <label>Título da escala<input maxLength={100} minLength={3} value={title} disabled={!canPlan||busy} onChange={e=>{setTitle(e.target.value);setTitleDirty(true);}}/></label>
  {workflow}
 </section>}
 <div className="ti-roster-saved">
 <details className="ti-planning-card ti-roster-record"><summary>Escalas da unidade</summary>
 <div className="ti-planning-heading"><button type="button" onClick={()=>refresh()} disabled={busy||loading}>Atualizar</button><button type="button" disabled={busy} onClick={()=>startNew()}>Nova escala</button></div>
 <div className="ti-notification-tabs" role="group" aria-label="Lista de escalas"><button type="button" className={scheduleView==='active'?'selected':''} aria-pressed={scheduleView==='active'} onClick={()=>setScheduleView('active')}>Ativas ({activePlans.length})</button><button type="button" className={scheduleView==='trash'?'selected':''} aria-pressed={scheduleView==='trash'} onClick={()=>setScheduleView('trash')}>Lixeira ({archivedPlans.length})</button></div>
 {loading?<p>Carregando...</p>:(scheduleView==='active'?activePlans:archivedPlans).length?(scheduleView==='active'?activePlans:archivedPlans).map(x=><div key={x.id} className="ti-schedule-list-item">
  <button type="button" className={'ti-planning-row'+(selected===x.id?' selected':'')} onClick={()=>open(x)}><strong>{x.title}</strong><span>{x.period} · {labels[x.status]||x.status} · v{x.revision}</span></button>
  {scheduleView==='trash'?<button type="button" disabled={busy} className="ti-schedule-recycle-action" onClick={()=>changeArchive(x,'scheduleRestore')}>Restaurar</button>:<button type="button" disabled={busy||(x.status==='published'&&x.period>=today.slice(0,7))} className="ti-schedule-recycle-action" title={x.status==='published'&&x.period>=today.slice(0,7)?'Escala oficial protegida':'Mover para a lixeira'} onClick={()=>changeArchive(x,'scheduleArchive')}>Excluir</button>}
 </div>):<p>{scheduleView==='trash'?'Nenhuma escala na lixeira.':'Nenhuma escala cadastrada.'}</p>}
 </details>
 {historical.length>0&&<details className="ti-planning-card ti-roster-record"><summary>Histórico publicado ({historical.length})</summary>
  {historical.map(item=><p key={item.id}><strong>{item.title}</strong> · {item.period} · Publicada</p>)}
 </details>}
 </div>{error&&loaded&&<p role="alert" className="team-error">{error}</p>}
  {confirmationSheet}
 </section>;
}
