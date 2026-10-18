import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';import {monthDates} from '../server/schedules/rules.js';import {useFeedback} from './FeedbackProvider.jsx';import './operations-planning.css';
async function call(action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const r=await fetch('/api/operations/workflows',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'schedules',action,...extra})});
 const d=await r.json();if(!r.ok)throw Error([d.message,...(d.issues||[]).slice(0,5)].join(' · '));return d;
}
async function membersApi(){
 const token=await auth.currentUser?.getIdToken();const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'profiles'})});const d=await r.json();if(!r.ok)throw Error(d.message);return d.members||[];
}
const labels={draft:'Rascunho',in_review:'Em análise',approved:'Aprovada',published:'Publicada',work:'Trabalho',off:'Folga',leave:'Ausência',monthly_sunday:'Domingo mensal adicional'};
export default function SchedulePlanner({membership}){
 const {notify}=useFeedback(),[plans,setPlans]=useState([]),[people,setPeople]=useState([]),[selected,setSelected]=useState(''),[title,setTitle]=useState('Escala da equipe'),[period,setPeriod]=useState(new Date().toISOString().slice(0,7)),[entries,setEntries]=useState([]);
 const [uid,setUid]=useState(''),[date,setDate]=useState(''),[type,setType]=useState('work'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const allowed=['admin','manager'].includes(membership.role);
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const [p,m]=await Promise.all([call('list'),membersApi()]);setPlans(p.schedules||[]);setPeople(m.filter(x=>x.status==='active'))}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{refresh()},[refresh]);
 const chosen=plans.find(x=>x.id===selected);
 const dateSelected=date;
 const open=p=>{setSelected(p.id);setTitle(p.title);setPeriod(p.period);setEntries(p.entries||[]);setError('')};
 const reset=()=>{setSelected('');setTitle('Escala da equipe');setEntries([]);setError('')};
 const generate=()=>{
  if(!window.confirm('Preencher o mês com um modelo 6×1 para todos os colaboradores ativos? Lançamentos existentes deste rascunho serão substituídos. Revise conflitos antes de solicitar aprovação.'))return;
  const dates=monthDates(period);
  const sundays=dates.filter(d=>new Date(d+'T12:00:00Z').getUTCDay()===0);
  const generated=people.flatMap((person,index)=>dates.map(date=>{
   const day=new Date(date+'T12:00:00Z').getUTCDay();
   const fixedOff=(index%4)+1;
   return {uid:person.uid,date,type:day===0&&date===sundays[index%sundays.length]?'monthly_sunday':day===fixedOff?'off':'work'};
  }));
  setEntries(generated.sort((a,b)=>a.date.localeCompare(b.date)||a.uid.localeCompare(b.uid)));
  setError('Modelo preenchido. Confirme cobertura, folgas e colaboradores antes de enviar para análise.');
 };
 const add=e=>{e.preventDefault();if(!uid||!date||!date.startsWith(period))return setError('Selecione colaborador e data dentro do mês.');setError('');setEntries(old=>[...old.filter(x=>!(x.uid===uid&&x.date===date)),{uid,date,type}].sort((a,b)=>a.date.localeCompare(b.date)))};
 const save=async()=>{setBusy(true);try{const d=await call('saveDraft',{id:selected||undefined,period,title,entries});notify(d.message,'success');await refresh();setSelected(d.id)}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 const transition=async action=>{setBusy(true);try{const d=await call(action,{id:selected});notify(d.message,'success');await refresh()}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 if(!allowed)return <section className="ti-planning"><h1>Escalas</h1><p>Consulte suas escalas publicadas no Mural.</p></section>;
 return <section className="ti-planning"><p className="eyebrow">ADMINISTRAÇÃO · PACOTE 06</p><h1>Planejamento de escalas</h1><p>Crie o rascunho, revise conflitos, solicite aprovação e publique. Disponibilidade habitual não é escala oficial.</p>
 <div className="ti-planning-grid"><section className="ti-planning-card"><div className="ti-planning-heading"><h2>Escalas da unidade</h2><button onClick={refresh} disabled={busy||loading}>Atualizar</button></div>{loading?<p>Carregando...</p>:plans.length?plans.map(x=><button type="button" key={x.id} className={'ti-planning-row'+(selected===x.id?' selected':'')} onClick={()=>open(x)}><strong>{x.title}</strong><span>{x.period} · {labels[x.status]||x.status} · v{x.revision}</span></button>):<p>Nenhuma escala cadastrada.</p>}<button type="button" onClick={reset}>Nova escala</button></section>
 <section className="ti-planning-card"><h2>{selected?'Detalhes da escala':'Nova escala'}</h2><label>Título<input maxLength={100} minLength={3} required disabled={!!chosen&&chosen.status!=='draft'} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Mês de referência<input type="month" disabled={!!chosen&&chosen.status!=='draft'} value={period} onChange={e=>{setPeriod(e.target.value);setEntries([])}}/></label>
 {(!chosen||chosen.status==='draft')&&<form className="ti-planning-add" onSubmit={add}><label>Colaborador<select required value={uid} onChange={e=>setUid(e.target.value)}><option value="">Selecione</option>{people.map(p=><option key={p.uid} value={p.uid}>{p.name||p.email}</option>)}</select></label><label>Data<input required type="date" value={date} min={period+'-01'} max={period+'-31'} onChange={e=>setDate(e.target.value)}/></label><label>Atividade<select value={type} onChange={e=>setType(e.target.value)}><option value="work">Trabalho</option><option value="off">Folga</option><option value="leave">Ausência</option><option value="monthly_sunday">Domingo mensal adicional</option></select></label><button type="submit">Adicionar</button></form>}
 {(!chosen||chosen.status==='draft')&&<button type="button" disabled={busy||people.length===0} onClick={generate}>Gerar proposta mensal 6×1 para revisão</button>}
 <div className="ti-calendar-block" aria-label="Calendário mensal da escala"><div className="ti-calendar-heading"><h3>Calendário de {period}</h3><span>Clique em um dia para selecionar a data</span></div><div className="ti-calendar-grid">{monthDates(period).map(date=>{const day=new Date(date+'T12:00:00Z').getUTCDay();const records=entries.filter(e=>e.date===date);const offs=records.filter(e=>e.type==='off'||e.type==='monthly_sunday').length;return <button type="button" key={date} className={'ti-calendar-day'+(date===dateSelected?' active':'')+(offs?' has-off':'')} onClick={()=>setDate(date)} title={date+' · '+offs+' folgas'}><strong>{date.slice(-2)}</strong><small>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][day]}</small><span>{records.length} registros</span>{offs>0&&<em>{offs} folga(s)</em>}</button>})}</div></div>
 <div className="ti-planning-entries">{entries.length?entries.map((e,i)=><div key={e.date+e.uid}><span>{e.date} · {people.find(x=>x.uid===e.uid)?.name||e.uid} · {labels[e.type]}</span>{(!chosen||chosen.status==='draft')&&<button type="button" aria-label="Retirar lançamento" onClick={()=>setEntries(old=>old.filter((_,j)=>j!==i))}>Retirar</button>}</div>):<p>Nenhum turno ou folga incluído.</p>}</div>
 <div className="ti-planning-actions">{(!chosen||chosen.status==='draft')&&<button type="button" disabled={busy||entries.length===0} onClick={save}>Salvar rascunho</button>}{chosen?.status==='draft'&&<button disabled={busy} type="button" onClick={()=>transition('submit')}>Enviar para análise</button>}{chosen?.status==='in_review'&&membership.role==='admin'&&<button disabled={busy} type="button" onClick={()=>transition('approve')}>Aprovar escala</button>}{chosen?.status==='approved'&&membership.role==='admin'&&<button disabled={busy} type="button" onClick={()=>transition('publish')}>Publicar no Mural</button>}{chosen?.status==='published'&&<p role="status">Esta versão está publicada e não pode ser alterada.</p>}</div>
 </section></div>{error&&<p role="alert" className="team-error">{error}</p>}
 </section>;
}
