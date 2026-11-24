import {requestJson} from './api-client.js';
import {MANAGEMENT_ROLES,isManagement} from '../server/permissions/v31-policy.js';
import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useState} from 'react';
import './coverage.css';
import OperationalCoverage,{CoveragePolicyForm,CoverageSettlement} from './OperationalCoverage.jsx';
const sectors={cozinha:'Cozinha',frente:'Frente',caixa:'Caixa',apoio:'Apoio',gestao:'Gestão'};
const roleNames={manager:'Gerente',submanager:'Subgerente',head_cook:'Cozinheiro-chefe',cook:'Cozinheiro',other:'Outros funcionários',external:'Convocado de fora'};
const money=n=>n==null?'Valor a definir':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
async function request(action,extra={}){
 return requestJson('/api/coverage/manage',{action,...extra},{sessionMessage:'Faça login novamente.',formatError:data=>[data.message,...(data.issues||[])].join(' · ')});
}
export default function CoverageConsole({membership,focus}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [requestNotes,setRequestNotes]=useState({});
 const [note,setNote]=useState(''),[consentEvidence,setConsentEvidence]=useState(''),[legalChecked,setLegalChecked]=useState(false),[consentVerified,setConsentVerified]=useState(false);
 const [payrollDays,setPayrollDays]=useState('');
 const [individual,setIndividual]=useState({});
 const [individualId,setIndividualId]=useState('');
 const [ratesEdit,setRatesEdit]=useState(null),[requirements,setRequirements]=useState([]),[newRequirement,setNewRequirement]=useState({sector:'cozinha',weekday:6,start:'12:00',end:'14:00',minimum:4,skill:''});
 const load=useCallback(async(silent=false)=>{try{const result=await request('dashboard');setData(result);if(!silent){setRatesEdit(result.rates);setIndividual(result.individualRates||{});setPayrollDays(result.payroll?.daysAfter??'');setRequirements(result.requirements||[]);}setError('')}catch(e){setError(e.message)}},[]);
 useUnitLive(membership?.unitId,initial=>load(!initial),{domains:['coverage','team','schedules'],refreshKey:membership.role});

 const run=async(fn)=>{setBusy(true);setError('');setNotice('');try{const d=await fn();setNotice(d.message);await load();return d}catch(e){setError(e.message)}finally{setBusy(false)}};
 if(!MANAGEMENT_ROLES.includes(membership.role))return <p>Somente a gerência consulta esta área.</p>;
 return <section className="ti-coverage">
 <OperationalCoverage focus={focus} data={data} request={request} run={run} busy={busy}/>
 {error&&<p role="alert" className="team-error">{error}</p>}{notice&&<p role="status" className="team-notice">{notice}</p>}
 <details className="ti-cov-panel ti-cov-secondary"><summary>Pendências e histórico</summary>
 <details className="ti-cov-panel"><summary>Solicitações da equipe</summary><p>Aprovar a solicitação não altera automaticamente a escala publicada.</p>{!(data?.staffRequests||[]).some(x=>x.status==='pending')?<p>Nenhuma solicitação aguardando decisão.</p>:(data.staffRequests||[]).filter(x=>x.status==='pending').map(item=><article key={item.id} className="ti-cov-result"><strong>{item.name} · {item.date} · {item.kind==='swap'?'Troca de turno':'Cobertura'}</strong><p>{item.reason}</p><label>Justificativa da decisão<textarea minLength={8} maxLength={500} value={requestNotes[item.id]||''} onChange={e=>setRequestNotes(old=>({...old,[item.id]:e.target.value}))}/></label><button type="button" disabled={busy||(requestNotes[item.id]||'').trim().length<8} onClick={()=>run(()=>request('decideStaffRequest',{requestId:item.id,decision:'approved',note:requestNotes[item.id].trim()}))}>Aprovar solicitação</button><button type="button" disabled={busy||(requestNotes[item.id]||'').trim().length<8} onClick={()=>run(()=>request('decideStaffRequest',{requestId:item.id,decision:'rejected',note:requestNotes[item.id].trim()}))}>Recusar</button></article>)}</details>
 <details className="ti-cov-panel"><summary>Convites, aprovações e pagamentos ({data?.proposals?.length||0})</summary><p>Para aprovar, confira jornada, intervalos, descanso, pagamento legal e aceite efetivo. O sistema registra a confirmação, mas não substitui o responsável pela folha.</p>
 <div className="ti-cov-fields"><label>Justificativa da decisão<textarea value={note} minLength={10} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="Informe a verificação e o motivo"/></label><div><label className="ti-cov-check"><input type="checkbox" checked={legalChecked} onChange={e=>setLegalChecked(e.target.checked)}/>Jornada e obrigações trabalhistas conferidas</label><label className="ti-cov-check"><input type="checkbox" checked={consentVerified} onChange={e=>setConsentVerified(e.target.checked)}/>Aceite do colaborador verificado</label><label>Registro da comprovação do aceite<textarea minLength={10} maxLength={500} value={consentEvidence} onChange={e=>setConsentEvidence(e.target.value)} placeholder="Ex.: confirmação presencial em data e horário específicos"/></label></div></div>
 {(data?.proposals||[]).length===0&&<p>Nenhuma proposta registrada.</p>}
 {(data?.proposals||[]).map(p=><article className="ti-cov-proposal" key={p.id}><div><strong>{p.name}</strong><span>{p.date} · {p.window?p.window.start+'–'+p.window.end:[p.first,p.second].filter(Boolean).map(slot=>slot.start+'–'+slot.end).join(' + ')}</span><span>{money(p.fee?.amount??p.practicePayment)} · {({pending_acceptance:'Aguardando resposta',pending_approval:'Aguardando aprovação',approved:'Aprovada',completed:'Realizada',paid:'Paga',rejected:'Recusada',declined:'Convite recusado',cancelled:'Cancelada'})[p.status]||p.status}</span><small>{p.reason}</small><CoverageSettlement proposal={p} busy={busy} run={run} request={request}/></div><div className="ti-cov-actions">{['pending_approval','pending_acceptance'].includes(p.status)&&<button disabled={busy||note.trim().length<10} type="button" onClick={()=>run(()=>request('decide',{id:p.id,decision:'rejected',note}))}>Recusar</button>}{p.status==='pending_approval'&&<button type="button" disabled={busy||note.trim().length<10||!legalChecked||!consentVerified||consentEvidence.trim().length<10} onClick={()=>run(()=>request('decide',{id:p.id,decision:'approved',note,legalChecked,consentVerified,consentEvidence}))}>Aprovar após conferência</button>}</div></article>)}
 </details>
 </details>
 <details className="ti-cov-panel ti-cov-secondary"><summary>Configurações da cobertura</summary>
 {isManagement(membership.role)&&data&&<details className="ti-cov-panel"><summary>Calendário, mínimos e coberturas fixas</summary><CoveragePolicyForm initial={data.operationalPolicy} people={data.people} busy={busy} save={policy=>run(()=>request('operationalPolicy',{policy}))}/></details>}
 {isManagement(membership.role)&&<details className="ti-cov-panel"><summary>Regras por horário e habilidade</summary><p>Defina o mínimo por setor, dia da semana e horário. A alteração não modifica escalas já publicadas.</p>
 <div className="ti-cov-fields">
  <label>Setor<select value={newRequirement.sector} onChange={e=>setNewRequirement(x=>({...x,sector:e.target.value}))}>{Object.entries(sectors).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <label>Dia<select value={newRequirement.weekday} onChange={e=>setNewRequirement(x=>({...x,weekday:Number(e.target.value)}))}>{['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((v,i)=><option key={i} value={i}>{v}</option>)}</select></label>
  <label>Das<input type="time" value={newRequirement.start} onChange={e=>setNewRequirement(x=>({...x,start:e.target.value}))}/></label>
  <label>Até<input type="time" value={newRequirement.end} onChange={e=>setNewRequirement(x=>({...x,end:e.target.value}))}/></label>
  <label>Mínimo<input type="number" min="1" max="30" value={newRequirement.minimum} onChange={e=>setNewRequirement(x=>({...x,minimum:Number(e.target.value)}))}/></label>
  <label>Habilidade obrigatória (opcional)<input value={newRequirement.skill} onChange={e=>setNewRequirement(x=>({...x,skill:e.target.value.toLowerCase()}))} placeholder="Ex.: chapa"/></label>
 </div>
 <button type="button" disabled={busy||newRequirement.end===newRequirement.start||newRequirement.minimum<1} onClick={()=>setRequirements(v=>[...v,newRequirement])}>Adicionar regra à lista</button>
 {requirements.map((x,i)=><article className="ti-cov-proposal" key={i}><span>{sectors[x.sector]} · {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][x.weekday]} {x.start}–{x.end} · mínimo {x.minimum} · {x.skill||'qualquer habilidade'}</span><button type="button" disabled={busy} onClick={()=>setRequirements(v=>v.filter((_,j)=>j!==i))}>Remover</button></article>)}
 <button type="button" disabled={busy||requirements.length>84} onClick={()=>run(()=>request('requirementsSet',{requirements}))}>Salvar regras da unidade</button>
 </details>}
 {isManagement(membership.role)&&ratesEdit&&<details className="ti-cov-panel"><summary>Regras de taxas e pagamento</summary><p>Não representa automaticamente o custo legal da dobra. Alterações só valem para novas propostas.</p><div className="ti-cov-fields">{Object.entries(roleNames).map(([key,label])=><label key={key}>{label}<input type="number" min="0" max="10000" value={ratesEdit[key]??0} onChange={e=>setRatesEdit(v=>({...v,[key]:Number(e.target.value)}))}/></label>)}</div><label>Dias corridos entre a cobertura e o pagamento<input type="number" min="0" max="90" value={payrollDays} onChange={e=>setPayrollDays(e.target.value)} placeholder="A definir"/></label><label>Exceção por colaborador<select value={individualId} onChange={event=>setIndividualId(event.target.value)}><option value="">Selecione uma pessoa</option>{data.people.filter(person=>person.status==='active').map(person=><option key={person.uid} value={person.uid}>{person.name}</option>)}</select></label>
 {individualId&&<div className="ti-cov-fields">{[['amount','Valor fixo por cobertura',10000],['daysAfter','Prazo individual em dias corridos',90]].map(([key,label,max])=>
  <label key={key}>{label}<input type="number" step={key==='amount'?0.01:1} min={0} max={max} value={individual[individualId]?.[key]??''}
   onChange={event=>{const value=event.target.value;setIndividual(old=>({...old,[individualId]:{...old[individualId],[key]:value===''?null:Number(value)}}));}} placeholder="Usar regra da unidade"/></label>)}</div>}
 <button type="button" disabled={busy} onClick={()=>run(()=>request('rates',{rates:ratesEdit,individualRates:individual,payroll:payrollDays===''?null:{daysAfter:Number(payrollDays)}}))}>Salvar tabela operacional</button></details>}
 </details>
 </section>;
}
