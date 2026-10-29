import TriamicciHistory from './TriamicciHistory.jsx';
import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
export default function KitchenV3History({products}){
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');
  try{const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
   const r=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'v3LedgerHistory'})});
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
   getQuantity={op=>label[op.kind]||op.kind}
   getDescription={op=>op.kind==='receipt'?'Entrada: '+(op.stockQuantity??'não medida')+' '+(op.stockUnit||''):op.kind==='count'?'Encontrado: '+op.quantity+' '+op.unit:op.kind==='transfer'?op.from+' → '+op.to+' · '+op.quantity+' '+op.unit:op.kind==='production'?'Produzido: '+op.outputQuantity+' '+op.outputUnit:''}
   renderDetails={op=><div>Registro: {op.id} · {op.location||op.outputLocation||op.to||'Local não informado'}</div>}
   empty="Nenhuma movimentação registrada nesta consulta."/>
 </section>;
}
