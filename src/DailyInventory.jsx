import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
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
 const [products,setProducts]=useState([]),[productId,setProductId]=useState('');
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [closures,setClosures]=useState([]),[moreClosures,setMoreClosures]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const isManager=['admin','manager'].includes(membership.role);
 const refreshClosures=async()=>{if(!isManager)return;const d=await request('/api/operations/stock','closeList');setClosures(d.closures||[]);setMoreClosures(!!d.hasMore)};
 const loadMoreClosures=async()=>{if(busy||!moreClosures||!closures.length)return;setBusy(true);try{const d=await request('/api/operations/stock','closeList',{before:closures.at(-1).submittedAt});setClosures(old=>[...old,...(d.closures||[])]);setMoreClosures(!!d.hasMore)}catch(e){setError(e.message)}finally{setBusy(false)}};
 useEffect(()=>{if(isManager)refreshClosures().catch(e=>setError(e.message))},[membership.role]);
 const decide=async(action,id,pid,reason='')=>{setBusy(true);setNotice('');try{const d=await request('/api/operations/stock',action,{productId:pid,requestId:id,reason});setNotice(d.message);await refreshClosures()}catch(e){setError(e.message)}finally{setBusy(false)}};
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
 return <section className="receiving-page">
  <p className="eyebrow">OPERAÇÃO · INVENTÁRIO · {membership.unitId.toUpperCase()}</p>
  <h1>Inventário inteligente</h1>
  <p>Consulte a diferença entre as duas últimas contagens físicas, considerando recebimentos e baixas registradas. Esta apuração não modifica o estoque.</p>
  <div className="receiving-card">
   <label>Produto da unidade
    <select value={productId} onChange={e=>setProductId(e.target.value)}>
     <option value="">Selecione um produto</option>
     {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </label>
   {loading&&<p role="status">Calculando com base no Firebase...</p>}
   {error&&<p role="alert">{error}</p>}
   {result&&!r&&<p role="status">{result.reason==='NO_COUNT'?'Não há contagem física registrada.':
    result.reason==='LIMITED_HISTORY'?'Histórico extenso: apuração bloqueada para evitar resultados incompletos.':
    'Não foi possível fazer uma apuração segura. Confira unidades e histórico de contagens.'}</p>}
   {r&&<>
    <h2>{r.productName}</h2>
    <p>Contagem atual: {date(r.currentAt)} · Anterior: {date(r.previousAt)}</p>
    <div className="operational-counts">
     <div><span>Disponível agora</span><strong>{fmt(r.available)} {r.unit}</strong></div>
     <div><span>Contagem anterior</span><strong>{fmt(r.previousTotal)} {r.unit}</strong></div>
     <div><span>Entradas no período</span><strong>{fmt(r.entriesTotal)} {r.unit}</strong></div>
    </div>
    {r.status==='NO_PREVIOUS_COUNT'?<p role="status">Primeira contagem: saída estimada indisponível.</p>:<>
     <div className="operational-counts">
      <div><span>Saída física estimada</span><strong>{fmt(r.estimatedPhysicalExit)} {r.unit}</strong></div>
      <div><span>Baixas já registradas</span><strong>{fmt(r.recordedOutflows)} {r.unit}</strong></div>
      <div><span>Variação física</span><strong>{fmt(r.variation)} {r.unit}</strong></div>
     </div>
     <p>Última entrada: {r.latestEntry?fmt(r.latestEntry.quantity)+' '+r.unit+' · '+date(r.latestEntry.at):'Nenhuma no período'}</p>
     {r.divergence&&<p role="alert">Diferença para conciliação: {fmt(r.divergence.quantity)} {r.unit} — {r.divergence.kind==='POSITIVE_ADJUSTMENT'?'aumento físico não explicado':'diferença entre saída física estimada e baixas registradas'}.</p>}
    </>}
    <p className="receiving-notice">Apuração informativa; não é prova de venda, perda ou desperdício. Não gera baixa adicional nem aprova fechamento.</p>
    {r.currentCountId&&<button type="button" disabled={busy} onClick={()=>decide("closeSubmit",r.currentCountId,productId)}>Solicitar fechamento desta contagem</button>}
   </>}
  </div>
  {notice&&<p role="status">{notice}</p>}
  {isManager&&<section className="receiving-card"><h2>Fechamentos para conferência</h2>
   {!closures.length?<p>Nenhum fechamento localizado.</p>:closures.map(x=><article key={x.id} className="operational-product">
    <strong>{x.productName} · {x.day}</strong><p>{x.countedTotal} {x.unit} · {x.status==="pending"?"Pendente":x.status==="approved"?"Aprovado":"Recusado"}</p>
    <p>Contagem: {x.countId} · Solicitado em {date(x.submittedAt)}</p>
    {x.status==="pending"&&<div className="receiving-actions">
     <button disabled={busy} type="button" onClick={()=>decide("closeApprove",x.countId,x.productId)}>Aprovar fechamento</button>
     <button disabled={busy} type="button" onClick={()=>{const reason=window.prompt("Justificativa da recusa:");if(reason?.trim())decide("closeReject",x.countId,x.productId,reason.trim())}}>Recusar</button>
    </div>}</article>)}
   {moreClosures&&<button type="button" disabled={busy} onClick={loadMoreClosures}>Carregar fechamentos anteriores</button>}
  </section>}
 </section>;
}
