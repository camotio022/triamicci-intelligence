import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {weekdayOf} from '../server/schedules/generator.js';
import {effectiveFiveTwoPair, FIVE_TWO_PAIRS, fiveTwoPair, fiveTwoSundays, fiveTwoWeeks, shiftScheduleDate} from '../server/schedules/five-two.js';
import {evaluateOperationalDay,suggestSundayMove} from '../server/coverage/operational.js';
import PageHeading from './ui/PageHeading.jsx';
import './roster-board.css';

const shortDate = date => date.slice(8) + '/' + date.slice(5, 7);
const formatMonth = new Intl.DateTimeFormat('pt-BR', {month:'long', year:'numeric', timeZone:'UTC'});
const formatDay = new Intl.DateTimeFormat('pt-BR', {weekday:'long', timeZone:'UTC'});
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
const weekLabel = date => shortDate(date) + ' a ' + shortDate(shiftScheduleDate(date, 6));
const nameOf = person => person.name || person.email || 'Colaborador';
const tones = ['#f7e5e3','#e8e4f5','#e9f0de','#f7e9d9','#f0e6f9','#e2eeeb','#fae6e1','#e6edf7'];
const sectors = {cozinha:'Cozinha', frente:'Frente', caixa:'Caixa', apoio:'Apoio', gestao:'Gestão'};
const shifts = {manha:'Manhã', noite:'Noite', intermediario:'Intermediário', variavel:'Variável', unknown:'Turno a definir'};
const scheduleDays = ['dom','seg','ter','qua','qui','sex','sab'];
const nameOrder = new Intl.Collator('pt-BR');

function WorkingPreview({date, entries, people, holiday=false}){
 const [selectedShift,setSelectedShift]=useState(null);
 const panelId=useId();
 const working=new Set(entries.filter(entry=>entry.type==='work').map(entry=>entry.uid));
 const groups=new Map();
 const weekday=scheduleDays[holiday?0:weekdayOf(date)];
 for(const person of people.filter(item=>working.has(item.uid)).sort((a,b)=>nameOrder.compare(nameOf(a),nameOf(b)))){
  const profile=person.professional||{};
  const shift=Object.hasOwn(shifts,profile.shift)?profile.shift:'unknown';
  const sector=sectors[profile.sector]||'Setor a definir';
  const slot=profile.availability?.find(item=>item.day===weekday);
  const hours=slot?.start&&slot?.end?slot.start+'–'+slot.end:'Horário pendente';
  if(!groups.has(shift))groups.set(shift,{count:0,sectors:new Map()});
  const group=groups.get(shift);
  group.count++;
  if(!group.sectors.has(sector))group.sectors.set(sector,new Map());
  const times=group.sectors.get(sector);
  if(!times.has(hours))times.set(hours,[]);
  times.get(hours).push(nameOf(person));
 }
 const active=groups.get(selectedShift);
 return <div className="working-preview" role="group" aria-label="Quem trabalha">
  <div className="working-preview-heading">
   <strong>Quem trabalha</strong>
   {groups.size?<div className="working-shifts">{Object.entries(shifts).filter(([shift])=>groups.has(shift)).map(([shift,label])=>
    <button type="button" key={shift} aria-expanded={selectedShift===shift} aria-controls={panelId}
     onClick={()=>setSelectedShift(current=>current===shift?null:shift)}>
     {label} <span>{groups.get(shift).count}</span><span className="working-chevron" aria-hidden="true"/>
    </button>)}</div>:<p>{entries.length?'Ninguém previsto':'Sem lançamentos'}</p>}
  </div>
  <div id={panelId} hidden={!active}>{active&&<ul>
   {[...active.sectors].sort(([a],[b])=>nameOrder.compare(a,b)).map(([sector,times])=><li key={sector}>
    <strong>{sector}</strong>
    <span>{[...times].map(([hours,names])=><span className="working-times" key={hours}>
     {names.join(', ')} <small>· {hours}</small>
    </span>)}</span>
   </li>)}
  </ul>}</div>
 </div>;
}

const roleLabel = {cook:'Cozinheiro', auxiliar:'Auxiliar', admin:'Administração', manager:'Gerência', submanager:'Subgerência'};

function Avatar({person}){
 return <span aria-hidden="true" className="avatar" style={{'--avatar':person.color}}>{nameOf(person).slice(0,1)}</span>;
}

function PersonCard({person, selected, variant='person', description, editable, onSelect}){
 return <button type="button" className={variant+(selected?' selected':'')} data-person={person.uid}
  aria-pressed={selected} disabled={!editable} onClick={()=>onSelect(person.uid)}>
  <Avatar person={person}/>
  <span className="identity"><strong>{nameOf(person)}</strong>{description&&<small>{description}</small>}</span>
  {variant==='person'&&<span className="drag" aria-hidden="true">⠿</span>}
 </button>;
}

function Coverage({rows}){
 const [expanded,setExpanded]=useState(false);
 if(!rows.length)return <p className="weekly-label">Sem regras de cobertura para este dia.</p>;
 const visible=expanded?rows:rows.slice(0,3);
 return <>
  <div className="coverage">{visible.map((row,index)=><div key={row.sector+row.start+row.skill+index} className={'metric'+(row.deficit?' risk':'')}>
   <span>{sectors[row.sector]||row.sector}{row.skill?' · '+row.skill:''} · {row.start}–{row.end}</span>
   <strong>{row.covered} / {row.minimum} mínimo</strong>
  </div>)}</div>
  {rows.length>3&&<button type="button" className="remove" onClick={()=>setExpanded(old=>!old)}>{expanded?'Ver menos':'Ver todos os horários'}</button>}
 </>;
}

function Badge({rows}){
 if(!rows.length)return <span className="badge neutral">Sem mínimos</span>;
 return rows.some(row=>row.deficit)?<span className="badge alert">Atenção</span>:<span className="badge">Cobertura OK</span>;
}

export default function RosterBoard({period, changePeriod, roster, updateRoster, members, entries, requirements, editable, saving, canSave, onSave, saved, onUndo, canUndo, status, loadPending, loadError, retryLoad, lockedWeeks=[], approvedLeaves=[], coveragePolicy={}, onOpenCoverage}){
 const [view,setView]=useState('sundays');
 const [sundaySelected,setSunday]=useState('');
 const [weekSelected,setWeek]=useState('');
 const [pair,setPair]=useState(0);
 const [personId,setPerson]=useState(null);
 const [message,setMessage]=useState('');
 const [comparison,setComparison]=useState(null);
 const drag=useRef(null);
 const suppressClick=useRef(false);
 const weeks=useMemo(()=>fiveTwoWeeks(period),[period]);
 const sundays=useMemo(()=>fiveTwoSundays(period),[period]);
 const sunday=sundays.includes(sundaySelected)?sundaySelected:sundays[0];
 const week=weeks.includes(weekSelected)?weekSelected:weeks[0];
 const people=useMemo(()=>members.map((member,index)=>({...member,color:tones[index%tones.length]})),[members]);
 const person=people.find(item=>item.uid===personId);
 const selectedName=person?nameOf(person):'';
 const days=useMemo(()=>{
  const grouped=new Map();
  for(const entry of entries){
   if(!grouped.has(entry.date))grouped.set(entry.date,[]);
   grouped.get(entry.date).push(entry);
  }
  return grouped;
 },[entries]);
 const evaluate=date=>evaluateOperationalDay({date,entries:days.get(date)||[],people,requirements,policy:coveragePolicy});
 const monthly=useMemo(()=>[...days].filter(([date])=>date.startsWith(period)).map(([date,entries])=>
  evaluateOperationalDay({date,entries,people,requirements,policy:coveragePolicy})),[days,period,people,requirements,coveragePolicy]);
 const monthOptions=useMemo(()=>{
  const date=new Date(period+'-01T12:00:00Z');
  return Array.from({length:25},(_,index)=>new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+index-12,1,12)).toISOString().slice(0,7));
 },[period]);
 useEffect(()=>()=>drag.current?.ghost?.remove(),[]);

 const selectPerson=uid=>{
  if(suppressClick.current)return;
  const next=uid===personId?null:uid;
  setPerson(next);
  setMessage(next?nameOf(people.find(item=>item.uid===uid))+' selecionado. Escolha um destino.':'Seleção limpa.');
 };

 function entriesFor(date, override){
  const current=days.get(date)||[];
  return override?current.map(entry=>entry.uid===override.uid&&entry.type!=='leave'
   ?{...entry,type:override.type}:entry):current;
 }

 function rowsFor(date, override){
  return evaluateOperationalDay({date,entries:entriesFor(date,override),people,requirements,policy:coveragePolicy}).intervals
   .sort((a,b)=>b.deficit-a.deficit||a.start.localeCompare(b.start));
 }

 function assignSunday(uid,date){
  setComparison(null);
  if(!editable||roster.sundays[uid]===date)return;
  if(roster.lockedSundays?.includes(uid)){setMessage('Destrave o domingo antes de mover.');return;}
  const target=people.find(p=>p.uid===uid);
  if(approvedLeaves.some(l=>l.date===date&&(l.uid===uid||l.uid===target?.accountUid))){setMessage('A pessoa tem uma ausência aprovada nesta data.');return;}
  const risk=rowsFor(date,{uid,type:'monthly_sunday'}).find(row=>row.deficit);
  updateRoster({...roster,sundays:{...roster.sundays,[uid]:date}});
  setSunday(date);
  setPerson(null);
  setMessage(nameOf(people.find(item=>item.uid===uid))+' ficou com '+shortDate(date)+'.'+(risk?' Confira a cobertura.':''));
 }

 function assignWeek(uid,nextPair){
  setComparison(null);
  if(lockedWeeks.includes(week)){setMessage('Esta semana pertence também a uma escala publicada. Escolha uma semana seguinte para mudar o par fixo.');return;}
  if(!editable||fiveTwoPair(roster,week,uid)===nextPair)return;
  updateRoster(effectiveFiveTwoPair(roster,period,week,uid,nextPair,lockedWeeks));
  setPair(nextPair);
  setPerson(null);
  setMessage(nameOf(people.find(item=>item.uid===uid))+' ficou com '+FIVE_TWO_PAIRS[nextPair]+' a partir da semana de '+weekLabel(week)+'.');
 }

 function removeSunday(){
  const next={...roster.sundays};
  delete next[personId];
  updateRoster({...roster,sundays:next,lockedSundays:(roster.lockedSundays||[]).filter(uid=>uid!==personId)});
  setPerson(null);
  setMessage(selectedName+' ficou sem domingo definido.');
 }

 function pointerDown(event){
  const chip=event.target.closest('[data-person]');
  if(!editable||!chip||event.button!==0||event.pointerType==='touch')return;
  drag.current={uid:chip.dataset.person,pointerId:event.pointerId,x:event.clientX,y:event.clientY};
  chip.setPointerCapture(event.pointerId);
 }

 function pointerMove(event){
  const moving=drag.current;
  if(!moving||moving.pointerId!==event.pointerId)return;
  if(!moving.ghost){
   if(Math.hypot(event.clientX-moving.x,event.clientY-moving.y)<8)return;
   moving.ghost=document.createElement('span');
   moving.ghost.className='drag-ghost';
   moving.ghost.textContent=nameOf(people.find(item=>item.uid===moving.uid));
   event.currentTarget.append(moving.ghost);
  }
  moving.ghost.style.transform='translate('+(event.clientX+12)+'px,'+(event.clientY+12)+'px)';
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-drop-sunday], [data-drop-pair]');
  if(target===moving.target)return;
  moving.target?.classList.remove('drop-active');
  target?.classList.add('drop-active');
  moving.target=target;
 }

 function endDrag(event){
  const moving=drag.current;
  if(!moving||moving.pointerId!==event.pointerId)return;
  drag.current=null;
  if(!moving.ghost)return;
  moving.ghost.remove();
  moving.target?.classList.remove('drop-active');
  suppressClick.current=true;
  requestAnimationFrame(()=>{suppressClick.current=false;});
  if(!moving.target||event.type==='pointercancel')return;
  const {dropSunday,dropPair}=moving.target.dataset;
  if(dropSunday)assignSunday(moving.uid,dropSunday);
  if(dropPair!==undefined)assignWeek(moving.uid,Number(dropPair));
 }

 const isSunday=view==='sundays';
 const dates=isSunday?sundays:FIVE_TWO_PAIRS;
 const coverage=rowsFor(sunday);
 const dayRisk=monthly.find(item=>item.date===sunday)||evaluate(sunday);
 const candidates=isSunday&&editable?people.filter(item=>roster.sundays[item.uid]!==sunday).map(item=>{
  const rows=rowsFor(sunday,{uid:item.uid,type:'monthly_sunday'});
  return {person:item,issue:rows.find(row=>row.deficit),evaluated:rows.length>0};
 }).sort((a,b)=>Number(Boolean(a.issue))-Number(Boolean(b.issue))||Number(Boolean(roster.sundays[a.person.uid]))-Number(Boolean(roster.sundays[b.person.uid]))):[];
 const safe=candidates.filter(item=>!item.issue);
 const conflict=candidates.find(item=>item.issue);
 const suggestions=conflict?[...safe.slice(0,3),conflict]:safe.slice(0,4);

 function personCards(list,variant){
  return list.map(item=>{
   const weeklyPair=fiveTwoPair(roster,week,item.uid);
   const description=variant==='person'?(isSunday
    ?roster.sundays[item.uid]?'Dom. '+shortDate(roster.sundays[item.uid]):[item.professional?.shift,item.professional?.jobTitle||roleLabel[item.role]].filter(Boolean).join(' · ')
    :FIVE_TWO_PAIRS[weeklyPair]||'Par pendente'):'';
   return <PersonCard key={item.uid} person={item} selected={item.uid===personId} variant={variant}
    description={description} editable={editable} onSelect={selectPerson}/>;
  });
 }

 return <section className="roster-board" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
  <PageHeading title="Quadro de folgas" className="roster-heading" actions={
   <div className="month-control"><label htmlFor="roster-month">Mês da escala</label>
    <select id="roster-month" value={period} disabled={saving} onChange={event=>{setPerson(null);changePeriod(event.target.value);}}>
     {monthOptions.map(month=><option key={month} value={month}>{capitalize(formatMonth.format(new Date(month+'-01T12:00:00Z')))}</option>)}
    </select>
   </div>
  }/>
  {loadPending?<div className="roster-load panel" role="status">Carregando equipe e escalas…</div>
   :loadError?<div className="roster-load panel" role="alert"><div><strong>Não foi possível carregar a escala</strong><p>{loadError}</p></div>
    <button type="button" className="action quiet" onClick={retryLoad}>Tentar novamente</button></div>
   :<>
   <div className="toolbar">
    <nav className="tabs" aria-label="Visões da escala">
     <button type="button" className="tab" aria-pressed={isSunday} onClick={()=>{setView('sundays');setPerson(null);setMessage('');}}>Domingos do mês</button>
     <button type="button" className="tab" aria-pressed={!isSunday} onClick={()=>{setView('week');setPerson(null);setMessage('');}}>Semana 5×2</button>
    </nav>
    <div className="actions"><span className="save-status">{status||(saved?'Rascunho salvo':'Rascunho')}</span>
     {editable&&<><button type="button" className="action quiet" disabled={!canUndo||saving} onClick={()=>{setComparison(null);onUndo();setPerson(null);setMessage('Última mudança desfeita.');}}>Desfazer</button>
     <button type="button" className="action primary" disabled={!canSave||saving} onClick={onSave}><span className="full-label">Salvar rascunho</span><span className="compact-label">Salvar</span></button></>}
    </div>
   </div>
   {people.length>0&&<section className="panel roster-impact" aria-label="Impacto previsto no mês">
    <div><strong>{monthly.filter(day=>day.attention).length}</strong> dias em atenção <span>·</span> <strong>{monthly.reduce((n,day)=>n+day.recurringFees,0)}</strong> taxas recorrentes cadastradas <span>·</span> <strong>{monthly.reduce((n,day)=>n+day.extra,0)}</strong> possíveis reforços <small>· podem gerar taxa</small></div>
    {editable&&isSunday&&<button type="button" className="action quiet" onClick={()=>setComparison(suggestSundayMove({period,roster,entries,people,requirements,policy:coveragePolicy})||false)}>Sugerir domingos</button>}
   </section>}
   {comparison!==null&&<section className="panel roster-impact" aria-label="Comparar domingos">
    {comparison?<><div><strong>Mover {comparison.name} de {shortDate(comparison.from)} para {shortDate(comparison.to)}</strong>
     <p>{comparison.before.map((result,i)=>shortDate(result.date)+': '+result.extra+' → '+comparison.after[i].extra+' reforços a avaliar').join(' · ')}</p></div>
     <button type="button" className="action primary" disabled={!editable} onClick={()=>{assignSunday(comparison.uid,comparison.to);setComparison(null);}}>Aplicar no rascunho</button></>
     :<p>Não encontrei uma troca que reduza o risco sem piorar o outro domingo.</p>}
    <button type="button" className="action quiet" onClick={()=>setComparison(null)}>Fechar</button>
   </section>}
   <div className="layout">
    <aside className="panel team" aria-label="Equipe"><div className="section-head"><h2>Equipe</h2><span className="count">{people.length}</span></div>
     {editable&&<p className="tip">{isSunday?'Arraste um nome ou selecione a pessoa e o domingo.':'Selecione ou arraste um nome para um par de dias.'}</p>}
     <div className="people">{personCards(people,'person')}</div><div className="mobile-people">{personCards(people,'mobile-person')}</div>
     {!people.length&&<p className="note">Nenhum colaborador disponível.</p>}
     {isSunday&&<p className="note">{people.filter(item=>roster.sundays[item.uid]).length} de {people.length} com domingo definido</p>}
    </aside>
    <section className={'boards'+(isSunday?'':' weekly')}>
     <div className="board-heading"><div><h2>{isSunday?'Domingos do mês':'Semana 5×2'}</h2><p>{isSunday?'Uma folga extra por pessoa, em uma data deste mês.':'Alterar o par fixa a folga a partir da semana escolhida.'}</p></div>{isSunday&&<span className="count">{sundays.length} domingos</span>}</div>
     {!isSunday&&<div className="week-select"><label htmlFor="roster-week">Semana</label><select id="roster-week" value={week} onChange={event=>{setWeek(event.target.value);setPerson(null);}}>{weeks.map(date=><option key={date} value={date}>{weekLabel(date)}</option>)}</select></div>}
     <div className="date-strip" style={{'--cols':dates.length}}>{dates.map((date,index)=><button type="button" key={date} className="mobile-date" aria-pressed={isSunday?date===sunday:index===pair}
      aria-label={isSunday?'Domingo '+shortDate(date):date} onClick={()=>isSunday?setSunday(date):setPair(index)}>{isSunday?shortDate(date):date.replace(' + ','/')}</button>)}</div>
     <div className={isSunday?'month-grid':'week-grid'} style={{'--cols':dates.length}}>
      {dates.map((date,index)=>{
       const active=isSunday?date===sunday:index===pair;
       const assigned=people.filter(item=>isSunday?roster.sundays[item.uid]===date:fiveTwoPair(roster,week,item.uid)===index);
       const issue=isSunday&&monthly.find(x=>x.date===date)?.attention;
       return <article className={'day'+(active?' active':'')} key={date}
        data-drop-sunday={isSunday?date:undefined} data-drop-pair={isSunday?undefined:index}>
        <button type="button" className="day-title" aria-pressed={active} onClick={()=>isSunday?setSunday(date):setPair(index)}>
         <span className="date-name"><strong>{isSunday?'Dom. '+shortDate(date):date}</strong><small>{assigned.length} de folga</small></span>
         {issue&&<span className="badge alert" aria-label="Cobertura em atenção">!</span>}
        </button>
        <div className="day-body">
         {personCards(assigned,'assigned')}
         {editable&&person?<button type="button" className="add" onClick={()=>isSunday?assignSunday(personId,date):assignWeek(personId,index)}>Colocar {selectedName}</button>
          :!assigned.length&&<div className="empty">Sem folgas</div>}
        </div>
       </article>;
      })}
     </div>
     {isSunday?<section className="panel detail">
      <div className="detail-intro"><div><h3>Domingo {shortDate(sunday)}</h3><p>Cobertura prevista com as folgas {editable?'deste rascunho':'desta escala'}.</p></div><Badge rows={coverage}/></div>
      <WorkingPreview key={sunday} date={sunday} entries={entriesFor(sunday)} people={people}/>
      {dayRisk.attention&&<details className="roster-operational"><summary>Avaliar cobertura do rascunho</summary>
       {dayRisk.shifts.filter(row=>row.shortage||row.uncertain).map(row=><section key={row.shift+row.sector}>
        <strong>{shifts[row.shift]} · {sectors[row.sector]}</strong><p>{row.reasons.join(' ')}</p>
       </section>)}
       {dayRisk.recurring.map(item=><p key={item.uid+item.forUid}>{item.name} · {item.available?'cobertura habitual prevista':'cobertura habitual a confirmar'}</p>)}
      </details>}
      {onOpenCoverage&&<button type="button" className="action quiet" onClick={()=>onOpenCoverage(sunday)}>Abrir este dia na Cobertura</button>}
      <Coverage key={'coverage-'+sunday} rows={coverage}/>
      {editable&&<><div className="section-head"><h3>Quem pode folgar</h3>
       {person&&roster.sundays[personId]===sunday&&<div>
        <button type="button" className="remove" onClick={()=>{setComparison(null);const locked=roster.lockedSundays||[];updateRoster({...roster,lockedSundays:locked.includes(personId)?locked.filter(uid=>uid!==personId):[...locked,personId]});}}>{roster.lockedSundays?.includes(personId)?'Destravar':'Travar'} domingo</button>
        <button type="button" className="remove" disabled={roster.lockedSundays?.includes(personId)} onClick={removeSunday}>Remover {selectedName}</button>
       </div>}
      </div>
      <div className="suggestions">{suggestions.length?suggestions.map(({person:item,issue,evaluated})=><button type="button" key={item.uid}
       className={'suggestion'+(issue?' risk-suggestion':'')} onClick={()=>assignSunday(item.uid,sunday)}>
        <Avatar person={item}/><span className="identity"><strong>{nameOf(item)}</strong><small>{issue
         ?'Falta cobertura · '+(sectors[issue.sector]||issue.sector)+(issue.skill?' · '+issue.skill:'')+' '+issue.start+'–'+issue.end
         :!evaluated?'Sem mínimo configurado'
         :roster.sundays[item.uid]?'Pode mover de '+shortDate(roster.sundays[item.uid]):'Pode folgar'}</small></span><span className="drag" aria-hidden="true">{issue?'!':'+'}</span>
       </button>):<p className="tip">Nenhum outro nome para este domingo.</p>}</div></>}
     </section>:[pair,pair+1].map(index=>{
      const date=shiftScheduleDate(week,index);
      const override=person?{uid:personId,type:'off'}:null;
      const rows=rowsFor(date,override);
      return <section key={date} className="panel detail">
       <div className="detail-intro"><h3>{capitalize(formatDay.format(new Date(date+'T12:00:00Z')))} · {shortDate(date)}</h3><Badge rows={rows}/></div>
       <WorkingPreview date={date} entries={entriesFor(date,override)} people={people} holiday={coveragePolicy.holidays?.includes(date)}/>
       <Coverage rows={rows}/>
       {date.startsWith(period)&&monthly.find(item=>item.date===date)?.recurring.map(item=>
        <p key={item.uid+item.forUid} className="weekly-label">{item.name} · {item.available?'cobertura habitual prevista':'cobertura habitual a confirmar'}</p>)}
       {onOpenCoverage&&date.startsWith(period)&&<button type="button" className="action quiet" onClick={()=>onOpenCoverage(date)}>Abrir na Cobertura</button>}
      </section>;
     })}
    </section>
   </div>
   <p className="live" role="status">{message}</p>
  </>}
 </section>;
}
