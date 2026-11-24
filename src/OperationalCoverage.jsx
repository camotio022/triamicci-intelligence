import React,{useState} from 'react';
import {wholeTurnAssignment} from '../server/coverage/operational.js';
import {monthDates} from '../server/schedules/rules.js';
import {restaurantDay} from '../shared/operation-day.js';

export const feeMoney=value=>value==null?'Valor a definir':value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const shortDate=date=>date?.split('-').reverse().join('/')||'Data a definir';
const shifts={manha:'Manhã',noite:'Noite'};
const sectors={cozinha:'Cozinha',frente:'Frente'};

export default function OperationalCoverage({data,request,run,busy,focus}){
 const [planId,setPlanId]=useState(focus?.planId||''),[chosenDate,setDate]=useState(focus?.date||''),[sector,setSector]=useState('cozinha'),[shift,setShift]=useState('noite');
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [coveredStart,setCoveredStart]=useState(false);
 const [staffId,setStaffId]=useState(''),[reason,setReason]=useState('');
 const plan=data?.plans.find(item=>item.id===planId)||data?.plans[0];
 const period=plan?.period;
 const date=chosenDate.startsWith(period+'-')?chosenDate:period===restaurantDay().slice(0,7)?restaurantDay():period?period+'-01':'';
 const current=result?.planId===plan?.id&&result?.date===date?result:null;
 const row=current?.evaluation.shifts.find(item=>item.sector===sector&&item.shift===shift);
 const context=current?.context;
 const clearCandidate=()=>{setReason('');setStaffId('');setCoveredStart(false);};
 const select=(setter,value)=>{setter(value);clearCandidate();setError('');};
 const evaluate=async event=>{
  event.preventDefault();setLoading(true);setError('');clearCandidate();
  try{setResult({...await request('assessShift',{planId:plan.id,date,sector,shift}),planId:plan.id,date});}
  catch(e){setError(e.message);setResult(null);}
  finally{setLoading(false);}
 };
 return <section className="ti-cov-panel ti-cov-board">
  <div><h2>Cobertura inteligente</h2><p>Veja quem está previsto para o turno e quais alternativas a gestão pode avaliar.</p></div>
  <form className="ti-cov-filter" onSubmit={evaluate}>
   <label>Escala<select value={plan?.id||''} onChange={e=>select(setPlanId,e.target.value)}>
    {!plan&&<option value="">Nenhuma escala disponível</option>}
    {(data?.plans||[]).map(item=><option value={item.id} key={item.id}>{item.title} · {item.period} · {item.status==='published'?'Publicada':'Em preparação'}</option>)}
   </select></label>
   <label>Data<input type="date" required value={date} min={period?period+'-01':undefined} max={period?monthDates(period).at(-1):undefined} onChange={e=>select(setDate,e.target.value)}/></label>
   <button type="submit" disabled={!plan||!date||loading||busy}>{loading?'Avaliando…':'Avaliar situação'}</button>
  </form>
  {error&&<p className="team-error" role="alert">{error}</p>}
  <div className="ti-cov-segments" role="group" aria-label="Turno">{Object.entries(shifts).map(([id,label])=><button key={id} type="button" aria-pressed={id===shift} onClick={()=>select(setShift,id)}>{label}</button>)}</div>
  {row&&<>
   <div className="ti-cov-cards">{Object.entries(sectors).map(([id,label])=>{
    const item=current.evaluation.shifts.find(x=>x.sector===id&&x.shift===shift);
    return <button key={id} type="button" aria-pressed={id===sector} onClick={()=>select(setSector,id)}>
     <strong>{label}</strong><span>{item.minimum==null?item.count+' com horário cadastrado':item.count+' de '+item.minimum+' com horário cadastrado'}</span>
    </button>;
   })}</div>
   <article className="ti-cov-explanation">
    <div className="ti-cov-row"><h3>{sectors[sector]} · {shifts[shift]}</h3><small>{row.window?row.window.start+'–'+row.window.end:'Horário do turno a confirmar'}</small></div>
    <p>{row.reasons.length?row.reasons.join(' '):'A projeção atende às regras verificadas para este turno.'}</p>
    <details><summary>Quem está na escala</summary>
     {row.people.length?row.people.map(person=><p key={person.uid}>{person.name} · {person.jobTitle||'Função a confirmar'} · {person.hours?person.hours.start+'–'+person.hours.end:'Horário pendente'}</p>):<p>Nenhuma pessoa prevista neste setor e turno.</p>}
     {current.evaluation.recurring.filter(item=>item.sector===sector&&item.shift===shift).map(item=><p key={item.uid+item.forUid}>{item.name} · {item.available?'Cobertura fixa prevista':'Cobertura fixa a confirmar'}</p>)}
    </details>
    <details><summary>Dados usados na avaliação</summary>
     <p>{current.evaluation.holiday?'Feriado cadastrado · jornada de domingo.':current.evaluation.busyDay?'Dia de movimento pelo calendário configurado.':'Dia comum no calendário configurado.'} {context.demand.note}</p>
     <p>Produção · {context.production.tasks.length}{context.production.hasMore?'+':''} tarefas registradas. {context.production.note}</p>
     <p>Estoque · {context.stock.low.length} itens abaixo do mínimo na amostra e {context.stock.unknown} sem contagem compatível.</p>
     <p>Compras · {context.purchases.records.length}{context.purchases.partial?'+':''} registros consultados. {context.purchases.note}</p>
     <p>Recebimento · {context.receiving.records.length}{context.receiving.partial?'+':''} conferências na amostra. {context.receiving.note}</p>
     {current.evaluation.intervals.filter(item=>item.deficit&&(item.sector===sector||sector==='frente'&&['caixa','apoio','gestao'].includes(item.sector))).map((item,i)=><p key={i}>{item.skill||item.sector} · {item.start}–{item.end} · {item.covered}/{item.minimum} previstos pela regra cadastrada</p>)}
    </details>
   </article>
   <section className="ti-cov-options">
    <h3>O que dá para fazer</h3>
    <details open>
     <summary>Opções para revisar antes de gerar taxa</summary>
     {sector==='frente'?<p>Na operação com caixa único, mantenha a pessoa do caixa nas comandas. Se chope e iFood coincidirem, confira se adiantar a reposição libera alguém para o balcão e deixa o apoio do meio revezar com a vitrine.</p>:<p>Confira se é possível preparar a bancada e adiantar a produção e a louça para liberar ajuda na montagem durante o pico, mantendo a chapa coberta.</p>}
     {plan.status==='draft'&&<p>Para trocar um domingo, compare as duas datas no Quadro de folgas antes de alterar o rascunho.</p>}
    </details>
    {(row.shortage>0||current.evaluation.intervals.some(item=>item.sector===sector&&item.deficit))&&<>
     <h3>Possíveis reforços para o turno inteiro</h3>
     {!row.candidates.length&&<p>Sem indicação interna com os dados atuais. Revise os cadastros e a possibilidade de apoio externo.</p>}
     {row.candidates.map(person=>{
      const assignment=wholeTurnAssignment(row,person);
      return <article className="ti-cov-candidate" key={person.uid}>
       <div className="ti-cov-row"><div><strong>{person.name}</strong><p>{person.jobTitle} · {person.scheduled?'Já está na escala':'Fora da escala · disponibilidade a confirmar'}</p></div>
       {assignment&&date>=restaurantDay()&&<button type="button" onClick={()=>{setStaffId(person.uid);setReason(row.reasons[0]||'Reforço para cumprir o mínimo cadastrado no turno.');}}>Revisar convite</button>}</div>
       {staffId===person.uid&&assignment&&<div className="ti-cov-invite">
        <p>Turno a cobrir {row.window.start}–{row.window.end}. {assignment.first&&<>Jornada normal {assignment.first.start}–{assignment.first.end}. Confira quem cobre o início até {assignment.second.start}. </>}Período de cobertura adicional {assignment.second.start}–{assignment.second.end}.</p>
        <p>Estimativa da taxa · {feeMoney(data.individualRates?.[person.uid]?.amount??data.configuredRates?.[person.rateRole])}</p>
        {assignment.first&&<label className="ti-cov-check"><input type="checkbox" checked={coveredStart} onChange={e=>setCoveredStart(e.target.checked)}/>Confirmei a cobertura do início do turno</label>}
        <label>Motivo para o convite<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button type="button" disabled={busy||reason.trim().length<10||!!assignment.first&&!coveredStart} onClick={async()=>{const response=await run(()=>request('inviteShift',{planId:plan.id,date,sector,shift,staffId,reason,coveredStart}));if(response)clearCandidate();}}>Enviar convite</button>
       </div>}
      </article>;
     })}
    </>}
   </section>
  </>}
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
 return <details>
  <summary>{completing?'Registrar realização':'Registrar pagamento'}</summary>
  <form className="ti-cov-policy" onSubmit={e=>{e.preventDefault();run(()=>request(completing?'completeCoverage':'payCoverage',completing?{id:proposal.id,actualStart:start,actualEnd:end}:{id:proposal.id,paidDate}));}}>
   {completing?<div className="ti-cov-fields"><label>Início efetivo da taxa<input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Fim efetivo da taxa<input type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div>:
    <><p>{feeMoney(proposal.fee?.amount)} · previsão {shortDate(proposal.fee?.dueDate)}</p><label>Pago em<input type="date" required value={paidDate} min={proposal.date} max={restaurantDay()} onChange={e=>setPaidDate(e.target.value)}/></label></>}
   <button type="submit" disabled={busy||(completing?proposal.date>restaurantDay():proposal.fee?.amount==null)}>{completing?'Confirmar turno realizado':'Confirmar pagamento'}</button>
  </form>
 </details>;
}
