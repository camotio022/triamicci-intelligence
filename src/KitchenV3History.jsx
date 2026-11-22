import {historyQuantity} from './operation-time.js';
import {apiFetch} from './api-fetch.js';
import TriamicciHistory from './TriamicciHistory.jsx';
import React,{useEffect,useState} from 'react';
import {sessionAuth as auth} from './firebase.js';
export default function KitchenV3History({products}){
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');
  try{const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
   const r=await apiFetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'v3LedgerHistory'})});
   const d=await r.json();if(!r.ok)throw Error(d.message||'Não foi possível consultar histórico.');setItems(d.operations||[]);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 };
 useEffect(()=>{load()},[]);
 const date=stamp=>{if(!stamp)return'—';const epoch=stamp._seconds??stamp.seconds;const d=epoch!==undefined?new Date(epoch*1000):new Date(stamp);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
 const label={receipt:'Recebimento',production:'Produção',transfer:'Transferência interna',count:'Contagem física'};
 const product=id=>products.find(p=>p.id===id)?.profile?.displayName||products.find(p=>p.id===id)?.name||'Insumo não encontrado';
 return <section className="v3-card"><p>Entradas, produção, transferências e contagens auditáveis. Diferenças físicas não equivalem automaticamente a vendas.</p>
  {error&&<p role="alert" className="v3-error">{error}</p>}
  <TriamicciHistory title="Histórico operacional" records={items} loading={loading}
   getTitle={op=>product(op.productId)} getDate={op=>op.at?((op.at._seconds??op.at.seconds)!==undefined?new Date((op.at._seconds??op.at.seconds)*1000):op.at):null}
   getBadge={op=>label[op.kind]||op.kind}
   getQuantity={op=>historyQuantity(op.kind==='receipt'?op.stockQuantity:op.kind==='production'?op.outputQuantity:op.quantity,op.kind==='receipt'?op.stockUnit:op.kind==='production'?op.outputUnit:op.unit)}
   getDescription={op=>op.kind==='transfer'?op.from+' → '+op.to:''}
   renderDetails={op=><div>Registro: {op.id} · {op.location||op.outputLocation||op.to||'Local não informado'}</div>}
   empty="Nenhuma movimentação registrada nesta consulta."/>
 </section>;
}
