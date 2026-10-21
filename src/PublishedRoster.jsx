import React,{useMemo,useState} from 'react';
import {weeksForMonth,paperRoster,dayOf} from '../server/schedules/mural-view.js';
import './published-roster.css';
import {restaurantDay,rosterToday} from '../server/schedules/restaurant-today.js';
const formatDate=date=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const getWeeks=s=>weeksForMonth(s.period);
export default function PublishedRoster({schedule}){
 const weeks=useMemo(()=>getWeeks(schedule),[schedule.period]);
 const [weekIndex,setWeekIndex]=useState(0);
 const index=Math.min(weekIndex,Math.max(0,weeks.length-1));
 const data=useMemo(()=>paperRoster(schedule,weeks[index]||[]),[schedule,index]);
 const allSundays=useMemo(()=>paperRoster(schedule,[]).sundays,[schedule]);
 const sundayDates=weeks[index]?.filter(d=>dayOf(d)===0)||[];
 const [mode,setMode]=useState('week');
 const partialFirst=(weeks[0]?.length||0)>7&&index===0;
 const visibleSundays=mode==='sundays'?allSundays:allSundays.filter(s=>sundayDates.includes(s.date));
 const [showDetails,setShowDetails]=useState(false);
 const [today,setToday]=useState(()=>restaurantDay());
 React.useEffect(()=>{const refresh=()=>setToday(restaurantDay());const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[]);
 const todayPeople=useMemo(()=>rosterToday(schedule,today),[schedule,today]);
 return <div className="ti-roster" aria-label={'Folgas oficiais '+schedule.period}>
  <div className="ti-roster-today-summary" aria-label={'Equipe de hoje '+today}><strong>Hoje · {formatDate(today)}</strong><span>Escala publicada, não comprovante de presença</span>{schedule.period===today.slice(0,7)?<p>{todayPeople.length===0?'Sem lançamentos para hoje.':todayPeople.map(x=>`${x.name||'Colaborador'}: ${x.operationalStatus==='scheduled_unconfirmed'?'Escalado · presença não confirmada':x.operationalStatus==='day_off'?'Folga':'Ausência registrada'}`).join(' · ')}</p>:<p>Esta escala é de outro mês. Abra a escala do mês atual para consultar hoje.</p>}</div>
  <div className="ti-roster-heading">
   <div><strong>Escala de folgas</strong><small>{new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(schedule.period+'-01T12:00:00Z'))} · Publicada</small></div>
   <div className="ti-roster-switch" role="group" aria-label="Visualização da escala">
    <button type="button" className={mode==='week'?'active':''} onClick={()=>setMode('week')} aria-pressed={mode==='week'}>Semana</button>
    <button type="button" className={mode==='sundays'?'active':''} onClick={()=>setMode('sundays')} aria-pressed={mode==='sundays'}>Domingos</button>
   </div>
  </div>
  {mode==='week'&&<>
   <div className="ti-roster-nav"><button type="button" disabled={index===0} onClick={()=>setWeekIndex(n=>Math.max(0,n-1))} aria-label="Semana anterior">‹</button><strong>{weeks[index]?.length?formatDate(weeks[index][0])+' – '+formatDate(weeks[index].at(-1)):'Sem datas'}{partialFirst?' · início do mês':''}</strong><button type="button" disabled={index===weeks.length-1} onClick={()=>setWeekIndex(n=>n+1)} aria-label="Próxima semana">›</button></div>
   {partialFirst&&<p className="ti-roster-context">A primeira visualização reúne o começo do mês e a semana seguinte para facilitar a leitura da escala.</p>}
   <div className="ti-roster-days">
    {data.offByDay.map(group=><section className={"ti-roster-day"+(group.day===today?" ti-roster-day-today":"")} key={group.day}><h4>{group.label}</h4>{group.people.length?<ul>{group.people.map(p=><li key={p.uid+'-'+p.date}>{p.name}</li>)}</ul>:<p>Nenhuma folga</p>}</section>)}
   </div>
   {data.exceptions.length>0&&<div className="ti-roster-exceptions"><strong>Ausências e exceções</strong>{data.exceptions.map(p=><p key={p.uid+p.date}>{formatDate(p.date)} · {p.name} · {p.type==='leave'?'Ausência':'Folga excepcional'}</p>)}</div>}
  </>}
  {(mode==='sundays'||visibleSundays.length>0)&&<section className="ti-roster-sundays"><h4>{mode==='sundays'?'Domingos do mês':'Domingo desta semana'}</h4><div className="ti-roster-sunday-grid">{visibleSundays.map(s=><div key={s.date}><strong>{formatDate(s.date)}</strong>{s.people.length?<ul>{s.people.map(p=><li key={p.uid}>{p.name}</li>)}</ul>:<small>Sem folga adicional registrada</small>}</div>)}</div></section>}
  <details className="ti-roster-details" open={showDetails} onToggle={e=>setShowDetails(e.currentTarget.open)}>
   <summary>Ver lançamentos completos</summary><div className="ti-roster-detail-scroll"><table><thead><tr><th>Data</th><th>Funcionário</th><th>Situação</th></tr></thead><tbody>{(schedule.entries||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.name).localeCompare(String(b.name),'pt-BR')).map((e,i)=><tr key={e.uid+e.date+i}><td>{formatDate(e.date)}</td><td>{e.name||'Colaborador'}</td><td>{({work:'Trabalho',off:'Folga fixa',monthly_sunday:'Domingo adicional',leave:'Ausência'})[e.type]||'—'}</td></tr>)}</tbody></table></div>
  </details>
 </div>;
}
