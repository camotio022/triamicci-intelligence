import React,{useState} from 'react';
import {reviewCoverageAssignment,wholeTurnAssignment} from '../server/coverage/operational.js';
import {monthDates} from '../server/schedules/rules.js';
import {restaurantDay} from '../shared/operation-day.js';

export const feeMoney=value=>value==null?'Valor a definir':value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const shortDate=date=>date?.split('-').reverse().join('/')||'Data a definir';
const shifts={manha:'Manhã',noite:'Noite'};
const sectors={cozinha:'Cozinha',frente:'Frente'};

const hours=window=>window?window.start+'–'+window.end:'Horário a confirmar';
const candidateName=person=>person.name+' · '+(person.jobTitle||'Função a confirmar');

function coverageMessage(row, intervals, suggestion) {
 const scheduled=row.people.map(person=>person.name+(person.hours?'':' (horário a confirmar)'));
 const staffing=scheduled.length?'Na escala: '+scheduled.join(', ')+'.':'O turno está sem pessoas na escala.';
 const deficit=row.headcountGap
  ? (row.headcountGap===1?'Falta uma pessoa':'Faltam '+row.headcountGap+' pessoas')+' para chegar ao mínimo de '+row.minimum+'.'
  : '';
 const role=row.roleGap?(row.sector==='cozinha'?'Falta confirmar um cozinheiro.':'Falta confirmar gerente ou subgerente.'):'';
 const firstGap=intervals[0];
 const station=firstGap?'Das '+firstGap.start+' às '+firstGap.end+', '+(firstGap.skill||firstGap.sector)+' está abaixo do mínimo ('+firstGap.covered+' de '+firstGap.minimum+').':row.skillGap?'A montagem tem '+row.skillCount+' de 3 pessoas que podem atuar ao mesmo tempo.':'';
 const next=suggestion
  ? suggestion.name+(suggestion.scheduled?' já trabalha nesse dia.':' está fora da escala nesse dia.')+' Revise a cobertura de '+hours(row.coverageWindow)+'.'
  : row.shortage||firstGap?'Revise os horários e as opções de cobertura.':'';
 return [staffing,deficit,role,station,next].filter(Boolean).join(' ');
}

function CoverageCard({row, evaluation, data, date, plan, request, run, busy}) {
 const [staffId,setStaffId]=useState('');
 const [reason,setReason]=useState('');
 const [more,setMore]=useState(false);
 const recurring=evaluation.recurring.filter(item=>item.sector===row.sector&&item.shift===row.shift);
 const intervals=evaluation.intervals.filter(item=>item.deficit&&(item.sector===row.sector||
  row.sector==='frente'&&['caixa','apoio','gestao'].includes(item.sector)));
 const needsHelp=Boolean(row.shortage||intervals.length||recurring.some(item=>!item.available));
 const candidates=row.candidates.map(person=>({person,assignment:wholeTurnAssignment(row,person)}));
 const suggestion=candidates.find(({person,assignment})=>assignment&&person.fitsRole)?.person;
 const message=coverageMessage(row,intervals,needsHelp?suggestion:null);
 const selected=candidates.find(({person})=>person.uid===staffId);
 const choose=person=>{
  setStaffId(person.uid===staffId?'':person.uid);
  setReason(message.slice(0,500));
 };
 const canReview=date>=restaurantDay();
 const fixed=selected&&recurring.find(item=>item.uid===selected.person.uid);
 const estimate=selected&&(data.individualRates?.[staffId]?.amount??data.configuredRates?.[selected.person.rateRole]);
 const review=selected?.assignment?.first&&reviewCoverageAssignment(selected.assignment);
 const inspect=person=>person.scheduled?'Revisar dobra de '+person.name:'Revisar convite de '+person.name;
 return <article className="ti-cov-card" data-attention={needsHelp||row.uncertain}>
  <header className="ti-cov-row">
   <div><h2>{sectors[row.sector]} · {shifts[row.shift]}</h2><small>Cobertura {hours(row.coverageWindow)}</small></div>
   <strong className="ti-cov-count">{row.minimum==null?row.count+' com horário':row.count+' de '+row.minimum+' com horário'}</strong>
  </header>
  <p>{message}</p>
  {row.people.length>0&&<ul className="ti-cov-team" aria-label="Quem está na escala">
   {row.people.map(person=><li key={person.uid}><strong>{candidateName(person)}</strong><small>{hours(person.hours)}</small></li>)}
  </ul>}
  {recurring.map(item=><p className="ti-cov-fixed" key={item.uid+':'+item.forUid}><strong>{item.name}</strong> · {item.available?'Cobertura fixa prevista':'Cobertura habitual a confirmar'} · {item.paid==null?'Taxa a definir':item.paid?'Cobertura remunerada':'Sem taxa fixa'}</p>)}
  {row.uncertain&&<p className="ti-cov-pending">Há horários ou regras pendentes de confirmação.</p>}
  {needsHelp&&<>
   {suggestion&&canReview&&<button type="button" onClick={()=>choose(suggestion)}>{staffId===suggestion.uid?'Fechar revisão':inspect(suggestion)}</button>}
   {candidates.some(({person})=>person.uid!==suggestion?.uid)&&<button className="ti-cov-quiet" type="button" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'Ocultar outras opções':'Outras opções'}</button>}
   {more&&<ul className="ti-cov-team" aria-label="Outras opções de reforço">
    {candidates.filter(({person})=>person.uid!==suggestion?.uid).map(({person,assignment})=><li key={person.uid}>
     <span><strong>{candidateName(person)}</strong><small>{!assignment?'Jornada incompatível ou pendente':!person.fitsRole?'Apoio adicional, sem resolver a falta desse cargo':person.scheduled?'Já trabalha nesse dia':'Disponibilidade a confirmar'}</small></span>
     {assignment&&canReview&&<button className="ti-cov-quiet" type="button" onClick={()=>choose(person)}>Revisar</button>}
    </li>)}
   </ul>}
  </>}
  {needsHelp&&selected?.assignment&&<div className="ti-cov-invite">
   <strong>Convite para {selected.person.name}</strong>
   <p>Cobertura integral {hours(selected.assignment.second)}.{selected.assignment.first?' Jornada habitual '+hours(selected.assignment.first)+'.':''}</p>
   <p>{fixed?.paid===false?'Cobertura fixa sem taxa.':fixed&&fixed.paid==null?'Taxa fixa a definir.':'Estimativa da taxa · '+feeMoney(estimate)}</p>
   {review?.state==='blocked'&&<p role="status">A jornada combinada precisa ser revista antes do convite. {review.reasons[0]}.</p>}
   <label>Motivo para o convite<textarea maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button type="button" disabled={busy||review?.state==='blocked'||reason.trim().length<10} onClick={async()=>{
    const response=await run(()=>request('inviteShift',{planId:plan.id,date,sector:row.sector,shift:row.shift,staffId,reason}));
    if(response){setStaffId('');setReason('');}
   }}>Enviar convite</button>
  </div>}
  {(row.reasons.length>0||intervals.length>0)&&<details>
   <summary>Detalhes da avaliação</summary>
   {row.reasons.map((line,index)=><p key={index}>{line}</p>)}
   {intervals.map((item,index)=><p key={index}>{item.skill||item.sector} · {item.start}–{item.end} · {item.covered} de {item.minimum}</p>)}
  </details>}
 </article>;
}

export default function OperationalCoverage({data,request,run,busy,focus}) {
 const [planId,setPlanId]=useState(focus?.planId||'');
 const [chosenDate,setDate]=useState(focus?.date||'');
 const [shift,setShift]=useState('noite');
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const plan=data?.plans.find(item=>item.id===planId)||data?.plans[0];
 const period=plan?.period;
 const today=restaurantDay();
 const date=chosenDate.startsWith(period+'-')?chosenDate:period===today.slice(0,7)?today:period?period+'-01':'';
 const current=result?.planId===plan?.id&&result?.date===date?result:null;
 const evaluate=async event=>{
  event.preventDefault();
  setLoading(true);setError('');setResult(null);
  try{setResult({...await request('assessShift',{planId:plan.id,date,sector:'cozinha',shift}),planId:plan.id,date});}
  catch(e){setError(e.message);}
  finally{setLoading(false);}
 };
 return <section className="ti-cov-panel ti-cov-board">
  <h1>Cobertura</h1>
  <form className="ti-cov-filter" onSubmit={evaluate}>
   <label>Escala<select value={plan?.id||''} onChange={event=>{setPlanId(event.target.value);setError('');}}>
    {!plan&&<option value="">{data?'Nenhuma escala disponível':'Carregando escalas…'}</option>}
    {(data?.plans||[]).map(item=><option value={item.id} key={item.id}>{item.title} · {item.period} · {item.status==='published'?'Publicada':'Em preparação'}</option>)}
   </select></label>
   <label>Data<input type="date" required value={date} min={period?period+'-01':undefined} max={period?monthDates(period).at(-1):undefined} onChange={event=>{setDate(event.target.value);setError('');}}/></label>
   <div className="ti-cov-segments" role="group" aria-label="Turno">
    {Object.entries(shifts).map(([id,label])=><button type="button" key={id} aria-pressed={id===shift} onClick={()=>setShift(id)}>{label}</button>)}
   </div>
   <button type="submit" disabled={!plan||!date||loading||busy}>{loading?'Avaliando…':'Avaliar situação'}</button>
  </form>
  {error&&<p className="team-error" role="alert">{error}</p>}
  {current&&<div className="ti-cov-cards" aria-label="Cobertura por setor">
   {current.evaluation.shifts.filter(row=>row.shift===shift).map(row=><CoverageCard key={plan.id+':'+date+':'+shift+':'+row.sector}
    row={row} evaluation={current.evaluation} data={data} date={date} plan={plan} request={request} run={run} busy={busy}/>)}
  </div>}
  {current?.context&&<details className="ti-cov-data">
   <summary>Dados consultados</summary>
   <p>{current.evaluation.busyDay||current.evaluation.strongPeak?'Dia de movimento pelo calendário configurado.':'Dia comum no calendário configurado.'} {current.context.demand.note}</p>
   <p>Produção · {current.context.production.tasks.length}{current.context.production.hasMore?'+':''} tarefas. {current.context.production.note}</p>
   <p>Estoque · {current.context.stock.low.length} abaixo do mínimo na amostra e {current.context.stock.unknown} sem contagem compatível.</p>
   <p>Compras · {current.context.purchases.records.length} registros. {current.context.purchases.note}</p>
   <p>Recebimento · {current.context.receiving.records.length}{current.context.receiving.partial?'+':''} conferências na amostra. {current.context.receiving.note}</p>
  </details>}
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
