import {useUnitLive} from './useUnitLive.js';
import {investigationReasons} from '../server/operations/investigation-rules.js';
import React,{useEffect,useState} from 'react';
import {Search,ClipboardCheck,AlertTriangle,CheckCircle2,Clock3,ChevronDown} from 'lucide-react';
import './daily-inventory-v4.css';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
const fmt=n=>typeof n==='number'?n.toLocaleString('pt-BR',{maximumFractionDigits:3}):'—';
const date=x=>x?new Date(x).toLocaleString('pt-BR'):'—';
async function request(path,action,extra={}){
 if(!auth.currentUser)throw Error('Faça login novamente.');
 const token=await auth.currentUser.getIdToken();
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',
  Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await res.json();
 if(!res.ok)throw Error(data.message||'Erro ao carregar inventário.');
 return data;
}
export default function DailyInventory({membership}){
 const {notify}=useFeedback();
 const [products,setProducts]=useState([]),[productId,setProductId]=useState('');
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [todayCursor,setTodayCursor]=useState(null),[triage,setTriage]=useState('all');
 const [todayCounts,setTodayCounts]=useState([]),[todayCountComplete,setTodayCountComplete]=useState(true),[todayCountError,setTodayCountError]=useState('');
 const [closures,setClosures]=useState([]),[moreClosures,setMoreClosures]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [investigations,setInvestigations]=useState([]),[allocations,setAllocations]=useState([{reason:'unidentified',quantity:'',notes:''}]),[decisionNote,setDecisionNote]=useState('');
 const [revision,setRevision]=useState(0);
 useUnitLive(membership.unitId,()=>setRevision(x=>x+1));
 const isManager=['admin','manager','submanager'].includes(membership.role);
 useEffect(()=>{let active=true;request('/api/operations/stock','todayCounts').then(data=>{if(active){setTodayCounts(data.products||[]);setTodayCountComplete(!!data.complete);setTodayCursor(data.nextCursor||null)}}).catch(e=>{if(active)setTodayCountError(e.message)});return()=>{active=false}},[membership.unitId,revision]);
 const loadTodayMore=async()=>{if(busy||!todayCursor)return;setBusy(true);try{const d=await request('/api/operations/stock','todayCounts',{before:todayCursor});setTodayCounts(a=>[...a,...(d.products||[])]);setTodayCursor(d.nextCursor||null)}catch(e){setTodayCountError(e.message)}finally{setBusy(false)}};
 const [closureFilter,setClosureFilter]=useState('pending');
 const refreshClosures=async()=>{if(!isManager)return;const d=await request('/api/operations/stock','closeList');setClosures(d.closures||[]);setMoreClosures(!!d.hasMore)};
 const loadMoreClosures=async()=>{if(busy||!moreClosures||!closures.length)return;setBusy(true);try{const d=await request('/api/operations/stock','closeList',{before:closures.at(-1).submittedAt});setClosures(old=>[...old,...(d.closures||[])]);setMoreClosures(!!d.hasMore)}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 useEffect(()=>{if(isManager)refreshClosures().catch(e=>setError(e.message))},[membership.role,revision]);
 const decide=async(action,id,pid,reason='')=>{setBusy(true);setNotice('');try{const d=await request('/api/operations/stock',action,{productId:pid,requestId:id,reason});setNotice(d.message);notify(d.message,'success');await refreshClosures()}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 useEffect(()=>{
  let active=true;
  request('/api/products/manage','list').then(d=>{if(active)setProducts((d.products||[]).filter(p=>p.status==='active'))})
   .catch(e=>{if(active)setError(e.message)});
  return()=>{active=false};
 },[revision]);
 useEffect(()=>{setResult(null);setAllocations([{reason:'unidentified',quantity:'',notes:''}]);setDecisionNote('')},[productId]);
 useEffect(()=>{
  let active=true;setError('');
  if(!productId)return;
  if(!result)setLoading(true);
  request('/api/operations/stock','dailyReport',{productId})
   .then(d=>{if(active)setResult(d)})
   .catch(e=>{if(active)setError(e.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[productId,revision]);
 useEffect(()=>{let active=true;setInvestigations([]);if(productId)request('/api/operations/stock','investigationGet',{productId}).then(d=>{if(active)setInvestigations(d.investigations||[])}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[productId,revision]);
 const saveInvestigation=async action=>{if(busy)return;setBusy(true);try{const old=investigations.find(x=>x.countId===result?.report?.currentCountId);const d=await request('/api/operations/stock',action,{productId,allocations:allocations.map(x=>({...x,quantity:Number(x.quantity)})),expectedVersion:old?.version||0,note:decisionNote});setNotice(d.message);setRevision(x=>x+1)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const r=result?.report;
 const selectedClosures=closures.filter(x=>closureFilter==='all'||x.status===closureFilter);
 const pendingCount=closures.filter(x=>x.status==='pending').length;
 return <section className="receiving-page ti-inventory-v4">
  <p className="eyebrow">OPERAÇÃO · INVENTÁRIO · {membership.unitId.toUpperCase()}</p>
  <h1>Inventário inteligente</h1>
  <p>Investigue diferenças entre contagens físicas, entradas e saídas registradas. Esta análise não altera o estoque.</p>
  {isManager&&<section className="receiving-card ti-inventory-v4-summary" aria-labelledby="inventory-pending-title">
   <div className="ti-v4-inventory-heading"><ClipboardCheck size={21} aria-hidden="true"/><div><h2 id="inventory-pending-title">Fechamentos para conferência</h2><p>Registros submetidos à análise gerencial.</p></div><span className={pendingCount?'ti-inventory-v4-count pending':'ti-inventory-v4-count'}>{pendingCount} pendente(s)</span></div>
   <div className="ti-inventory-v4-filters" role="group" aria-label="Filtrar fechamentos">
    {[['pending','Pendentes'],['approved','Aprovados'],['rejected','Recusados'],['all','Todos']].map(([id,title])=><button key={id} type="button" className={closureFilter===id?'active':''} aria-pressed={closureFilter===id} onClick={()=>setClosureFilter(id)}>{title}</button>)}
   </div>
   {!selectedClosures.length?<p className="ti-inventory-v4-empty">Nenhum fechamento nesta situação.</p>:
    <div className="ti-inventory-v4-closure-list">{selectedClosures.map(x=><article key={x.id} className="ti-inventory-v4-closure">
     <div className="ti-inventory-v4-closure-main"><div><strong>{x.productName}</strong><span>{x.day} · {fmt(x.countedTotal)} {x.unit}</span></div><span className={'ti-inventory-v4-status '+(x.status==='pending'?'pending':x.status==='approved'?'approved':'rejected')}>{x.status==='pending'?'Pendente':x.status==='approved'?'Aprovado':'Recusado'}</span></div>
     <details><summary>Detalhes e ações <ChevronDown size={16} aria-hidden="true"/></summary><p>Solicitado em {date(x.submittedAt)}</p><p>Identificador da contagem: <code>{x.countId}</code></p>
      {x.status==='pending'&&<div className="receiving-actions"><button disabled={busy} type="button" onClick={()=>decide('closeApprove',x.countId,x.productId)}>Aprovar fechamento</button><button disabled={busy} type="button" onClick={()=>{const reason=window.prompt('Justificativa da recusa:');if(reason?.trim())decide('closeReject',x.countId,x.productId,reason.trim())}}>Recusar</button></div>}
     </details>
    </article>)}</div>}
   {moreClosures&&<button type="button" className="ti-inventory-v4-more" disabled={busy} onClick={loadMoreClosures}>Carregar fechamentos anteriores</button>}
  </section>}
  <section className="receiving-card ti-v4-inventory-today"><h2>Produtos contados hoje</h2><div className="ti-stock-filters">{[['all','Todos'],['investigate','Investigar'],['history','Histórico insuficiente'],['clear','Sem divergência'],['unavailable','Indisponível']].map(([key,label])=><button type="button" key={key} aria-pressed={triage===key} onClick={()=>setTriage(key)}>{label} · {todayCounts.filter(p=>key==='all'||p.state===key).length}</button>)}</div><p>Toque em um item para investigar as últimas contagens e movimentações. Os totais dos filtros referem-se aos produtos carregados.</p>{todayCountError&&<p role="alert">{todayCountError}</p>}{!todayCountComplete&&<p role="status">Não foi possível concluir a consulta. Atualize antes de avaliar os resultados.</p>}{!todayCounts.length?<p className="ti-inventory-v4-empty">Nenhuma contagem de hoje foi encontrada nesta consulta.</p>:<div className="ti-v4-today-list">{todayCounts.filter(p=>triage==='all'||p.state===triage).sort((a,b)=>({investigate:0,unavailable:1,history:2,clear:3}[a.state]??4)-({investigate:0,unavailable:1,history:2,clear:3}[b.state]??4)).map(p=><button type="button" key={p.productId} aria-pressed={productId===p.productId} onClick={()=>setProductId(p.productId)}><strong>{p.name}</strong><span>{({investigate:'Investigar',history:'Histórico insuficiente',clear:'Sem divergência identificada',unavailable:'Apuração indisponível'})[p.state]||'Consultar apuração'} · {date(p.at)}</span></button>)}</div>}{todayCursor&&<button type="button" disabled={busy} onClick={loadTodayMore}>Carregar mais produtos de hoje</button>}</section>
  <section className="receiving-card ti-inventory-v4-report" aria-labelledby="inventory-report-title">
   <div className="ti-v4-inventory-heading"><Search size={21} aria-hidden="true"/><div><h2 id="inventory-report-title">Investigar produto</h2><p>Consulte a apuração disponível para qualquer produto da unidade.</p></div></div>
   <label>Produto para investigar
    <select value={productId} onChange={e=>setProductId(e.target.value)}>
     <option value="">Selecione um produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </label>
   {!productId&&!loading&&<p className="ti-inventory-v4-empty">Selecione um produto para comparar suas últimas contagens. Os produtos contados hoje aparecem na lista acima.</p>}
   {loading&&<p role="status">Calculando a partir das contagens registradas…</p>}
   {error&&<p role="alert">{error}</p>}
   {result&&!r&&<p role="status" className="ti-inventory-v4-empty">{result.reason==='NO_COUNT'?'Este produto ainda não possui contagem física.':result.reason==='LIMITED_HISTORY'?'Histórico extenso: apuração bloqueada para evitar resultados incompletos.':'Não foi possível calcular com segurança. Verifique as unidades e o histórico.'}</p>}
   {r&&<div className="ti-inventory-v4-result">
    <div className="ti-inventory-v4-result-head"><div><h3>{r.productName}</h3><p>Atual: {date(r.currentAt)} · Anterior: {date(r.previousAt)}</p></div>
     {r.status==='NO_PREVIOUS_COUNT'?<span className="ti-inventory-v4-status pending"><Clock3 size={14}/> Histórico insuficiente</span>:r.divergence?<span className="ti-inventory-v4-status pending"><AlertTriangle size={14}/> Investigar</span>:<span className="ti-inventory-v4-status approved"><CheckCircle2 size={14}/> Sem divergência identificada</span>}
    </div>
    <div className="ti-inventory-v4-metrics">
     <div><span>Contagem atual</span><strong>{fmt(r.available)} {r.unit}</strong></div>
     <div><span>Contagem anterior</span><strong>{fmt(r.previousTotal)} {r.unit}</strong></div>
     <div><span>Entradas no período</span><strong>{fmt(r.entriesTotal)} {r.unit}</strong></div>
    </div>
    {r.status==='NO_PREVIOUS_COUNT'?<p>Primeira contagem: ainda não é possível estimar a saída física.</p>:<>
     <div className="ti-inventory-v4-metrics"><div><span>Saída física estimada</span><strong>{fmt(r.estimatedPhysicalExit)} {r.unit}</strong></div><div><span>Saídas registradas</span><strong>{fmt(r.recordedOutflows)} {r.unit}</strong></div><div><span>Variação física</span><strong>{fmt(r.variation)} {r.unit}</strong></div></div>
     {r.divergence&&<p role="alert" className="ti-inventory-v4-divergence">Diferença a investigar: <strong>{fmt(r.divergence.quantity)} {r.unit}</strong>. {r.divergence.kind==='POSITIVE_ADJUSTMENT'?'Aumento físico sem explicação nos registros.':'Diferença entre saída estimada e baixas registradas.'}</p>}
    </>}
    <p className="receiving-notice">Apuração informativa. Não comprova venda, perda ou desperdício, nem gera baixa ou aprovação automática.</p>
    {r.divergence&&<details className="ti-inventory-investigation"><summary>Investigar e justificar diferença</summary>
     <p>Distribua parte ou toda a diferença entre motivos. São declarações para revisão; nenhum lançamento de estoque será criado.</p>
     {allocations.map((line,index)=><div className="stock-action-form" key={index}><label>Motivo<select value={line.reason} onChange={e=>setAllocations(a=>a.map((x,i)=>i===index?{...x,reason:e.target.value}:x))}>{Object.entries(investigationReasons).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Quantidade ({r.unit})<input type="number" required min={r.unit==='un'?1:0.001} step={r.unit==='un'?1:0.001} value={line.quantity} onChange={e=>setAllocations(a=>a.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label><label>Justificativa e referência da evidência<textarea minLength={8} maxLength={400} value={line.notes} onChange={e=>setAllocations(a=>a.map((x,i)=>i===index?{...x,notes:e.target.value}:x))}/></label><button type="button" disabled={allocations.length===1} onClick={()=>setAllocations(a=>a.filter((_,i)=>i!==index))}>Remover motivo</button></div>)}
     <div className="receiving-actions"><button type="button" disabled={busy||allocations.length>=20} onClick={()=>setAllocations(a=>[...a,{reason:'unidentified',quantity:'',notes:''}])}>Adicionar motivo</button><button type="button" disabled={busy} onClick={()=>saveInvestigation('investigationSave')}>Salvar investigação</button></div>
     {investigations.map(item=><article key={item.id}><strong>{item.status==='approved'?'Aprovada':item.status==='rejected'?'Recusada':'Aguardando revisão'}</strong><p>{date(item.at)} · Saldo a explicar: {fmt(item.remaining)} {item.report?.unit}</p>{item.allocations.map((a,i)=><p key={i}>{investigationReasons[a.reason]} · {fmt(a.quantity)} {item.report?.unit} · {a.notes}</p>)}{item.versions?.length>0&&<details><summary>Revisões registradas · últimas {item.versions.length}</summary>{item.versions.map(v=><section key={v.version}><strong>v{v.version} · {date(v.at)}</strong>{v.allocations.map((a,i)=><p key={i}>{investigationReasons[a.reason]} · {fmt(a.quantity)} {v.report?.unit} · {a.notes}</p>)}</section>)}</details>}{isManager&&item.status==='pending'&&item.actorUid!==auth.currentUser?.uid&&item.countId===r.currentCountId&&<><label>Justificativa da decisão<textarea minLength={8} maxLength={400} value={decisionNote} onChange={e=>setDecisionNote(e.target.value)}/></label><div className="receiving-actions"><button type="button" disabled={busy||decisionNote.trim().length<8} onClick={()=>saveInvestigation('investigationApprove')}>Aprovar investigação</button><button type="button" disabled={busy||decisionNote.trim().length<8} onClick={()=>saveInvestigation('investigationReject')}>Recusar investigação</button></div></>}</article>)}
    </details>}
    {r.currentCountId&&<button type="button" disabled={busy} onClick={()=>decide('closeSubmit',r.currentCountId,productId)}>Solicitar fechamento desta contagem</button>}
   </div>}
  </section>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
