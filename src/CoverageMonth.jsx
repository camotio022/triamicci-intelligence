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
 const fixed=new Map();
 for(const day of month?.days||[])for(const item of day.recurring){
  const key=[item.uid,item.forUid,item.shift,item.sector].join(':');
  const fallback={...item,days:[],pending:0};
  const group=fixed.get(key)||fallback;
  group.days.push(short(day.date)); if(!item.available)group.pending++;
  fixed.set(key,group);
 }
 const scoped=(month?.days||[]).map(day=>{
  const shifts=day.shifts.filter(row=>(shift==='todos'||row.shift===shift)&&(sector==='todos'||row.sector===sector));
  return {...day,shifts,attention:shifts.some(row=>row.attention)};
 });
 const dates=scoped.filter(day=>mode==='all'||(mode==='sundays'?day.sunday:day.attention));
 const upcoming=scoped.filter(day=>day.date>=today);
 const confirmed=upcoming.filter(day=>day.shifts.some(row=>row.confirmedDeficit)).length;
 const uncertain=upcoming.filter(day=>day.shifts.some(row=>row.uncertain)).length;
 const extra=upcoming.reduce((n,day)=>n+day.shifts.reduce((sum,row)=>sum+row.extra,0),0);
 return <section className="ti-coverage-month" aria-label="Cobertura do mês">
  <div className="board-heading"><div><h2>Visão do mês · {plan.period.split('-').reverse().join('/')}</h2><p>{plan.status==='published'?'Escala publicada':'Escala em preparação'}</p></div>
   {today.startsWith(plan.period)&&<button className="action quiet" type="button" onClick={()=>choose(today)}>Ver hoje</button>}
  </div>
  {error?<p role="alert">{error} <button type="button" className="action quiet" onClick={()=>retry(value=>value+1)}>Tentar novamente</button></p>:
   !month?<p role="status" className="panel ti-cov-feedback">Conferindo os turnos do mês…</p>:<>
    <div className="panel roster-impact"><div><strong>{confirmed}</strong> dias com déficit confirmado a partir de hoje · <strong>{uncertain}</strong> com dados pendentes <span>·</span> <strong>{month.recurringFees}</strong> taxas fixas confirmadas na projeção mensal <span>·</span> {month.extra===null?'Extras a estimar após completar a escala':<><strong>{extra}</strong> vagas estimadas futuras (não são taxas)</>}</div></div>
    {alerts?.some(item=>item.planId===id)&&<div className="panel ti-cov-month-alerts"><h3>Alertas da gestão</h3>
     {alerts.filter(item=>item.planId===id).slice(0,5).map(item=><button key={item.id} className="action quiet" type="button" onClick={()=>onOpenAlert(item)}>
      {short(item.date)} · {labels[item.shift]} · {labels[item.sector]} · {item.reason}
     </button>)}
    </div>}
    <nav className="tabs ti-cov-month-filter" aria-label="Dias do mês">{Object.entries({sundays:'Domingos',attention:'Em atenção',all:'Todos os dias'}).map(([key,label])=>
     <button className="tab" type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</nav>
    <div className="ti-cov-month-dates">{dates.map(day=>{
     const risk=[...day.shifts].sort((a,b)=>(b.headcountGap+b.roleGap+b.skillGap)-(a.headcountGap+a.roleGap+a.skillGap)).find(item=>item.attention);
     return <article className={'day'+(selected===day.date?' active':'')} key={day.date}>
      <button type="button" className="day-title" aria-pressed={selected===day.date} onClick={()=>choose(day.date,risk?.shift,risk?.sector)}>
       <strong>{day.sunday?'Dom. ':day.holiday?'Feriado · ':''}{short(day.date)}{day.date<today?' · Histórico':''}</strong>{day.attention&&<span className="count">Em atenção</span>}
      </button>
      <div className="day-body"><small>{day.unplanned?'Sem lançamentos':risk?labels[risk.sector]+' · '+labels[risk.shift]+(risk.uncertain?' · Dados a confirmar':''):'Cobertura prevista'}</small>
       {day.recurringFees>0&&<small>{day.recurringFees} fixa(s) com taxa</small>}</div>
     </article>;
    })}</div>
    {!dates.length&&<p>Sem dias para este filtro.</p>}
    <details className="panel ti-cov-fixed-month"><summary>Coberturas fixas · {fixed.size}</summary>
     {fixed.size?[...fixed.entries()].map(([key,item])=><p key={key}><strong>{item.name}</strong> · {labels[item.shift]||'Turno a confirmar'} · {item.paid===true?'Com taxa':item.paid===false?'Sem taxa':'Taxa a definir'} · {item.days.join(', ')}{item.pending?' · '+item.pending+' a confirmar':''}</p>):<p>Nenhuma cobertura fixa prevista nesta escala.</p>}
    </details>
   </>}
 </section>;
}
