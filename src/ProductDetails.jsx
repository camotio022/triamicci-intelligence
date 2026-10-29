import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useUnitLive} from './useUnitLive.js';
import {auth} from './firebase.js';
import {ArrowLeft,PackagePlus,ClipboardCheck,History} from 'lucide-react';
import StockActions from './StockActions.jsx';
import './product-detail-v41.css';
import UnitCorrection from './UnitCorrection.jsx';
import {balancePresentation} from './operation-time.js';
const qty=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:3});
const date=x=>x?new Date(x).toLocaleString('pt-BR'):'Não registrada';
async function request(action,productId){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Sessão expirada');
 const response=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,productId})});
 const body=await response.json();if(!response.ok)throw Error(body.message||'Não foi possível consultar o produto.');return body;
}
export default function ProductDetails({product,onBack,onAction,membership,onRefresh}){
 const [activity,setActivity]=useState([]),[lots,setLots]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[limited,setLimited]=useState(false);
 const [showLots,setShowLots]=useState(false),[showSettings,setShowSettings]=useState(false),[showOperations,setShowOperations]=useState(false);
 const generation=useRef(0);
 const load=useCallback(async(silent=false)=>{
  const current=++generation.current;
  if(!silent)setLoading(true);
  try{
   const [a,l]=await Promise.all([request('productActivity',product.id),request('lots',product.id)]);
   if(current!==generation.current)return;
   setActivity(a.records||[]);setLots(l.lots||[]);setLimited(a.limited===true);setError('');
  }catch(e){if(current===generation.current)setError(e.message)}
  finally{if(current===generation.current)setLoading(false)}
 },[product.id]);
 const live=useUnitLive(membership.unitId,()=>load(true));
 useEffect(()=>{load();return()=>{generation.current++}},[load]);
 const b=product.physicalBalance,minimum=Number(product.minStock);
 const presentation=balancePresentation(b);
 const operationUnit=product.physicalUnit||product.operationalUnitOverride||product.unit;
 const low=b&&b.unit===product.unit&&Number.isFinite(minimum)&&b.total<minimum;
 const unitMismatch=b&&b.unit!==product.unit;
 return <section className="product-detail-page ti-product-v41">
  <button className="product-detail-back" type="button" onClick={onBack}><ArrowLeft size={18}/> Voltar ao estoque</button>
  <div className="product-detail-heading"><div><p className="eyebrow">ESTOQUE / {product.category} · {membership.unitId.toUpperCase()}</p><h1>{product.name}</h1><p>{product.status==='active'?'Produto ativo':'Produto inativo'} · Unidade cadastrada: {product.unit}</p></div><span className="ti-product-v41-state" role="status">{live.status==='live'?'Sincronização ativa':live.status==='connecting'?'Conectando…':live.status==='reconnecting'?'Reconectando…':'Sincronização indisponível'}</span></div>
  {live.status==='error'&&<button type="button" className="ti-product-retry" onClick={()=>load()}>Tentar novamente</button>}
  {b?<><div className="ti-product-v41-metrics"><div className="ti-product-v41-metrichead"><h2>{presentation.title}</h2><small>{date(b.at)}</small></div><div className="operational-counts product-detail-counts"><div><span>Reserva</span><strong>{qty(b.reserve)} <small>{b.unit}</small></strong></div><div><span>Giro</span><strong>{qty(b.rotation)} <small>{b.unit}</small></strong></div><div><span>Total</span><strong>{qty(b.total)} <small>{b.unit}</small></strong></div></div><p>Última contagem física: {presentation.counted?`${qty(b.countedTotal)} ${b.unit} · `:''}{date(b.at)}.</p>{presentation.estimated&&<p>Estimativa após movimentações registradas{Number.isFinite(b.entriesSinceCount)&&Number.isFinite(b.exitsSinceCount)?`: +${qty(b.entriesSinceCount)} ${b.unit} de entradas e −${qty(b.exitsSinceCount)} ${b.unit} de saídas`:''}. Transferências não registradas podem alterar a distribuição entre Reserva e Giro.</p>}{!b.at&&<p>Sem contagem física registrada para confirmar este saldo.</p>}</div>{low&&<p role="status">Abaixo do mínimo cadastrado ({qty(minimum)} {product.unit}).</p>}</>:
   <div className="operational-uncounted"><strong>Sem contagem física registrada</strong><span>Saldo legado: {qty(product.quantity)} {product.unit}. Não representa quantidade física conferida.</span></div>}
  {unitMismatch&&<p className="ti-product-unit-warning" role="alert">A contagem foi registrada em {b.unit}, enquanto o cadastro usa {product.unit}. As unidades não foram convertidas automaticamente; confira a configuração antes de movimentar.</p>}
  <div className="product-detail-actions ti-product-v41-primary">
   {['admin','manager','submanager','cook','auxiliar'].includes(membership.role)&&<button type="button" onClick={()=>onAction('receiving',product.id)}><PackagePlus size={20}/> Registrar recebimento</button>}
   {['admin','manager','submanager'].includes(membership.role)&&<button type="button" onClick={()=>onAction('count',product.id)}><ClipboardCheck size={20}/> Fazer contagem</button>}

  </div>
  {b&&b.unit!==operationUnit&&<p role="alert" className="receiving-notice">A última contagem está em {b.unit}, mas a unidade operacional foi corrigida para {operationUnit}. Faça uma nova contagem antes de movimentar este produto.</p>}
  <div className="ti-product-v41-section"><button type="button" className="ti-product-v41-disclosure" aria-expanded={showOperations} onClick={()=>setShowOperations(v=>!v)}><span><strong>Movimentações de estoque</strong><small>Registrar saída · Transferir área · Conferir lotes</small></span><span aria-hidden="true">{showOperations?'−':'+'}</span></button>{showOperations&&(!b||b.unit===operationUnit)&&<StockActions product={product} lots={lots} membership={membership} onUpdated={async()=>{await onRefresh?.();await load()}}/>}{showOperations&&b&&b.unit!==operationUnit&&<p role="alert">Para movimentar, realize uma nova contagem na unidade operacional correta.</p>}</div>
  <div className="ti-product-v41-section ti-product-v41-admin"><button type="button" className="ti-product-v41-disclosure" aria-expanded={showSettings} onClick={()=>setShowSettings(v=>!v)}><span><strong>Configuração administrativa</strong><small>Unidades e correções com permissão</small></span><span aria-hidden="true">{showSettings?'−':'+'}</span></button>{showSettings&&<UnitCorrection product={product} membership={membership} onUpdated={async()=>{await onRefresh?.();await load()}}/>}</div>
  <details className="product-detail-panel ti-product-v41-details"><summary>Informações do produto</summary><dl><div><dt>Categoria</dt><dd>{product.category}</dd></div><div><dt>Unidade cadastrada</dt><dd>{product.unit}</dd></div><div><dt>Unidade operacional</dt><dd>{operationUnit}</dd></div><div><dt>Recebimento em</dt><dd>{product.receivingUnitOverride||product.unit}</dd></div><div><dt>Estoque mínimo cadastrado</dt><dd>{qty(product.minStock)} {product.unit}{operationUnit!==product.unit?' (revisar após correção de unidade)':''}</dd></div><div><dt>Validade</dt><dd>{product.trackExpiry?'Exigida':'Não exigida'}</dd></div><div><dt>Última contagem</dt><dd>{date(b?.at)}</dd></div></dl></details>
  <div className="product-detail-panel ti-product-v41-section ti-product-v41-lots"><button type="button" className="ti-product-v41-disclosure" aria-expanded={showLots} onClick={()=>setShowLots(v=>!v)}><span><strong>Lotes recebidos</strong><small>{loading?"Consultando lotes…":`${lots.length} lote(s) · Validade e disponibilidade por área`}</small></span><span aria-hidden="true">{showLots?"−":"+"}</span></button>{!loading&&lots.length>0&&<div className="ti-product-v41-lotpreview"><strong>{lots[0].lot||"Lote"}</strong><small>Recebido: {qty(lots[0].receivedQuantity)} {lots[0].unit} · Validade: {lots[0].expiryDate||"Não informada"}</small></div>}{showLots&&<div className="ti-product-v41-expand"><p>Recebimentos e disponibilidade conferida por área. Lotes antigos ou divergentes exigem conciliação antes de movimentações FEFO.</p>{loading?<p>Consultando lotes...</p>:lots.length?<div className="product-detail-list">{lots.map(l=><div key={l.id}><strong>{l.lot}</strong><span>Validade: {l.expiryDate} · Recebido: {qty(l.receivedQuantity)} {l.unit}</span><span>Reserva: {Number.isFinite(l.reserva)?qty(l.reserva):'A conferir'} · Giro: {Number.isFinite(l.giro)?qty(l.giro):'A conferir'}</span></div>)}</div>:<p>Nenhum lote registrado.</p>}</div>}</div>
  <details className="product-detail-panel ti-product-v41-history ti-history-disclosure"><summary>Consultar histórico do produto</summary><div className="ti-product-v41-historyhead"><h2>Atividade recente</h2><button type="button" onClick={()=>onAction("history",product.id)}>Histórico completo <History size={15}/></button></div>{error&&<p role="alert">{error}</p>}{loading?<p>Consultando histórico...</p>:activity.length?<div className="product-detail-list">{activity.map(x=><div key={x.id}><strong>{({receive:'Recebimento',count:'Contagem',dispatch:'Saída',transfer:'Transferência',production:'Produção'})[x.kind]||'Operação'} · {date(x.at)}</strong>
    <span>{x.kind==='receive'?qty(x.physicalQuantity)+' '+x.unit+' recebidos':
     x.kind==='count'?qty(x.reserve)+' reserva + '+qty(x.rotation)+' giro ('+x.unit+')':
     x.kind==='production'?x.portions+' porções · '+x.items?.filter(i=>i.productId===product.id).map(i=>qty(i.quantity)+' '+i.unit).join(' + '):
     x.kind==='transfer'?qty(x.quantity)+' '+x.unit+' · '+x.from+' → '+x.to:
     qty(x.quantity)+' '+x.unit+' · '+x.location+' · '+x.reason}</span>
    <small>Responsável: {x.actorName||x.actorUid}</small></div>)}</div>:<p>Sem registros físicos para este produto.</p>}{limited&&<p>Histórico extenso: exibimos somente os registros recentes disponíveis nesta consulta.</p>}</details>
 </section>;
}
