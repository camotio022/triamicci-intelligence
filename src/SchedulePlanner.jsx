import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {generateMonthlyRoster,weekdayOccurrences,weekdayOf,WEEKDAY_LABELS} from '../server/schedules/generator.js';
import {auth} from './firebase.js';import {monthDates} from '../server/schedules/rules.js';import {useFeedback} from './FeedbackProvider.jsx';import './operations-planning.css';
async function call(action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'schedules',action,...extra})});
 const d=await r.json();if(!r.ok)throw Error([d.message,...(d.issues||[]).slice(0,5)].join(' · '));return d;
}
async function membersApi(){
 const token=await auth.currentUser?.getIdToken();const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'profiles'})});const d=await r.json();if(!r.ok)throw Error(d.message);const staff=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'masterRegistryPreview'})});const sd=await staff.json();if(!staff.ok)throw Error(sd.message||'Cadastro Mestre indisponível.');return sd.activated?(sd.registry||[]).filter(p=>p.status==='active').map(p=>({uid:p.id,name:p.name,status:p.status,professional:{sector:p.sector,shift:p.shift,jobTitle:p.jobTitle,skills:p.skills||[],certifications:p.certifications||[]},fixedWeekday:p.fixedWeekday,registry:true})):d.members||[];
}
const labels={draft:'Rascunho',in_review:'Em análise',approved:'Aprovada',published:'Publicada',work:'Trabalho',off:'Folga',leave:'Ausência',monthly_sunday:'Domingo mensal adicional'};
export default function SchedulePlanner({membership}){
 const {notify}=useFeedback(),[plans,setPlans]=useState([]),[people,setPeople]=useState([]),[selected,setSelected]=useState(''),[title,setTitle]=useState('Escala da equipe'),[period,setPeriod]=useState(new Date().toISOString().slice(0,7)),[entries,setEntries]=useState([]);
 const [fixedOff,setFixedOff]=useState({}),[sundayOff,setSundayOff]=useState({}),[savingFixed,setSavingFixed]=useState(''),[selectedPerson,setSelectedPerson]=useState(''),[matrixSector,setMatrixSector]=useState('todos');
 const [uid,setUid]=useState(''),[date,setDate]=useState(''),[type,setType]=useState('work'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const allowed=['admin','manager'].includes(membership.role);
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const [p,m,f]=await Promise.all([call('list'),membersApi(),call('fixedOffList')]);setPlans(p.schedules||[]);setPeople(m.filter(x=>x.status==='active'));setFixedOff({...Object.fromEntries(m.filter(x=>x.registry&&x.fixedWeekday).map(x=>[x.uid,x.fixedWeekday])),...(f.fixedOffDays||{})})}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{refresh()},[refresh]);
 const chosen=plans.find(x=>x.id===selected);
 const dateSelected=date;
 const open=p=>{setSelected(p.id);setTitle(p.title);setPeriod(p.period);setEntries(p.entries||[]);setError('')};
 const reset=()=>{setSelected('');setTitle('Escala da equipe');setEntries([]);setError('')};
 const sundays=useMemo(()=>weekdayOccurrences(period,0),[period]);
 const filteredPeople=people.filter(p=>matrixSector==='todos'||p.professional?.sector===matrixSector);
 const saveFixed=async(person,value)=>{
  setSavingFixed(person.uid);try{
   if(person.registry){const token=await auth.currentUser.getIdToken();const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'masterRegistryUpdate',id:person.uid,changes:{fixedWeekday:Number(value)}})});const d=await r.json();if(!r.ok)throw Error(d.message)}else await call('fixedOffSet',{uid:person.uid,weekday:Number(value)});
   setFixedOff(old=>({...old,[person.uid]:Number(value)}));
   notify('Folga habitual de '+(person.name||person.email)+' atualizada.','success');
  }catch(e){setError(e.message);notify(e.message,'error')}finally{setSavingFixed('')}
 };
 const generate=()=>{
  if(entries.length&&!window.confirm('Gerar uma nova proposta substituirá os lançamentos deste rascunho. Continuar?'))return;
  try{
   const generated=generateMonthlyRoster({period,members:people,fixedOffDays:fixedOff,sundayOffDays:sundayOff});
   setEntries(generated);setError('Proposta gerada. Revise a cobertura por turno e setor antes de enviar para aprovação.');
  }catch(e){setError(e.message);notify(e.message,'error')}
 };
 const add=e=>{e.preventDefault();if(!uid||!date||!date.startsWith(period))return setError('Selecione colaborador e data dentro do mês.');setError('');setEntries(old=>[...old.filter(x=>!(x.uid===uid&&x.date===date)),{uid,date,type}].sort((a,b)=>a.date.localeCompare(b.date)))};
 const save=async()=>{setBusy(true);try{const d=await call('saveDraft',{id:selected||undefined,period,title,entries});notify(d.message,'success');await refresh();setSelected(d.id)}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 const transition=async action=>{setBusy(true);try{const d=await call(action,{id:selected});notify(d.message,'success');await refresh()}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 if(!allowed)return <section className="ti-planning"><h1>Escalas</h1><p>Consulte suas escalas publicadas no Mural.</p></section>;
 return <section className="ti-planning"><p className="eyebrow">ADMINISTRAÇÃO · PACOTE 06</p><h1>Planejamento de escalas</h1><p>Crie o rascunho, revise conflitos, solicite aprovação e publique. Disponibilidade habitual não é escala oficial.</p>
 <div className="ti-planning-grid"><section className="ti-planning-card"><div className="ti-planning-heading"><h2>Escalas da unidade</h2><button onClick={refresh} disabled={busy||loading}>Atualizar</button></div>{loading?<p>Carregando...</p>:plans.length?plans.map(x=><button type="button" key={x.id} className={'ti-planning-row'+(selected===x.id?' selected':'')} onClick={()=>open(x)}><strong>{x.title}</strong><span>{x.period} · {labels[x.status]||x.status} · v{x.revision}</span></button>):<p>Nenhuma escala cadastrada.</p>}<button type="button" onClick={reset}>Nova escala</button></section>
 <section className="ti-planning-card"><h2>{selected?'Detalhes da escala':'Nova escala'}</h2><label>Título<input maxLength={100} minLength={3} required disabled={!!chosen&&chosen.status!=='draft'} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Mês de referência<input type="month" disabled={!!chosen&&chosen.status!=='draft'} value={period} onChange={e=>{setPeriod(e.target.value);setEntries([])}}/></label>
 {(!chosen||chosen.status==='draft')&&<form className="ti-planning-add" onSubmit={add}><label>Colaborador<select required value={uid} onChange={e=>setUid(e.target.value)}><option value="">Selecione</option>{people.map(p=><option key={p.uid} value={p.uid}>{p.name||p.email}</option>)}</select></label><label>Data<input required type="date" value={date} min={period+'-01'} max={period+'-31'} onChange={e=>setDate(e.target.value)}/></label><label>Atividade<select value={type} onChange={e=>setType(e.target.value)}><option value="work">Trabalho</option><option value="off">Folga</option><option value="leave">Ausência</option><option value="monthly_sunday">Domingo mensal adicional</option></select></label><button type="submit">Adicionar</button></form>}
 {(!chosen||chosen.status==='draft')&&<button type="button" disabled={busy||people.length===0} onClick={generate}>Gerar mês com folgas fixas e domingos</button>}
 <section className="ti-planning-card" style={{marginTop:16}}>
 <h3>Folgas habituais e domingo do mês</h3>
 <p>Várias pessoas podem folgar no mesmo dia. O domingo é adicional à folga semanal. As configurações fixas são permanentes; os domingos desta proposta não alteram outros meses.</p>
 <div style={{display:'grid',gap:8}}>
 {people.map(person=><div key={person.uid} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border, #ddd)'}}>
 <span style={{minWidth:140}}>{person.name||person.email}</span>
 <label>Folga fixa <select aria-label={'Folga fixa de '+(person.name||person.email)} value={fixedOff[person.uid]||''} disabled={!!savingFixed||busy} onChange={e=>saveFixed(person,e.target.value)}>
 <option value="">Não cadastrada</option>{[1,2,3,4].map(d=><option key={d} value={d}>{['','Segunda','Terça','Quarta','Quinta'][d]}</option>)}</select></label>
 <label>Domingo adicional <select aria-label={'Domingo adicional de '+(person.name||person.email)} value={sundayOff[person.uid]||''} disabled={!!chosen&&chosen.status!=='draft'} onChange={e=>setSundayOff(old=>({...old,[person.uid]:e.target.value}))}><option value="">Selecionar</option>{sundays.map(d=><option key={d} value={d}>{d.split('-').reverse().join('/')}</option>)}</select></label>
 </div>)}
 </div>
 </section>
 <section className="ti-planning-card" style={{marginTop:16}}>
 <h3>Visão mensal da equipe</h3>
 <p>F = folga fixa; DM = domingo adicional; A = ausência; · = trabalho. Role horizontalmente para ver todos os dias.</p>
 <label>Filtrar setor <select value={matrixSector} onChange={e=>setMatrixSector(e.target.value)}><option value="todos">Todos</option><option value="cozinha">Cozinha</option><option value="frente">Frente</option><option value="caixa">Caixa</option><option value="apoio">Apoio</option><option value="gestao">Gestão</option></select></label>
 <div style={{overflowX:'auto',maxWidth:'100%'}}>
 <table style={{borderCollapse:'separate',borderSpacing:2,minWidth:Math.max(860,monthDates(period).length*30+150),fontSize:11}}>
 <thead><tr><th style={{position:'sticky',left:0,background:'var(--surface,#fff)',minWidth:140,textAlign:'left'}}>Funcionário</th>{monthDates(period).map(d=><th key={d} title={d} style={{minWidth:26,textAlign:'center'}}>{WEEKDAY_LABELS[weekdayOf(d)].slice(0,1)}<div>{Number(d.slice(-2))}</div></th>)}</tr></thead>
 <tbody>{filteredPeople.map(person=><tr key={person.uid}><th scope="row" style={{position:'sticky',left:0,textAlign:'left',background:'var(--surface,#fff)',maxWidth:145,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={person.name||person.email}>{person.name||person.email}</th>{monthDates(period).map(day=>{const kind=entries.find(e=>e.uid===person.uid&&e.date===day)?.type||(day===sundayOff[person.uid]?'monthly_sunday':weekdayOf(day)===fixedOff[person.uid]?'off':'work');const text=kind==='off'?'F':kind==='monthly_sunday'?'DM':kind==='leave'?'A':'·';return <td key={day} style={{textAlign:'center',padding:'7px 0',background:kind==='off'?'#F6D9CE':kind==='monthly_sunday'?'#D9EAFD':kind==='leave'?'#FDE68A':'transparent',color:['off','monthly_sunday'].includes(kind)?'#78350F':'inherit',fontWeight:text==='·'?400:700}} title={(person.name||person.email)+' · '+day+' · '+(labels[kind]||kind)}>{text}</td>})}</tr>)}</tbody>
 <tfoot><tr><th scope="row" style={{position:'sticky',left:0,background:'var(--surface,#fff)',textAlign:'left'}}>Total de folgas</th>{monthDates(period).map(day=><td key={day} style={{textAlign:'center',fontWeight:700}}>{filteredPeople.filter(person=>{const kind=entries.find(e=>e.uid===person.uid&&e.date===day)?.type||(day===sundayOff[person.uid]?'monthly_sunday':weekdayOf(day)===fixedOff[person.uid]?'off':'work');return kind==='off'||kind==='monthly_sunday'}).length}</td>)}</tr></tfoot>
 </table></div>
 </section>
 <div className="ti-calendar-block" aria-label="Calendário mensal da escala"><div className="ti-calendar-heading"><h3>Calendário de {period}</h3><span>Clique em um dia para selecionar a data</span></div><div className="ti-calendar-grid">{monthDates(period).map(date=>{const day=new Date(date+'T12:00:00Z').getUTCDay();const records=entries.filter(e=>e.date===date);const offs=records.filter(e=>e.type==='off'||e.type==='monthly_sunday').length;return <button type="button" key={date} className={'ti-calendar-day'+(date===dateSelected?' active':'')+(offs?' has-off':'')} onClick={()=>setDate(date)} title={date+' · '+offs+' folgas'}><strong>{date.slice(-2)}</strong><small>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][day]}</small><span>{records.length} registros</span>{offs>0&&<em>{offs} folga(s)</em>}</button>})}</div></div>
 <div className="ti-planning-entries">{entries.length?entries.map((e,i)=><div key={e.date+e.uid}><span>{e.date} · {people.find(x=>x.uid===e.uid)?.name||e.uid} · {labels[e.type]}</span>{(!chosen||chosen.status==='draft')&&<button type="button" aria-label="Retirar lançamento" onClick={()=>setEntries(old=>old.filter((_,j)=>j!==i))}>Retirar</button>}</div>):<p>Nenhum turno ou folga incluído.</p>}</div>
 <div className="ti-planning-actions">{(!chosen||chosen.status==='draft')&&<button type="button" disabled={busy||entries.length===0} onClick={save}>Salvar rascunho</button>}{chosen?.status==='draft'&&<button disabled={busy} type="button" onClick={()=>transition('submit')}>Enviar para análise</button>}{chosen?.status==='in_review'&&membership.role==='admin'&&<button disabled={busy} type="button" onClick={()=>transition('approve')}>Aprovar escala</button>}{chosen?.status==='approved'&&membership.role==='admin'&&<button disabled={busy} type="button" onClick={()=>transition('publish')}>Publicar no Mural</button>}{chosen?.status==='published'&&<p role="status">Esta versão está publicada e não pode ser alterada.</p>}</div>
 </section></div>{error&&<p role="alert" className="team-error">{error}</p>}
 </section>;
}
