import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {ArrowLeft,PackagePlus,ClipboardCheck,History,RefreshCw} from 'lucide-react';
const qty=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:3});
const date=x=>x?new Date(x).toLocaleString('pt-BR'):'Não registrada';
async function request(action,productId){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Sessão expirada');
 const response=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,productId})});
 const body=await response.json();if(!response.ok)throw Error(body.message||'Não foi possível consultar o produto.');return body;
}
export default function ProductDetails({product,onBack,onAction,membership}){
 const [activity,setActivity]=useState([]),[lots,setLots]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[limited,setLimited]=useState(false);
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const [a,l]=await Promise.all([request('productActivity',product.id),request('lots',product.id)]);
   setActivity(a.records||[]);setLots(l.lots||[]);setLimited(a.limited===true);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 };
 useEffect(()=>{let mounted=true;const go=async()=>{
  setLoading(true);setError('');
  try{
   const [a,l]=await Promise.all([request('productActivity',product.id),request('lots',product.id)]);
   if(mounted){setActivity(a.records||[]);setLots(l.lots||[]);setLimited(a.limited===true)}
  }catch(e){if(mounted)setError(e.message)}finally{if(mounted)setLoading(false)}
 };go();return ()=>{mounted=false}},[product.id]);
 const b=product.physicalBalance,minimum=Number(product.minStock);
 const low=b&&b.unit===product.unit&&Number.isFinite(minimum)&&b.total<minimum;
 return <section className="product-detail-page">
  <button className="product-detail-back" type="button" onClick={onBack}><ArrowLeft size={18}/> Voltar ao estoque</button>
  <div className="product-detail-heading"><div><p className="eyebrow">ESTOQUE / {product.category} · {membership.unitId.toUpperCase()}</p><h1>{product.name}</h1><p>{product.status==='active'?'Produto ativo':'Produto inativo'} · Unidade cadastrada: {product.unit}</p></div><button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div>
  {b?<><h2>Última contagem física</h2><div className="operational-counts product-detail-counts"><div><span>Reserva</span><strong>{qty(b.reserve)}</strong></div><div><span>Giro</span><strong>{qty(b.rotation)}</strong></div><div><span>Total</span><strong>{qty(b.total)}</strong></div></div><p>Quantidade em <strong>{b.unit}</strong> · Conferida em {date(b.at)}</p>{low&&<p role="status">Abaixo do mínimo cadastrado ({qty(minimum)} {product.unit}).</p>}</>:
   <div className="operational-uncounted"><strong>Sem contagem física registrada</strong><span>Saldo legado: {qty(product.quantity)} {product.unit}. Não representa quantidade física conferida.</span></div>}
  <div className="product-detail-actions">
   {['admin','manager'].includes(membership.role)&&<button type="button" onClick={()=>onAction('receiving',product.id)}><PackagePlus size={20}/> Registrar recebimento</button>}
   <button type="button" onClick={()=>onAction('count',product.id)}><ClipboardCheck size={20}/> Fazer contagem</button>
   <button type="button" onClick={()=>onAction('history',product.id)}><History size={20}/> Histórico completo</button>
  </div>
  <div className="product-detail-panel"><h2>Informações do produto</h2><dl><div><dt>Categoria</dt><dd>{product.category}</dd></div><div><dt>Unidade cadastrada</dt><dd>{product.unit}</dd></div><div><dt>Estoque mínimo</dt><dd>{qty(product.minStock)} {product.unit}</dd></div><div><dt>Validade</dt><dd>{product.trackExpiry?'Exigida':'Não exigida'}</dd></div><div><dt>Última contagem</dt><dd>{date(b?.at)}</dd></div></dl></div>
  <div className="product-detail-panel"><h2>Lotes recebidos</h2><p>Valores de entrada acumulados, não saldos disponíveis. Baixa por lote/FEFO ainda não implementada.</p>{loading?<p>Consultando lotes...</p>:lots.length?<div className="product-detail-list">{lots.map(l=><div key={l.id}><strong>{l.lot}</strong><span>Validade: {l.expiryDate} · Recebido: {qty(l.receivedQuantity)} {l.unit}</span></div>)}</div>:<p>Nenhum lote registrado.</p>}</div>
  <div className="product-detail-panel"><h2>Atividade recente do produto</h2>{error&&<p role="alert">{error}</p>}{loading?<p>Consultando histórico...</p>:activity.length?<div className="product-detail-list">{activity.map(x=><div key={x.id}><strong>{x.kind==='receive'?'Recebimento':'Contagem'} · {date(x.at)}</strong><span>{x.kind==='receive'?qty(x.physicalQuantity)+' '+x.unit+' recebidos':qty(x.reserve)+' reserva + '+qty(x.rotation)+' giro ('+x.unit+')'}</span><small>Responsável: {x.actorUid}</small></div>)}</div>:<p>Sem registros físicos para este produto.</p>}{limited&&<p>Histórico extenso: exibimos somente os registros recentes disponíveis nesta consulta.</p>}</div>
 </section>;
}
