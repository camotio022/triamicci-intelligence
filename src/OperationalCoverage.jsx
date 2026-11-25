import React,{useCallback,useEffect,useRef,useState} from 'react';
import {reviewCoverageAssignment,wholeTurnAssignment} from '../server/coverage/operational.js';
import './roster-board.css';
import CoverageMonth from './CoverageMonth.jsx';
import {coverageCardId,coverageColumns,moveCoverageCard,projectCoverage} from './coverage-board-state.js';
import {monthDates} from '../server/schedules/rules.js';
import {restaurantDay} from '../shared/operation-day.js';

export const feeMoney=value=>value==null?'Valor a definir':value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const shortDate=date=>date?.split('-').reverse().join('/')||'Data a definir';
const shifts={manha:'Manhã',noite:'Noite'};
const sectors={cozinha:'Cozinha',frente:'Frente'};

const hours=window=>window?window.start+'–'+window.end:'Horário a confirmar';
const candidateName=person=>person.name+' · '+(person.jobTitle||'Função a confirmar');


const initialOrder=['cozinha:manha','frente:manha','cozinha:noite','frente:noite'];
function options(row,person){
 const assignment=wholeTurnAssignment(row,person);
 const blocked=assignment?.first&&reviewCoverageAssignment(assignment).state==='blocked';
 const helps=row.roleGap&&person.matchesRole||row.headcountGap&&person.countsForMinimum||row.skillGap&&person.skillConfirmed;
 const reason=!helps?'Não cobre a função ou vaga que falta':!assignment?'Sem horário compatível com o turno':blocked?'A jornada somada ultrapassa o limite de revisão':!person.hasAccount?'Conta ainda não vinculada à ficha':'';
 return {assignment,available:!reason,reason};
}
const problems=(row,impact)=>[
 impact.headcountGap?impact.headcountGap+' '+(impact.headcountGap===1?'vaga':'vagas'):'',
 impact.roleGap?(row.sector==='cozinha'?'Falta cozinheiro':'Falta gestão'):'',
 impact.skillGap?'Montagem em atenção':'',
].filter(Boolean).join(' · ') || (impact.open?'Cobertura a confirmar':'Equipe suficiente');

function CoverageDrawer({card,data,date,plan,request,run,busy,selected,setSelected,close,renderProposal,onRecordAbsence}){
 const {row,matches,impact,intervals,recurring}=card;
 const panel=useRef(null);
 const [failure,setFailure]=useState(false);
 const [note,setNote]=useState(problems(row,impact).length>=10?problems(row,impact):'Reforço para o turno');
 const [coveredStart,setCoveredStart]=useState(false);
 const [absent,setAbsent]=useState(''),[absenceReason,setAbsenceReason]=useState('');
 const person=row.candidates.find(candidate=>candidate.uid===selected);
 const assignment=person&&options(row,person).available?options(row,person).assignment:null;
 const preview=person&&assignment&&projectCoverage(row,matches,intervals,recurring,person);
 const fixed=recurring.find(item=>item.uid===selected);
 const estimate=fixed?.paid===false?0:fixed?.paid===null?null:data.individualRates?.[selected]?.amount??data.configuredRates?.[person?.rateRole];
 const partial=assignment&&assignment.second.start!==row.window.start;
 useEffect(()=>{const dialog=panel.current;dialog.showModal();return ()=>{if(dialog.open)dialog.close();};},[]);
 return <dialog ref={panel} className="ti-cov-drawer" aria-labelledby="coverage-drawer-title" onCancel={event=>{event.preventDefault();close();}}>
  <header className="ti-cov-row"><div><h2 id="coverage-drawer-title">{sectors[row.sector]} · {shifts[row.shift]}</h2><p>{problems(row,impact)}</p></div><button type="button" className="ti-cov-quiet" onClick={close}>Fechar</button></header>
  <section className="ti-cov-drawer-block">
   <h3>Quem está no turno</h3><p>Turno da loja · {hours(row.window)}</p>
   <ul className="ti-cov-team">{row.people.map(item=><li key={item.uid}><strong>{candidateName(item)}</strong><small>{hours(item.hours)}</small></li>)}</ul>
   {!row.people.length&&<p>Ninguém confirmado na escala.</p>}
   {row.uncertain&&<p className="ti-cov-coverage-why">{!row.window?'Confira a jornada cadastrada para este turno.':row.minimum==null?'Defina o mínimo da frente nas configurações.':'Confira os horários da equipe e se a gestão conta no mínimo da frente.'}</p>}
   {onRecordAbsence&&date>=restaurantDay()&&plan.status==='published'&&row.people.length>0&&<details>
    <summary>Registrar indisponibilidade</summary>
    <form className="ti-cov-policy" onSubmit={async event=>{event.preventDefault();const result=await onRecordAbsence({planId:plan.id,date,staffId:absent,reason:absenceReason.trim()});setFailure(!result);}}>
     <label>Pessoa escalada<select required value={absent} onChange={event=>setAbsent(event.target.value)}>
      <option value="">Selecione</option>{row.people.map(item=><option key={item.uid} value={item.uid}>{item.name}</option>)}
     </select></label>
     <label>Motivo<textarea required maxLength={400} minLength={8} value={absenceReason} onChange={event=>setAbsenceReason(event.target.value)}/></label>
     <button type="submit" disabled={busy||!absent||absenceReason.trim().length<8}>Registrar e reavaliar</button>
    </form>
   </details>}
   {recurring.filter(item=>item.available&&item.paid===false).map(item=><p key={item.uid+item.forUid}>{item.name} · cobertura fixa sem taxa</p>)}
   {intervals.map((item,i)=><p key={i}>{item.skill||item.sector} · {item.start}–{item.end} · {item.covered}/{item.minimum}</p>)}
  </section>
  {matches.filter(item=>!['declined','rejected','cancelled'].includes(item.status)).map(item=>renderProposal?.(item))}
  {impact.open&&date>=restaurantDay()&&<section className="ti-cov-drawer-block">
   <h3>Preparar reforço</h3>
   <ul className="ti-cov-team">{row.candidates.filter(item=>options(row,item).available&&!matches.some(p=>p.staffId===item.uid&&['pending_acceptance','pending_approval','approved','completed','paid'].includes(p.status))).map(item=>
    <li key={item.uid}><button type="button" aria-pressed={selected===item.uid} onClick={()=>{setSelected(item.uid);setCoveredStart(false);}}>{candidateName(item)}</button></li>)}</ul>
   {!row.candidates.some(item=>options(row,item).available)&&<p>Sem opção de convite agora. Confira as jornadas ou procure reforço com a gestão.</p>}
   {row.candidates.some(item=>!options(row,item).available)&&<details className="ti-cov-reasons">
    <summary>Por que alguns nomes não aparecem para convite?</summary>
    <ul className="ti-cov-team">{row.candidates.filter(item=>!options(row,item).available).map(item=><li key={item.uid}><strong>{item.name}</strong><small>{options(row,item).reason}</small></li>)}</ul>
   </details>}
   {assignment&&preview&&<div className="ti-cov-invite">
    <strong>Prévia · {person.name}</strong>
    <p>{row.minimum!==null?impact.count+' → '+preview.count+' de '+row.minimum:preview.count+' pessoas previstas'}. {impact.roleGap&&!preview.roleGap?'A pessoa cobre a função que faltava. ':''}{preview.headcountGap?preview.headcountGap+' vagas seguem abertas.':''}</p>
    {assignment.first&&<p>Jornada habitual · {hours(assignment.first)}</p>}
    <p>Reforço · {hours(assignment.second)} · {estimate===0?'Sem taxa':feeMoney(estimate)}</p>
    {partial&&<label className="ti-cov-check"><input type="checkbox" checked={coveredStart} onChange={event=>setCoveredStart(event.target.checked)}/>Confirmei quem cobre {row.window.start}–{assignment.second.start}</label>}
    <label>Motivo do convite<textarea maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label>
    <button type="button" disabled={busy||note.trim().length<10||partial&&!coveredStart} onClick={async()=>{
     const response=await run(()=>request('inviteShift',{planId:plan.id,date,sector:row.sector,shift:row.shift,staffId:person.uid,reason:note,coveredStart}));
     setFailure(!response);
     if(response){setSelected('');setCoveredStart(false);}
    }}>Enviar convite</button>

   </div>}
  </section>}
  {failure&&<p role="alert">A ação não foi concluída. Feche o painel para ver o motivo.</p>}
 </dialog>;
}

export default function OperationalCoverage({data,request,run,busy,focus,preferenceKey,renderProposal,recordAbsence,dashboardUnavailable}){
 const [planId,setPlanId]=useState(focus?.planId||'');
 const [chosenDate,setDate]=useState(focus?.date||'');
 const [preferences,setPreferences]=useState(()=>{
  try{const saved=JSON.parse(localStorage.getItem(preferenceKey));return {...(saved&&typeof saved==='object'?saved:{}),...focus?.shift&&{shift:focus.shift},...focus?.sector&&{sector:focus.sector}};}catch{return {};}
 });
 const {shift=focus?.shift||'noite',sector=focus?.sector||'todos'}=preferences;
 const order=Array.isArray(preferences.order)?[...new Set([...preferences.order.filter(key=>initialOrder.includes(key)),...initialOrder])]:initialOrder;
 const prefer=change=>setPreferences(previous=>({...previous,...change}));
 useEffect(()=>{try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{/* view stays usable */}},[preferenceKey,preferences]);
 const [column,setColumn]=useState('needs'),[personId,setPerson]=useState(''),[opened,setOpened]=useState(null),[selected,setSelected]=useState('');
 const pointer=useRef(null), ignoreClick=useRef(false), generation=useRef(0);
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const today=restaurantDay();
 const activePlans=(data?.plans||[]).filter(item=>item.period>=today.slice(0,7));
 const plan=activePlans.find(item=>item.id===planId)||activePlans.find(item=>item.period===today.slice(0,7)&&item.status==='published')||activePlans[0];
 const period=plan?.period;
 const date=chosenDate.startsWith(period+'-')?chosenDate:'';
 const current=result?.planId===plan?.id&&result?.date===date?result:null;
 const cards=(current?.evaluation.shifts||[]).map(row=>{
  const matches=data.proposals.filter(p=>p.operational&&p.planId===plan.id&&p.date===date&&p.sector===row.sector&&p.shift===row.shift);
  const recurring=current.evaluation.recurring.filter(item=>item.sector===row.sector&&item.shift===row.shift);
  const intervals=current.evaluation.intervals.filter(item=>item.deficit&&(item.sector===row.sector||row.sector==='frente'&&['caixa','apoio','gestao'].includes(item.sector))&&
   (!row.window||item.start<row.window.end&&item.end>row.window.start));
  const impact=projectCoverage(row,matches,intervals,recurring);
   return {row,matches,recurring,intervals:impact.remainingIntervals,impact,id:coverageCardId(row)};
 });
 const visible=cards.filter(card=>(shift==='todos'||card.row.shift===shift)&&(sector==='todos'||card.row.sector===sector)).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
 const availablePeople=new Map();
 for(const card of visible.filter(card=>card.impact.open&&date>=today)){
  for(const person of card.row.candidates){
   if(options(card.row,person).available&&!card.matches.some(p=>p.staffId===person.uid&&['pending_acceptance','pending_approval','approved','completed','paid'].includes(p.status)))availablePeople.set(person.uid,person);
  }
 }
 const openedCard=cards.find(card=>card.id===opened);
 const open=(card,uid='')=>{
  const person=card.row.candidates.find(item=>item.uid===uid);
  if(uid&&(!card.impact.open||!options(card.row,person||{}).available||!availablePeople.has(uid)||
   card.matches.some(p=>p.staffId===uid&&['pending_acceptance','pending_approval','approved','completed','paid'].includes(p.status)))){
   setError('Essa pessoa não cobre este cartão. Confira os horários e a função.');return;
  }
  setError('');setSelected(uid);setOpened(card.id);setPerson('');
 };
 const evaluate=useCallback(async(id,day)=>{
  const attempt=++generation.current;
  setLoading(true);setError('');setPerson('');setOpened(null);
  try{
   const result=await request('assessShift',{planId:id,date:day,sector:'cozinha',shift:'noite'});
   if(attempt===generation.current)setResult({...result,planId:id,date:day});
  }catch(e){if(attempt===generation.current){setResult(null);setError(e.message);}}
  finally{if(attempt===generation.current)setLoading(false);}
 },[request]);
 const activeId=plan?.id;
 const choose=(day,turn,area)=>{
  setDate(day);setPerson('');
  if(turn||area)prefer({...turn&&{shift:turn},...area&&{sector:area}});
 };
 const alertFocus=useRef(focus?.sector&&focus?.shift?focus.sector+':'+focus.shift:null);
 useEffect(()=>{
  if(current&&alertFocus.current){setOpened(alertFocus.current);alertFocus.current=null;}
 },[current]);
 useEffect(()=>{
  if(activeId&&date)void evaluate(activeId,date);
  return ()=>{generation.current++;};
 },[activeId,date,evaluate]);

 function pointerDown(event){
  const grip=event.target.closest('[data-cov-drag]');
  if(!grip||grip.disabled||event.button!==0||event.pointerType==='touch')return;
  pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,key:grip.dataset.covDrag,kind:grip.dataset.covKind};
  grip.setPointerCapture(event.pointerId);
 }
 function pointerMove(event){
  const drag=pointer.current;
  if(!drag||drag.id!==event.pointerId)return;
  if(!drag.moved&&Math.hypot(drag.x-event.clientX,drag.y-event.clientY)<8)return;
  drag.moved=true;
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-cov-drop]');
  if(drag.target!==target){
   drag.target?.classList.remove('drop-active');
   target?.classList.add('drop-active');drag.target=target;
  }
 }
 function pointerEnd(event){
  const drag=pointer.current;
  if(!drag||drag.id!==event.pointerId)return;
  pointer.current=null;drag.target?.classList.remove('drop-active');
  if(!drag.moved)return;
  ignoreClick.current=true;requestAnimationFrame(()=>{ignoreClick.current=false;});
  if(event.type==='pointercancel')return;
  const drop=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-cov-drop]');
  const target=visible.find(card=>card.id===drop?.dataset.covDrop);
  if(!target)return;
  if(drag.kind==='person'){open(target,drag.key);return;}
  const source=visible.find(card=>card.id===drag.key);
  if(source?.impact.column===target.impact.column)prefer({order:moveCoverageCard(order,drag.key,target.id)});
 }
 return <section className="roster-board ti-cov-workspace" onPointerDown={pointerDown} onPointerMove={pointerMove}
  onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onClickCapture={event=>{if(ignoreClick.current){event.preventDefault();event.stopPropagation();}}}>
  <div className="toolbar ti-cov-workspace-tools">
   <nav className="tabs" aria-label="Turno">{Object.entries({todos:'Todos',...shifts}).map(([id,label])=>
    <button className="tab" type="button" key={id} aria-pressed={id===shift} onClick={()=>{prefer({shift:id});setPerson('');}}>{label}</button>)}</nav>
   <div className="ti-cov-date-pick">
    <label>Data <input type="date" required value={date} min={period?period+'-01':undefined} max={period?monthDates(period).at(-1):undefined} onChange={event=>{setDate(event.target.value);setPerson('');}}/></label>
    {activePlans.length>1&&<label>Escala <select value={activeId} onChange={event=>{setPlanId(event.target.value);setDate('');setPerson('');}}>
     {activePlans.map(item=><option value={item.id} key={item.id}>{item.title} · {item.period}</option>)}</select></label>}
   </div>
  </div>
  <CoverageMonth shift={shift} sector={sector} plan={plan} request={request} today={today} selected={date} choose={choose}
   alerts={data?.alerts} proposals={data?.proposals} onOpenAlert={item=>{alertFocus.current=item.sector+':'+item.shift;choose(item.date,item.shift,item.sector);if(current?.date===item.date){setOpened(alertFocus.current);alertFocus.current=null;}}}/>
  {!activeId&&!dashboardUnavailable&&<p className="panel ti-cov-feedback" role="status">{data?'Nenhuma escala disponível para avaliar.':'Carregando a escala…'}</p>}
  {loading&&<p className="panel ti-cov-feedback" role="status">Conferindo o turno…</p>}
  {error&&<p className="team-error" role="alert">{error} {activeId&&<button type="button" className="action quiet" onClick={()=>evaluate(activeId,date)}>Tentar novamente</button>}</p>}
  {current&&<><details className="panel ti-cov-context">
   <summary>Contexto operacional do dia</summary>
   {current.context?<div className="ti-cov-context-grid">
    <section><h3>Produção</h3><p>{current.context.production?.total||0} tarefa(s) interna(s){current.context.production?.late?` · ${current.context.production.late} atrasada(s)`:''}{current.context.production?.in_progress?` · ${current.context.production.in_progress} em andamento`:''}{current.context.production?.pending?` · ${current.context.production.pending} pendente(s)`:''}.</p>{current.context.production?.note&&<small>{current.context.production.note}</small>}</section>
    <section><h3>Estoque</h3><p>{current.context.stock?.low?.length||0} item(ns) abaixo do mínimo{current.context.stock?.unknown?` · ${current.context.stock.unknown} sem saldo confirmado`:''}.</p>{Array.isArray(current.context.stock?.low)&&current.context.stock.low.length>0&&<ul>{current.context.stock.low.slice(0,5).map((item,i)=><li key={item.id||item.name||i}><strong>{item.name||item.id||'Item'}</strong>{item.quantity!=null?` · ${item.quantity}${item.unit?` ${item.unit}`:''}`:''}{item.minStock!=null?` / mín. ${item.minStock}`:''}</li>)}</ul>}{current.context.stock?.partial&&<small>Leitura parcial do estoque.</small>}</section>
    <section><h3>Pedidos de compra</h3><p>{current.context.purchases?.records?.length||0} registro(s) consultado(s){current.context.purchases?.partial?' (parcial)':''}.</p>{current.context.purchases?.note&&<small>{current.context.purchases.note}</small>}</section>
    <section><h3>Recebimentos</h3><p>{current.context.receiving?.records?.length||0} conferência(s) pendente(s){current.context.receiving?.partial?' (parcial)':''}.</p>{current.context.receiving?.note&&<small>{current.context.receiving.note}</small>}</section>
    <section><h3>Demanda</h3><p>{current.context.demand?.status==='unknown'?'Não confirmada para o turno.':String(current.context.demand?.status||'Registrada.')}</p>{current.context.demand?.note&&<small>{current.context.demand.note}</small>}</section>
   </div>:<p>Contexto operacional indisponível para este dia.</p>}
  </details>
  <div className="layout">
   <aside className="panel team ti-cov-team-side" aria-label="Pessoas para reforço">
    <div className="section-head"><h2>Equipe para reforço</h2><span className="count">{availablePeople.size}</span></div>
    <p className="tip">{availablePeople.size?'Arraste um nome para o turno ou selecione os dois.':'Abra um turno para ver os horários e as opções.'}</p>
    <div className="ti-cov-person-list">{[...availablePeople.values()].map(person=>
     <button key={person.uid} type="button" className={'person'+(personId===person.uid?' selected':'')}
      data-cov-drag={person.uid} data-cov-kind="person" aria-pressed={personId===person.uid}
      onClick={()=>setPerson(personId===person.uid?'':person.uid)}>
      <span className="avatar" aria-hidden="true">{person.name.slice(0,1)}</span><span className="identity"><strong>{person.name}</strong><small>{person.jobTitle}</small></span><span className="drag" aria-hidden="true">⠿</span>
     </button>)}</div>
    {personId&&<small role="status">Selecione um turno para ver a prévia.</small>}
   </aside>
   <div className="boards">
    <div className="board-heading"><div><h2>Turnos de {shortDate(date)}</h2><p>{visible.filter(card=>card.impact.open).length} em atenção</p></div>
    <label>Setor <select value={sector} onChange={event=>{prefer({sector:event.target.value});setPerson('');}}>
     {Object.entries({todos:'Todos',...sectors}).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    </div>
   <div className="ti-cov-column-tabs" role="group" aria-label="Colunas do quadro">{Object.entries(coverageColumns).map(([id,label])=>
    <button key={id} type="button" aria-pressed={column===id} onClick={()=>setColumn(id)}>{label} {visible.filter(card=>card.impact.column===id).length}</button>)}</div>
   <div className="ti-cov-kanban">{Object.entries(coverageColumns).map(([id,label])=>{
    const items=visible.filter(card=>card.impact.column===id);
    return <section key={id} className="ti-cov-column" data-active={id===column} data-column={id} aria-label={label}>
     <h2>{label} <span>{items.length}</span></h2>
     {!items.length&&<p className="ti-cov-empty">Nenhum cartão nesta coluna.</p>}
     {items.map((card,index)=><article key={card.id} className="day ti-cov-ticket" data-cov-drop={card.id} data-selected={!!personId}>
      <header className="day-title"><h3>{sectors[card.row.sector]} · {shifts[card.row.shift]}</h3>
       <button type="button" className="ti-cov-grip" disabled={items.length<2} aria-label={'Reordenar '+sectors[card.row.sector]+' '+shifts[card.row.shift]}
        title="Arrastar para reordenar" data-cov-drag={card.id} data-cov-kind="card"
        onClick={()=>{const other=items[index===0?1:index-1];if(other)prefer({order:moveCoverageCard(order,card.id,other.id)});}}>⠿</button>
      </header>
      <div className="day-body ti-cov-ticket-body">
      <p>{card.row.minimum===null?card.impact.count+' com horário':card.impact.count+' de '+card.row.minimum+' previstos'}</p>
      <p className="ti-cov-ticket-problem">{problems(card.row,card.impact)}</p>
      {card.impact.waiting.length>0&&<small>{card.impact.waiting.length} em análise</small>}
      <button type="button" className="ti-cov-quiet" onClick={()=>open(card,personId)}>{personId?'Ver prévia':card.impact.column==='needs'?'Ver opções':card.impact.column==='waiting'?'Acompanhar':'Ver cobertura'}</button></div>
     </article>)}
    </section>;
   })}</div>
   </div>
  </div></>}
  {openedCard&&<CoverageDrawer key={openedCard.id} card={openedCard} data={data} date={date} plan={plan} request={request} run={run} busy={busy} selected={selected} setSelected={setSelected} close={()=>setOpened(null)} renderProposal={renderProposal} onRecordAbsence={recordAbsence?async payload=>{const response=await recordAbsence(payload);if(response)await evaluate(activeId,date);return response;}:null}/>}
 </section>;
}
export function CoveragePolicyForm({initial,people,save,busy}){
 const [value,setValue]=useState(()=>({holidays:(initial.holidays||[]).join(', '),strongPeaks:(initial.strongPeaks||[]).join(', '),
  peakPeriods:(initial.peakPeriods||[]).map(range=>range.start+' / '+range.end).join('\n'),countManagement:initial.countManagement??null,
  managementPaid:initial.managementPaid??null,frontWeekdayMinimum:initial.frontWeekdayMinimum??'',recurring:initial.recurring||[]}));
 const set=(key,entry)=>setValue(old=>({...old,[key]:entry}));
 const dates=input=>input.split(/[,\s]+/).filter(Boolean);
 return <form className="ti-cov-policy" onSubmit={event=>{
  event.preventDefault();
  save({...value,holidays:dates(value.holidays),strongPeaks:dates(value.strongPeaks),frontWeekdayMinimum:value.frontWeekdayMinimum===''?null:Number(value.frontWeekdayMinimum),
   peakPeriods:value.peakPeriods.split('\n').filter(line=>line.trim()).map(line=>{const [start,end]=line.split('/').map(x=>x.trim());return {start,end:end||''};})});
 }}>
  <div className="ti-cov-fields">
   <label>Feriados <input value={value.holidays} onChange={e=>set('holidays',e.target.value)} placeholder="AAAA-MM-DD, AAAA-MM-DD"/></label>
   <label>Dias com pico de montagem <input value={value.strongPeaks} onChange={e=>set('strongPeaks',e.target.value)} placeholder="AAAA-MM-DD, AAAA-MM-DD"/></label>
   <label>Períodos de movimento alto <textarea value={value.peakPeriods} onChange={e=>set('peakPeriods',e.target.value)} placeholder="AAAA-MM-DD / AAAA-MM-DD (uma linha por período)"/></label>
   <label>Mínimo da frente em dia comum<input type="number" min={1} max={30} value={value.frontWeekdayMinimum} onChange={e=>set('frontWeekdayMinimum',e.target.value)}/></label>
   {[['countManagement','Gestão conta para o mínimo da frente'],['managementPaid','Substituição da gestão gera taxa']].map(([key,label])=>
    <label key={key}>{label}<select value={String(value[key])} onChange={e=>set(key,e.target.value==='null'?null:e.target.value==='true')}><option value="null">A definir</option><option value="true">Sim</option><option value="false">Não</option></select></label>)}
  </div>
  {value.recurring.map((rule,i)=>{
   const change=(key,entry)=>set('recurring',value.recurring.map((item,index)=>index===i?{...item,[key]:entry}:item));
   return <div className="ti-cov-fields" key={i}>
    {[['absentId','Na folga fixa de'],['coverId','Pessoa que cobre']].map(([key,label])=><label key={key}>{label}<select value={rule[key]} required onChange={e=>change(key,e.target.value)}><option value="">Selecione</option>{people.filter(p=>p.status==='active').map(p=><option value={p.uid} key={p.uid}>{p.name}</option>)}</select></label>)}
    <label className="ti-cov-check"><input type="checkbox" checked={rule.paid} onChange={e=>change('paid',e.target.checked)}/>Cobertura remunerada</label>
    <button type="button" onClick={()=>set('recurring',value.recurring.filter((_,index)=>i!==index))}>Remover cobertura fixa</button>
   </div>;
  })}
  <div className="ti-cov-actions"><button type="button" onClick={()=>set('recurring',[...value.recurring,{absentId:'',coverId:'',paid:false}])}>Adicionar cobertura fixa</button>
   <button type="submit" disabled={busy}>Salvar regras operacionais</button></div>
 </form>;
}

export function CoverageSettlement({proposal,busy,run,request}){
 const [start,setStart]=useState(proposal.second?.start||''),[end,setEnd]=useState(proposal.second?.end||'');
 const [paidDate,setPaidDate]=useState(restaurantDay());
 if(!proposal.operational)return null;
 if(proposal.status==='paid')return <p>Pago em {shortDate(proposal.paidDate)} · {feeMoney(proposal.fee?.amount)}</p>;
 const completing=proposal.status==='approved';
 if(!completing&&proposal.status!=='completed')return null;
 if(!completing&&proposal.fixedFeePolicy===false)return <p>Cobertura realizada sem taxa.</p>;
 return <details>
  <summary>{completing?'Registrar realização':'Registrar pagamento'}</summary>
  <form className="ti-cov-policy" onSubmit={e=>{e.preventDefault();run(()=>request(completing?'completeCoverage':'payCoverage',completing?{id:proposal.id,actualStart:start,actualEnd:end}:{id:proposal.id,paidDate}));}}>
   {completing?<div className="ti-cov-fields"><label>Início efetivo da taxa<input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Fim efetivo da taxa<input type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div>:
    <><p>{feeMoney(proposal.fee?.amount)} · previsão {shortDate(proposal.fee?.dueDate)}</p><label>Pago em<input type="date" required value={paidDate} min={proposal.date} max={restaurantDay()} onChange={e=>setPaidDate(e.target.value)}/></label></>}
   <button type="submit" disabled={busy||(completing?proposal.date>restaurantDay():proposal.fee?.amount==null)}>{completing?'Confirmar turno realizado':'Confirmar pagamento'}</button>
  </form>
 </details>;
}
