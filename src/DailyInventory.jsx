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
 const [todayCounts,setTodayCounts]=useState([]),[todayCountComplete,setTodayCountComplete]=useState(true),[todayCountError,setTodayCountError]=useState('');
 const [closures,setClosures]=useState([]),[moreClosures,setMoreClosures]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const isManager=['admin','manager'].includes(membership.role);
 useEffect(()=>{let active=true;request('/api/operations/inventory-today','todayCounts').then(data=>{if(active){setTodayCounts(data.products||[]);setTodayCountComplete(!!data.complete)}}).catch(e=>{if(active)setTodayCountError(e.message)});return()=>{active=false}},[membership.unitId]);
 const [closureFilter,setClosureFilter]=useState('pending');
 const refreshClosures=async()=>{if(!isManager)return;const d=await request('/api/operations/stock','closeList');setClosures(d.closures||[]);setMoreClosures(!!d.hasMore)};
 const loadMoreClosures=async()=>{if(busy||!moreClosures||!closures.length)return;setBusy(true);try{const d=await request('/api/operations/stock','closeList',{before:closures.at(-1).submittedAt});setClosures(old=>[...old,...(d.closures||[])]);setMoreClosures(!!d.hasMore)}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 useEffect(()=>{if(isManager)refreshClosures().catch(e=>setError(e.message))},[membership.role]);
 const decide=async(action,id,pid,reason='')=>{setBusy(true);setNotice('');try{const d=await request('/api/operations/stock',action,{productId:pid,requestId:id,reason});setNotice(d.message);notify(d.message,'success');await refreshClosures()}catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}};
 useEffect(()=>{
  let active=true;
  request('/api/products/manage','list').then(d=>{if(active)setProducts((d.products||[]).filter(p=>p.status==='active'))})
   .catch(e=>{if(active)setError(e.message)});
  return()=>{active=false};
 },[]);
 useEffect(()=>{
  let active=true;setResult(null);setError('');
  if(!productId)return;
  setLoading(true);
  request('/api/operations/stock','dailyReport',{productId})
   .then(d=>{if(active)setResult(d)})
   .catch(e=>{if(active)setError(e.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[productId]);
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
  <section className="receiving-card ti-v4-inventory-today"><h2>Produtos contados hoje</h2><p>Toque em um item para investigar as últimas contagens e movimentações.</p>{todayCountError&&<p role="alert">{todayCountError}</p>}{!todayCountComplete&&<p role="status">Há mais de 400 registros recentes; a lista abaixo pode estar incompleta. Não use como fechamento geral.</p>}{!todayCounts.length?<p className="ti-inventory-v4-empty">Nenhuma contagem de hoje foi encontrada nesta consulta.</p>:<div className="ti-v4-today-list">{todayCounts.map(p=><button type="button" key={p.productId} aria-pressed={productId===p.productId} onClick={()=>setProductId(p.productId)}><strong>{p.name}</strong><span>Última contagem: {date(p.at)}</span></button>)}</div>}</section>
  <section className="receiving-card ti-inventory-v4-report" aria-labelledby="inventory-report-title">
   <div className="ti-v4-inventory-heading"><Search size={21} aria-hidden="true"/><div><h2 id="inventory-report-title">Investigar produto</h2><p>Consulte a apuração disponível para qualquer produto da unidade.</p></div></div>
   <label>Produto para investigar
    <select value={productId} onChange={e=>setProductId(e.target.value)}>
     <option value="">Selecione um produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </label>
   {!productId&&!loading&&<p className="ti-inventory-v4-empty">Selecione um produto para comparar suas últimas contagens. A lista automática de itens contados hoje será integrada com o novo backend V4.</p>}
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
    {r.currentCountId&&<button type="button" disabled={busy} onClick={()=>decide('closeSubmit',r.currentCountId,productId)}>Solicitar fechamento desta contagem</button>}
   </div>}
  </section>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
