import React,{useEffect,useState} from 'react';

const labels={cozinha:'Cozinha',frente:'Frente',manha:'Manhã',noite:'Noite'};
const short=date=>date.slice(8,10)+'/'+date.slice(5,7);

export default function CoverageMonth({plan,request,selected,choose,today,alerts,onOpenAlert,proposals,shift='todos',sector='todos'}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('sundays'),[attempt,retry]=useState(0);
 const id=plan?.id,version=plan?.updatedAt;
 useEffect(()=>{
  if(!id)return;
  let active=true;
  setError('');
  request('assessMonth',{planId:id}).then(result=>{if(active)setState({id,month:result.month});})
   .catch(e=>{if(active)setError(e.message);});
  return ()=>{active=false;};
 },[id,version,request,attempt,alerts,proposals]);
 if(!plan)return null;
 const month=state&&state.id===id?state.month:null;
 const matchesScope=item=>(shift==='todos'||item.shift===shift)&&(sector==='todos'||item.sector===sector);
 const feeCounts=items=>{
  const keys=rows=>new Set(rows.map(item=>item.uid+'|'+item.shift));
  const confirmed=keys(items.filter(item=>item.available&&item.paid===true));
  const pending=keys(items.filter(item=>!item.available&&item.paid===true&&!confirmed.has(item.uid+'|'+item.shift)));
  const unknown=keys(items.filter(item=>item.paid==null&&!confirmed.has(item.uid+'|'+item.shift)&&!pending.has(item.uid+'|'+item.shift)));
  return {recurringFees:confirmed.size,recurringPendingFees:pending.size,recurringUnknownFees:unknown.size};
 };
 const fixed=new Map();
 for(const day of month?.days||[])for(const item of day.recurring.filter(matchesScope)){
  const key=[item.uid,item.forUid,item.shift,item.sector].join(':');
  const fallback={...item,days:[],pending:0};
  const group=fixed.get(key)||fallback;
  group.days.push(short(day.date)); if(!item.available)group.pending++;
  fixed.set(key,group);
 }
 const scoped=(month?.days||[]).map(day=>{
  const shifts=day.shifts.filter(matchesScope);
  const recurring=day.recurring.filter(matchesScope);
  return {...day,...feeCounts(recurring),shifts,
   confirmed:shifts.some(row=>row.confirmedDeficit),
   pending:day.unplanned||shifts.some(row=>row.attention&&!row.confirmedDeficit)};
 });
 const upcoming=scoped.filter(day=>day.date>=today);
 const confirmedDays=upcoming.filter(day=>day.confirmed);
 const pendingDays=upcoming.filter(day=>day.pending);
 const dates={sundays:scoped.filter(day=>day.sunday),attention:confirmedDays,pending:pendingDays,all:scoped}[mode];
 const totalFees=key=>upcoming.reduce((n,day)=>n+day[key],0);
 const extra=upcoming.reduce((n,day)=>n+day.shifts.reduce((sum,row)=>sum+row.extra,0),0);
 return <section className="ti-coverage-month" aria-label="Cobertura do mês">
  <div className="board-heading"><div><h2>Visão do mês · {plan.period.split('-').reverse().join('/')}</h2><p>{plan.status==='published'?'Escala publicada':'Escala em preparação'}</p></div>
   {today.startsWith(plan.period)&&<button className="action quiet" type="button" onClick={()=>choose(today)}>Ver hoje</button>}
  </div>
  {error?<p role="alert">{error} <button type="button" className="action quiet" onClick={()=>retry(value=>value+1)}>Tentar novamente</button></p>:
   !month?<p role="status" className="panel ti-cov-feedback">Conferindo os turnos do mês…</p>:<>
    <div className="panel roster-impact"><div>A partir de hoje · <strong>{confirmedDays.length}</strong> com falta confirmada · <strong>{pendingDays.length}</strong> a conferir · <strong>{totalFees('recurringFees')}</strong> em taxas fixas previstas · <strong>{totalFees('recurringPendingFees')+totalFees('recurringUnknownFees')}</strong> fixas a conferir · {month.extra===null?'Complete a escala para estimar vagas extras':<><strong>{extra}</strong> {extra===1?'vaga extra estimada':'vagas extras estimadas'}</>}</div></div>
    {alerts?.some(item=>item.planId===id&&matchesScope(item))&&<div className="panel ti-cov-month-alerts"><h3>Alertas da gestão</h3>
     {alerts.filter(item=>item.planId===id&&matchesScope(item)).slice(0,5).map(item=><button key={item.id} className="action quiet" type="button" onClick={()=>onOpenAlert(item)}>
      {short(item.date)} · {labels[item.shift]} · {labels[item.sector]} · {item.reason}
     </button>)}
    </div>}
    <nav className="tabs ti-cov-month-filter" aria-label="Dias do mês">{Object.entries({sundays:'Domingos',attention:'Falta confirmada',pending:'A conferir',all:'Todos os dias'}).map(([key,label])=>
     <button className="tab" type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</nav>
    <div className="ti-cov-month-dates">{dates.map(day=>{
     const risk=day.shifts.filter(row=>row.attention&&(mode==='pending'?!row.confirmedDeficit:!day.confirmed||row.confirmedDeficit))
      .sort((a,b)=>Math.max(b.headcountGap,b.roleGap,b.skillGap,b.intervalGap)-Math.max(a.headcountGap,a.roleGap,a.skillGap,a.intervalGap))[0];
     const status=risk?.confirmedDeficit?'Falta confirmada':day.pending?'A conferir':'';
     return <article className={'day'+(selected===day.date?' active':'')} key={day.date}>
      <button type="button" className="day-title" aria-pressed={selected===day.date} onClick={()=>choose(day.date,risk?.shift,risk?.sector)}>
       <strong>{day.sunday?'Dom. ':day.holiday?'Feriado · ':''}{short(day.date)}</strong>{status&&<span className="count" data-confirmed={Boolean(risk?.confirmedDeficit)}>{status}</span>}
      </button>
      <div className="day-body"><small>{day.date<today?'Histórico · ':''}{day.unplanned?'Sem lançamentos':risk?labels[risk.sector]+' · '+labels[risk.shift]:'Cobertura prevista'}</small>
       {day.recurringFees>0&&<small>{day.recurringFees} fixa(s) com taxa</small>}</div>
     </article>;
    })}</div>
    {!dates.length&&<p>{mode==='attention'?'Nenhuma falta confirmada a partir de hoje.':mode==='pending'?'Nenhuma pendência a conferir a partir de hoje.':'Sem dias para este filtro.'}</p>}
    <details className="panel ti-cov-fixed-month"><summary>Coberturas fixas · {fixed.size}</summary>
     {fixed.size?[...fixed.entries()].map(([key,item])=><p key={key}><strong>{item.name}</strong> · {labels[item.shift]||'Turno a confirmar'} · {item.paid===true?'Com taxa':item.paid===false?'Sem taxa':'Taxa a definir'} · {item.days.join(', ')}{item.pending?' · '+item.pending+' a confirmar':''}</p>):<p>Nenhuma cobertura fixa prevista nesta escala.</p>}
    </details>
   </>}
 </section>;
}
