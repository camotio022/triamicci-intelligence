import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,ChevronDown,ClipboardCheck,Package,Search,Trash2} from 'lucide-react';
import {apiFetch} from './api-fetch.js';
import {auth} from './firebase.js';
import {useUnitLive} from './useUnitLive.js';
import {useFeedback} from './FeedbackProvider.jsx';
import {usesPhysicalLots} from '../server/operations/catalog-identity.js';
import {validQuantity} from '../server/operations/logic.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import {conferenceItem,timestamp,unitLabel} from './stock-conference-model.js';
import './stock-conference.css';
const areaName=area=>area==='giro'?'Giro':'Reserva';
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
const date=value=>timestamp(value)?.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})||'Sem registro';
async function request(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const res=await apiFetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Não foi possível concluir.');return data;
}
function roundSession(key){try{const value=sessionStorage.getItem(key);if(/^[a-f0-9-]{36}$/i.test(value||''))return value;}catch{}const id=crypto.randomUUID();try{sessionStorage.setItem(key,id)}catch{}return id;}
export default function StockConference(props){return <Conference key={auth.currentUser?.uid+':'+props.membership.unitId} {...props}/>;}
function Conference({membership,initialProductId=null}){
 const manager=['admin','manager','submanager'].includes(membership.role),{notify}=useFeedback();
 const today=restaurantDay(),sessionKey='ti:count-round:'+auth.currentUser?.uid+':'+membership.unitId+':'+today;
 const [sessionId,setSessionId]=useState(()=>roundSession(sessionKey)),[data,setData]=useState({products:[],signals:[],availability:[]});
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [area,setArea]=useState('giro'),[tab,setTab]=useState('today'),[filter,setFilter]=useState('attention'),[search,setSearch]=useState('');
 const [selected,setSelected]=useState(initialProductId||''),[value,setValue]=useState(''),[notes,setNotes]=useState(''),[rechecked,setRechecked]=useState(false);
 const [lots,setLots]=useState([]),[lotValues,setLotValues]=useState({}),[lotName,setLotName]=useState(''),[expiry,setExpiry]=useState(''),[lotsReady,setLotsReady]=useState(false);
 const [history,setHistory]=useState([]),[cursor,setCursor]=useState(null),[historyReady,setHistoryReady]=useState(false),[historyError,setHistoryError]=useState('');
 const [refresh,setRefresh]=useState(0),[quickMore,setQuickMore]=useState(false);
 const requestId=useRef(null),lock=useRef(false),mounted=useRef(true),loadVersion=useRef(0),heading=useRef(null),started=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;loadVersion.current++}},[]);
 const load=async()=>{const version=++loadVersion.current;try{const d=await request('v3Conference');if(mounted.current&&version===loadVersion.current){setData(d);setReady(true);setError('');}return true;}catch(e){if(mounted.current&&version===loadVersion.current)setError(e.message);return false;}};
 useUnitLive(membership.unitId,load,{domains:['stock','catalog'],refreshKey:'conference'});
 useEffect(()=>{setSessionId(roundSession(sessionKey));setSelected('');setValue('');},[sessionKey]);
 useEffect(()=>{if(initialProductId&&!started.current&&ready){const p=data.products.find(p=>p.id===initialProductId);if(p){started.current=true;setArea(p.profile?.locations?.includes('giro')?'giro':'reserva');setSelected(p.id);}}},[initialProductId,ready,data.products]);
 const products=data.products||[],items=products.map(p=>conferenceItem(p,area,data.signals,today));
 const countable=items.filter(i=>i.configured&&i.quantitative),due=countable.filter(i=>i.due),done=countable.filter(i=>i.checked);
 const visible=countable.filter(i=>(filter==='all'||(filter==='done'?i.checked:i.due))&&(!search||[i.product.name,i.product.profile?.displayName,...(i.product.profile?.aliases||[])].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))).sort((a,b)=>a.priority-b.priority||a.product.name.localeCompare(b.product.name,'pt-BR'));
 const product=products.find(p=>p.id===selected),item=product?conferenceItem(product,area,data.signals,today):null;
 const tracked=usesPhysicalLots(product),unit=item?.unit,whole=['un','porcao','pacote','duzia'].includes(unit);
 useEffect(()=>{setValue('');setNotes('');setRechecked(false);setLots([]);setLotValues({});setLotName('');setExpiry('');requestId.current=null;setLotsReady(false);if(!selected)return;heading.current?.focus();let alive=true;
  if(tracked)request('v3Lots',{productId:selected}).then(d=>{if(alive){setLots(d.lots||[]);setLotValues(Object.fromEntries((d.lots||[]).map(l=>[l.id,''])));setLotsReady(true)}}).catch(e=>{if(alive)setError(e.message)});else setLotsReady(true);
  return()=>{alive=false};
 },[selected,area,tracked,refresh]);
 const change=()=>{requestId.current=null;setRechecked(false);setMessage('');};
 const count=tracked&&lots.length?(Object.values(lotValues).every(v=>v!==''&&Number.isFinite(Number(v.replace(',','.'))))?Math.round(Object.values(lotValues).reduce((sum,v)=>sum+Number(v.replace(',','.')),0)*1000)/1000:null):value===''?null:Number(value.replace(',','.'));
 const prior=item?.compatible?product?.v3Balance?.[area]:null;
 const unusual=Number.isFinite(prior)&&prior>0&&count!==null&&(count===0||Math.abs(count-prior)>Math.max(5,prior*.5));
 const valid=count!==null&&validQuantity(count,{unit,allowZero:true})&&(!tracked||lotsReady&&(!lots.length||lots.every(l=>validQuantity(Number((lotValues[l.id]||'').replace(',','.')),{unit,allowZero:true})&&lotValues[l.id]!=='')));
 const open=id=>{setSelected(id);setError('');setMessage('');};
 const historyLoad=async(more=false)=>{try{const d=await request('v3LedgerHistory',more&&cursor?{cursor}:{});if(mounted.current){setHistory(old=>more?[...old,...(d.operations||[])]:d.operations||[]);setCursor(d.nextCursor||null);setHistoryReady(true);setHistoryError('');}}catch(e){if(mounted.current)setHistoryError(e.message);}};
 useEffect(()=>{if(tab==='history')historyLoad();},[tab]);
 const save=async e=>{e.preventDefault();if(lock.current||!valid||!manager||!item?.compatible||!item.quantitative)return;lock.current=true;setBusy(true);setError('');
  try{const id=requestId.current||crypto.randomUUID();requestId.current=id;
   await request('v3Count',{requestId:id,sessionId,productId:selected,location:area,quantity:count,notes:notes.trim(),lotCounts:lots.map(l=>({id:l.id,quantity:Number(lotValues[l.id].replace(',','.'))})),initialLot:tracked&&!lots.length&&count>0?{lot:lotName.trim(),expiryDate:expiry}:null});
   if(!mounted.current)return;requestId.current=null;
   const next=visible.find(i=>i.product.id!==selected&&!i.checked);setSelected(next?.product.id||'');setMessage(next?'Contagem salva. Próximo produto.':'Contagem salva. Você pode continuar na outra área.');await load();
  }catch(e){if(mounted.current){setError(e.message);notify(e.message,'error');}}finally{lock.current=false;if(mounted.current)setBusy(false);}
 };
 const availability=async(p,observation)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const d=await request('availabilityCheck',{requestId:crypto.randomUUID(),productId:p.id,location:area,observation});if(mounted.current){setMessage(d.message);await load();}}catch(e){if(mounted.current)setError(e.message)}finally{lock.current=false;if(mounted.current)setBusy(false)}};
 const quick=items.filter(i=>i.configured&&(quickMore||!i.quantitative||i.product.countFrequency==='on_demand')&&(!search||i.product.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))));
 const missing=products.filter(p=>!p.profile);
 return <section className="ti-conference" aria-busy={!ready||busy}>
  <header className="conference-heading">{selected&&<button type="button" className="conference-icon" aria-label="Voltar à conferência" disabled={busy} onClick={()=>setSelected('')}><ArrowLeft size={20}/></button>}<div><h1 ref={heading} tabIndex={-1}>{selected?'Contar no '+areaName(area):'Conferência de estoque'}</h1><p>{membership.unitId} · {today.split('-').reverse().join('/')}</p></div></header>
  {error&&<div className="conference-error" role="alert">{error}<button type="button" disabled={busy} onClick={()=>selected&&!lotsReady?setRefresh(v=>v+1):load()}>Tentar novamente</button></div>}
  {message&&<p className="conference-success" role="status"><CheckCircle2 size={17}/>{message}</p>}
  {!ready?<p role="status">Preparando sua conferência…</p>:selected&&product?<>
   <div className="conference-progress"><span>{done.length} de {countable.length} itens contados hoje no {areaName(area)}</span><progress max={Math.max(countable.length,1)} value={done.length} aria-label="Progresso da contagem"/></div>
   {!manager?<p className="conference-empty">A contagem que altera saldos é restrita à gestão. Use a conferência rápida para comunicar disponibilidade.</p>:!item?.quantitative||!item.compatible?<div role="alert" className="conference-empty">{item.reason}. A gestão deve revisar o cadastro antes de contar.</div>:<form onSubmit={save} className="conference-count-form"><fieldset disabled={busy} className="conference-controls">
    <section className="conference-card conference-main-count"><small>CONTAGEM FÍSICA · {areaName(area).toUpperCase()}</small><h2>{product.profile?.displayName||product.name}</h2><p>Conte o que encontrou neste local.</p>
     {product.portionWeight>0&&<span className="conference-badge">Padrão da porção: {fmt(product.portionWeight)} {product.weightUnit||'g'}</span>}
     {tracked&&lots.length>0?<fieldset className="conference-lots"><legend>Quantidade por lote ({unitLabel(unit)})</legend>{lots.map(l=><label key={l.id}>{l.lot} · vence {l.expiryDate}<input required inputMode={whole?'numeric':'decimal'} type="text" value={lotValues[l.id]??''} onChange={e=>{setLotValues(v=>({...v,[l.id]:e.target.value}));change()}}/></label>)}<strong>Total encontrado: {count===null?'—':fmt(count)} {unitLabel(unit)}</strong></fieldset>:<><label className="conference-quantity">Quantidade encontrada<div><input autoComplete="off" aria-label="Quantidade encontrada" required inputMode="none" value={value} onChange={e=>{setValue(e.target.value);change()}}/><span>{unitLabel(unit)}</span></div></label><button type="button" className="conference-zero" onClick={()=>{setValue('0');change()}}>Não há estoque · 0</button></>}
     {tracked&&!lotsReady&&<p role="status">Conferindo os lotes cadastrados…</p>}
     {tracked&&lotsReady&&!lots.length&&count>0&&<div className="conference-initial-lot"><p>Identifique o lote físico para preservar a validade.</p><label>Lote físico inicial<input required maxLength={80} value={lotName} onChange={e=>{setLotName(e.target.value);change()}}/></label><label>Validade do lote<input required type="date" min={today} value={expiry} onChange={e=>{setExpiry(e.target.value);change()}}/></label></div>}
    </section>
    <details className="conference-disclosure"><summary>Adicionar observação <ChevronDown size={16}/></summary><textarea aria-label="Observação da contagem" maxLength={240} rows={2} value={notes} onChange={e=>{setNotes(e.target.value);change()}}/></details>
    <details className="conference-disclosure"><summary>Consultar última conferência <ChevronDown size={16}/></summary><p>{item.last?date(item.last):'Nenhuma contagem registrada nesta área.'}</p>{item.last&&Number.isFinite(prior)&&<p>Saldo atual após movimentações: {fmt(prior)} {unitLabel(unit)}. Não é uma nova contagem.</p>}<p>Esta contagem atualiza somente o {areaName(area)}. Reserva e Giro precisam da mesma rodada para formar uma contagem conjunta.</p></details>
    {unusual&&<label className="conference-warning"><input type="checkbox" checked={rechecked} onChange={e=>setRechecked(e.target.checked)}/>A diferença é grande em relação ao saldo registrado. Recontei e confirmo a quantidade.</label>}
    {(!tracked||!lots.length)&&<div className="conference-keypad" role="group" aria-label="Teclado da contagem">{['1','2','3','4','5','6','7','8','9',...(whole?['0','back']:[',','0','back'])].map(k=><button key={k} type="button" aria-label={k==='back'?'Apagar último número':k===','?'Vírgula decimal':k} onClick={()=>{setValue(v=>k==='back'?v.slice(0,-1):k===','&&(v.includes(',')||v.includes('.'))?v:(v==='0'&&k!==','?k:v+k));change()}}>{k==='back'?<Trash2 size={19}/>:k}</button>)}</div>}
    <div className="conference-footer"><button className="conference-primary" type="submit" disabled={busy||!valid||!lotsReady||unusual&&!rechecked}>{busy?'Salvando…':'Confirmar e próximo'}<ArrowRight size={19}/></button><button type="button" disabled={busy} onClick={()=>{const next=visible.find(i=>i.product.id!==selected&&!i.checked);setSelected(next?.product.id||'');}}>Pular por enquanto</button></div>
   </fieldset></form>}
  </>:<>
   <nav className="conference-tabs" aria-label="Conferência e histórico">{[['today','Hoje'],['history','Histórico']].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>
   {tab==='history'?<section className="conference-history"><h2>Contagens registradas</h2><p>Registros por área, com data e responsável. Os registros anteriores permanecem preservados.</p>{historyError&&<p role="alert">{historyError}<button onClick={()=>historyLoad()}>Tentar novamente</button></p>}{!historyReady&&!historyError&&<p role="status">Carregando histórico…</p>}{history.filter(r=>r.kind==='count').map(r=><article className="conference-card" key={r.id}><strong>{r.productName||products.find(p=>p.id===r.productId)?.name||'Produto'}</strong><span>{fmt(r.quantity)} {unitLabel(r.unit)} · {areaName(r.location)}</span><small>{date(r.at)} · {r.actorName||r.actorUid||'Responsável não registrado'}</small><details><summary>Detalhes</summary><p>Rodada: {r.sessionId}</p><p>Registro: {r.id}</p>{r.notes&&<p>{r.notes}</p>}</details></article>)}{historyReady&&!history.some(r=>r.kind==='count')&&<p className="conference-empty">Nenhuma contagem nesta página de movimentações.</p>}{cursor&&<button disabled={busy} onClick={async()=>{setBusy(true);await historyLoad(true);setBusy(false)}}>Carregar anteriores</button>}</section>:<>
    <div className="conference-card conference-progress-card"><ClipboardCheck size={23}/><div><strong>{due.length?'Vamos conferir o '+areaName(area)+'?':'Conferência do '+areaName(area)}</strong><span>{done.length} de {countable.length} itens contados hoje</span><progress max={Math.max(countable.length,1)} value={done.length} aria-label="Progresso da contagem"/></div></div>
    <nav className="conference-areas" aria-label="Área de conferência">{['giro','reserva'].map(a=><button key={a} disabled={busy} aria-pressed={area===a} onClick={()=>{setArea(a);setMessage('')}}>{areaName(a)}</button>)}</nav>
    <label className="conference-search"><Search size={18}/><input type="search" placeholder="Buscar insumo" aria-label="Buscar insumo" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <nav className="conference-filters" aria-label="Filtrar produtos">{[['attention','Atenção',due.length],['all','Todos',countable.length],['done','Contados',done.length]].map(([id,label,n])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} <span>{n}</span></button>)}</nav>
    <section aria-label="Produtos para contar"><h2>{filter==='attention'?'Precisam de atenção':filter==='done'?'Contados hoje':'Produtos desta área'}</h2>{!visible.length?<p className="conference-empty">{filter==='attention'?'Nenhuma contagem pendente pela frequência cadastrada. Consulte Todos para contar outro item.':'Nenhum produto neste filtro.'}</p>:<div className="conference-list">{visible.map(i=><article key={i.product.id}><span className="conference-product-icon">{i.checked?<Check size={19}/>:<Package size={19}/>}</span><div><strong>{i.product.profile?.displayName||i.product.name}</strong><small>{unitLabel(i.unit)} · {i.reason}</small>{i.product.critical&&<span className="conference-critical">Crítico</span>}</div><button disabled={busy||!manager||!i.compatible} onClick={()=>open(i.product.id)}>{i.checked?'Recontar':'Contar'}</button></article>)}</div>}{!manager&&<p className="conference-help">A contagem oficial é feita pela gestão. Você pode conferir disponibilidade abaixo.</p>}</section>
    <section><div className="conference-section-heading"><h2>Conferência rápida</h2><button className="conference-link" onClick={()=>setQuickMore(v=>!v)}>{quickMore?'Recolher':'Ver todos'}</button></div><p className="conference-help">Disponibilidade não altera o saldo.</p>{!quick.length&&<p className="conference-empty">Nenhum item configurado para disponibilidade ou contagem sob demanda nesta área.</p>}{(quickMore?quick:quick.slice(0,3)).map(i=>{const check=data.availability?.find(c=>c.productId===i.product.id&&c.location===area);const checkedToday=timestamp(check?.at)&&restaurantDay(timestamp(check.at))===today;return <article key={i.product.id} className="conference-card conference-quick"><strong>{i.product.profile?.displayName||i.product.name}</strong><div>{[['available','Tem'],['low','Pouco'],['missing','Acabou']].map(([id,label])=><button key={id} disabled={busy} aria-pressed={!!checkedToday&&check.observation===id} onClick={()=>availability(i.product,id)}>{label}</button>)}</div>{check&&<small>{checkedToday?'Conferido hoje':'Última conferência'} · {date(check.at)} · {check.actorName||'Equipe'}</small>}{data.signals?.some(s=>s.productId===i.product.id&&s.location===area&&s.observation!=='available')&&<small>Há um aviso pendente para revisão da gestão.</small>}</article>})}</section>
    <details className="conference-disclosure"><summary>Como funciona a conferência? <ChevronDown size={16}/></summary><p>As sugestões seguem a frequência e os locais cadastrados para cada produto. Produtos críticos e avisos de falta aparecem primeiro. Campo vazio não é zero.</p><p>O saldo físico só muda ao confirmar uma contagem pela gestão. Cada área mantém data, responsável e rodada. Itens não contados não são confirmados automaticamente.</p>{missing.length>0&&<p>{missing.length} produto(s) precisam de configuração operacional na Administração antes de entrar nesta rotina.</p>}<button disabled={busy} type="button" onClick={()=>{const id=crypto.randomUUID();try{sessionStorage.setItem(sessionKey,id)}catch{}setSessionId(id);setMessage('Nova rodada iniciada. Conte as duas áreas nesta rodada para uma conferência conjunta.')}}>Iniciar nova rodada</button></details>
   </>}
  </>}
 </section>;
}
