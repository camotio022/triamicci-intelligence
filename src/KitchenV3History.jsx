import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import HistoryPeriod from './HistoryPeriod.jsx';
import {inPeriod} from './operation-time.js';
export default function KitchenV3History({products}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[productId,setProductId]=useState('');
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');
  try{const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
   const r=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'v3LedgerHistory'})});
   const d=await r.json();if(!r.ok)throw Error(d.message||'Não foi possível consultar histórico.');setItems(d.operations||[]);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 };
 useEffect(()=>{load()},[]);
 const visible=items.filter(op=>inPeriod(op.at,from,to)&&(!productId||op.productId===productId||op.outputProductId===productId||op.inputs?.some(i=>i.productId===productId)));
 const date=stamp=>{if(!stamp)return'—';const epoch=stamp._seconds??stamp.seconds;const d=epoch!==undefined?new Date(epoch*1000):new Date(stamp);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
 const label={receipt:'Recebimento',production:'Produção',transfer:'Transferência interna',count:'Contagem física'};
 const product=id=>products.find(p=>p.id===id)?.profile?.displayName||products.find(p=>p.id===id)?.name||'Insumo não encontrado';
 return <section className="v3-card"><div className="v3-row"><h2>Histórico operacional</h2><button type="button" className="v3-secondary" onClick={load} disabled={loading}>Atualizar</button></div>
  <p>Registro auditável de entradas, produção, transferências e contagens. A diferença física não é automaticamente venda nem consumo identificado.</p>
  <HistoryPeriod from={from} to={to} onFrom={setFrom} onTo={setTo}/><label>Produto<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Todos os produtos</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  {error&&<p role="alert" className="v3-error">{error}</p>}
  {loading?<p>Carregando registros…</p>:error?null:!visible.length?<p>Nenhuma movimentação no período entre os registros carregados.</p>:
   <div className="v3-tiles">{visible.map(op=><article className="v3-tile" key={op.id}><strong>{label[op.kind]||op.kind}</strong>
    <p>{product(op.productId)}</p><small>{date(op.at)} · {op.location||op.outputLocation||op.to||''}</small>
    {op.kind==='receipt'&&<p>Recebido {op.commercialQuantity} {op.commercialUnit} · entrada {op.stockQuantity??'não medida'} {op.stockUnit||''}</p>}
    {op.kind==='count'&&<p>Encontrado {op.quantity} {op.unit} · diferença não classificada: {op.difference}</p>}
    {op.kind==='transfer'&&<p>{op.from} → {op.to} · {op.quantity} {op.unit}</p>}
    {op.kind==='production'&&<p>Produzido {op.outputQuantity} {op.outputUnit} · origem registrada {op.inputs?.map(i=>product(i.productId)+' '+i.quantity+' '+i.unit).join(', ')}</p>}
    </article>)}</div>}
 </section>;
}
