import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import './receiving-experience.css';
import PackageConference from './PackageConference.jsx';

async function api(path,action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Sessão expirada.');
 const token=await user.getIdToken();
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...extra})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Erro de comunicação.');return data;
}
const fmt=at=>at?new Date(at).toLocaleString('pt-BR'):'—';
const qty=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:3});
const numeric=(s)=>s===''?null:Number(s);
export default function PhysicalStock({membership,mode='receive',initialProductId=null}){
 const {notify}=useFeedback();
 const [products,setProducts]=useState([]),[catalog,setCatalog]=useState([]),[history,setHistory]=useState({receipts:[],counts:[],outflows:[],transfers:[],productions:[]});
 const [productId,setProductId]=useState(initialProductId||''),[supplier,setSupplier]=useState(''),[weight,setWeight]=useState('');
 const [amount,setAmount]=useState(''),[orderedQuantity,setOrderedQuantity]=useState(''),[pendingId,setPendingId]=useState(null),[reserve,setReserve]=useState(''),[rotation,setRotation]=useState('');
 const [lot,setLot]=useState(''),[expiry,setExpiry]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const [summary,setSummary]=useState(null);
 const [lots,setLots]=useState([]);
 const [more,setMore]=useState({receipts:false,counts:false,outflows:false,transfers:false}),[loadingMore,setLoadingMore]=useState(false);
 const canReceive=['admin','manager'].includes(membership.role);
 const load=useCallback(async()=>{
  try{
   const [p,h,c]=await Promise.all([api('/api/products/manage','list'),api('/api/operations/stock','list'),api('/api/catalog/manage','list')]);
   setProducts(p.products||[]);setCatalog(c.catalog||[]);setHistory({receipts:h.receipts||[],counts:h.counts||[],outflows:h.outflows||[],transfers:h.transfers||[],productions:h.productions||[]});
   setMore({receipts:!!h.hasMore_receipts,counts:!!h.hasMore_counts,outflows:!!h.hasMore_outflows,transfers:!!h.hasMore_transfers,productions:!!h.hasMore_productions});
  }catch(e){setStatus(e.message)}
 },[]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{if(initialProductId)setProductId(initialProductId)},[initialProductId]);
 useEffect(()=>{
  let active=true;setSummary(null);setLots([]);
  if(!productId)return;
  api('/api/operations/stock','summary',{productId})
   .then(data=>{if(active)setSummary(data.summary)})
   .catch(err=>{if(active)setStatus(err.message)});
  api('/api/operations/stock','lots',{productId})
   .then(data=>{if(active)setLots(data.lots||[])})
   .catch(err=>{if(active)setStatus(err.message)});
  return ()=>{active=false};
 },[productId,history]);
 const loadMore=async()=>{
  const types=['receipts','counts','outflows','transfers','productions'];
  if(loadingMore||!types.some(k=>more[k]))return;
  setLoadingMore(true);
  try{
   const args={};
   for(const key of types){
    if(more[key])args['before_'+key]=history[key].at(-1)?.at;
    else args['skip'+key]=true;
   }
   const h=await api('/api/operations/stock','list',args);
   setHistory(old=>Object.fromEntries(types.map(key=>[key,[...old[key],...(h[key]||[])]])));
   setMore(Object.fromEntries(types.map(key=>[key,!!h['hasMore_'+key]])));
  }catch(e){setStatus(e.message)}finally{setLoadingMore(false)}
 };
 const p=products.find(x=>x.id===productId);
 const catalogProduct=catalog.find(x=>x.id===p?.catalogId);
 const physicalUnit=p?.operationalUnitOverride||catalogProduct?.operationalUnit||p?.operationalUnit||(['alcatra-bife','alcatra-cubos','frango-file-120g'].includes(p?.catalogId)?'un':p?.unit||'un');
 const previous=summary?.previous;
 const receivingUnit=p?.receivingUnitOverride||catalogProduct?.receivingUnit||p?.unit||'un';
 const deliveredCommercial=receivingUnit===physicalUnit?Number(amount):receivingUnit==='kg'&&physicalUnit==='un'?Number(weight):null;
 const weightToPieces=receivingUnit==='kg'&&physicalUnit==='un';
 const proteinMismatch=p?.category==='Proteínas'&&physicalUnit!=='un';

 const total=numeric(reserve)!==null&&numeric(rotation)!==null?Number(reserve)+Number(rotation):null;
 const submit=async e=>{
  e.preventDefault();if(busy||!p)return;
  setBusy(true);setStatus('');
  try{
   const requestId=pendingId||crypto.randomUUID();
   if(!pendingId)setPendingId(requestId);
   if(mode==='receive'){
    if(!canReceive)throw Error('Só administrador ou gerente registra recebimentos.');
    await api('/api/operations/stock','receive',{productId,requestId,supplier:supplier.trim(),
     orderedQuantity:Number(orderedQuantity),deliveredWeightKg:weight===''?null:Number(weight),physicalQuantity:Number(amount),
     lot:lot.trim(),expiryDate:expiry,notes:notes.trim()});
    setAmount('');setWeight('');setOrderedQuantity('');setNotes('');setLot('');setExpiry('');
   }else{
    await api('/api/operations/stock','count',{productId,requestId,reserve:Number(reserve),rotation:Number(rotation),notes:notes.trim()});
    setReserve('');setRotation('');setNotes('');
   }
   setPendingId(null);setStatus('Registro salvo no Firebase.');notify(mode==='receive'?'Recebimento registrado com sucesso.':'Contagem registrada com sucesso.','success');
   try{await load()}catch{ /* gravação já confirmada; atualização pode ser repetida */ }
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const rows=(mode==='history'?[
  ...history.receipts.map(x=>({...x,kind:'receive'})),
  ...history.counts.map(x=>({...x,kind:'count'})),
  ...history.outflows.map(x=>({...x,kind:'dispatch'})),
  ...history.transfers.map(x=>({...x,kind:'transfer'})),...history.productions.map(x=>({...x,kind:'production'}))
 ].sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)):mode==='receive'?history.receipts:history.counts)
 .filter(x=>!initialProductId||x.productId===initialProductId||x.kind==='production'&&x.items?.some(i=>i.productId===initialProductId));
 return <section className="receiving-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId}</p>
  <h1>{mode==='history'?'Histórico da operação':mode==='receive'?'Recebimento de mercadorias':'Contagem diária — reserva e giro'}</h1>
  <p>{mode==='history'?'Registros físicos de recebimento e contagem, com data e responsável.':mode==='receive'?'Registre a mercadoria conferida com a quantidade física efetivamente recebida.':
    'Informe o estoque físico encontrado em cada área; confira o histórico antes de salvar.'}</p>
  <div className="receiving-notice">Operações auditadas no Firebase. Após a primeira contagem, entregas e saídas atualizam o saldo físico; o saldo legado permanece separado. Para lotes antigos, a conciliação é necessária antes da baixa.</div>
  {mode==='history'?null:mode==='receive'&&!canReceive?<p>Somente administrador ou gerente pode registrar recebimentos.</p>:
  <form className={mode==='receive'?'ti-receive-form':'receiving-card'} onSubmit={submit}>
   {mode==='receive'?<>
    <div className="ti-receive-hero"><div><small>RECEBIMENTO · PASSO A PASSO</small><h2>Conferir mercadoria</h2><p>Selecione o produto e registre a quantidade real. O sistema nunca deve presumir o conteúdo de uma caixa ou pacote.</p></div><span className="ti-receive-progress">3 etapas</span></div>
    <section className="ti-receive-stage">
     <h3><span>1</span> Qual mercadoria chegou?</h3>
     <label className="ti-receive-field">Produto recebido<select required value={productId} onChange={e=>{setProductId(e.target.value);setPendingId(null);setStatus('')}}><option value="">Escolher produto da unidade</option>{products.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     {p&&<p>Unidade do saldo atualmente configurada: <strong>{physicalUnit}</strong>. Unidade comercial registrada: <strong>{receivingUnit}</strong>.</p>}
     <label className="ti-receive-field">Fornecedor<input required minLength={1} maxLength={160} value={supplier} onChange={e=>{setSupplier(e.target.value);setPendingId(null)}} /></label>
    </section>
    <section className="ti-receive-stage">
     <h3><span>2</span> Quanto foi entregue?</h3>
     {p&&summary&&!summary.previous&&<div className="ti-receive-warning" role="status">Ainda não existe uma contagem física inicial deste produto. O recebimento será registrado no histórico, mas não criará automaticamente um saldo físico disponível. Faça a contagem de Reserva e Giro para estabelecer o saldo inicial antes de depender dele nas saídas.</div>}
     {p&&weightToPieces&&<div className="ti-receive-warning" role="status">Pedido em kg e estoque por peças: registre o peso realmente entregue e a contagem efetiva de peças. Não calculamos peças automaticamente a partir de kg.</div>}
     {p&&proteinMismatch&&<div className="ti-receive-warning" role="status">Confira a unidade configurada neste produto. Não modificaremos saldos antigos automaticamente.</div>}
     {p&&receivingUnit!==physicalUnit&&!weightToPieces&&<div className="ti-receive-warning" role="alert">As unidades de compra e estoque são diferentes. A versão atual ainda não possui uma conversão homologada entre elas. Não informe caixas ou pacotes como se fossem kg ou unidades; solicite conferência da unidade antes de registrar.</div>}
     <div className="inventory-fields">
      <label>Quantidade solicitada ({receivingUnit})<input required type="number" min={receivingUnit==='un'?'1':'0.001'} step={receivingUnit==='un'?'1':'0.001'} value={orderedQuantity} onChange={e=>{setOrderedQuantity(e.target.value);setPendingId(null)}}/></label>
      <label>{weightToPieces?'Peças efetivamente recebidas (un)':'Quantidade física recebida ('+physicalUnit+')'}<input required type="number" min={physicalUnit==='un'?'1':'0.001'} step={physicalUnit==='un'?'1':'0.001'} value={amount} onChange={e=>{setAmount(e.target.value);setPendingId(null)}}/></label>
      <label>{weightToPieces?'Peso entregue (kg) — obrigatório':'Peso entregue (kg), se medido'}<input required={weightToPieces} type="number" min="0.001" step="0.001" value={weight} onChange={e=>{setWeight(e.target.value);setPendingId(null)}}/></label>
     </div>
     {deliveredCommercial!==null&&orderedQuantity!==''&&amount!==''&&(receivingUnit===physicalUnit||weight!=='')&&<p>Diferença do pedido: <strong>{qty(deliveredCommercial-Number(orderedQuantity))} {receivingUnit}</strong>.</p>}
    </section>
    <section className="ti-receive-stage">
     <h3><span>3</span> Conferir e registrar</h3>
     {p?.trackExpiry&&<div className="inventory-fields"><label>Lote<input required maxLength={80} value={lot} onChange={e=>{setLot(e.target.value);setPendingId(null)}}/></label><label>Validade<input required type="date" value={expiry} onChange={e=>{setExpiry(e.target.value);setPendingId(null)}}/></label></div>}
     <label className="ti-receive-field ti-receive-notes">Observações (opcional)<textarea rows={3} maxLength={240} value={notes} onChange={e=>{setNotes(e.target.value);setPendingId(null)}} placeholder="Ex.: caixas conferidas com fornecedor"/></label>
     {p&&<div className="ti-receive-summary"><span>Resumo da entrega</span><b>{p.name}</b><span>{amount||'—'} {physicalUnit} recebidos · pedido de {orderedQuantity||'—'} {receivingUnit}</span><span>Registro vinculado ao responsável e à unidade atual.</span></div>}
     <button className="ti-receive-primary" type="submit" disabled={busy||!productId||(receivingUnit!==physicalUnit&&!weightToPieces)}>{busy?'Registrando...':'Confirmar recebimento'}</button>
     {status&&<p role="status">{status}</p>}
    </section>
   </>:<>
    <h2>Registrar contagem</h2>
    <div className="inventory-fields">
     <label>Produto<select required value={productId} onChange={e=>{setProductId(e.target.value);setPendingId(null);setStatus('')}}><option value="">Selecione o produto da unidade</option>{products.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <label>Reserva ({physicalUnit})<input required type="number" min="0" step={physicalUnit==='un'?'1':'0.001'} value={reserve} onChange={e=>{setReserve(e.target.value);setPendingId(null)}}/></label>
     <label>Giro ({physicalUnit})<input required type="number" min="0" step={physicalUnit==='un'?'1':'0.001'} value={rotation} onChange={e=>{setRotation(e.target.value);setPendingId(null)}}/></label>
     <label>Observação<input maxLength={240} value={notes} onChange={e=>{setNotes(e.target.value);setPendingId(null)}}/></label>
    </div>
    {summary&&<p><strong>Última entrega:</strong> {summary.lastDelivery?qty(summary.lastDelivery.physicalQuantity)+' '+summary.lastDelivery.unit+' · '+fmt(summary.lastDelivery.at):'Nenhuma registrada'}. <strong>Entradas desde a contagem anterior:</strong> {summary.entriesSincePrevious===null?'Indisponível':qty(summary.entriesSincePrevious)+' '+summary.unit}. <strong>Saídas registradas:</strong> {summary.exitsSincePrevious===null?'Indisponível':qty(summary.exitsSincePrevious)+' '+summary.unit}.</p>}
    {summary?.complete&&previous&&total!==null&&<p><strong>Diferença física estimada:</strong> {qty(previous.total+summary.entriesSincePrevious-(summary.exitsSincePrevious||0)-total)} {summary.unit}. Essa diferença não é automaticamente venda ou consumo.</p>}
    {summary&&!summary.complete&&<p role="alert">{summary.reason}</p>}
    <p><strong>Total agora:</strong> {total===null?'—':qty(total)+' '+physicalUnit}. <strong>Última contagem:</strong> {previous?qty(previous.total)+' '+summary.unit+' em '+fmt(previous.at):'Não registrada'}</p>
    <button type="submit" disabled={busy||!productId}>{busy?'Salvando...':'Salvar contagem'}</button>
    {status&&<p role="status">{status}</p>}
   </>}
  </form>}
  {(mode==='receive'||mode==='count')&&p&&<PackageConference key={mode+':'+productId} productId={productId} physicalUnit={physicalUnit} mode={mode} canReview={canReceive}/>}
  {mode==='receive'&&p?.trackExpiry&&lots.length>0&&<section className="receiving-card">
   <h2>Lotes recebidos — ordem de validade</h2>
   <p>Recebimentos e saldos disponíveis por lote. Lotes antigos precisam de conciliação administrativa antes da baixa FEFO.</p>
   <div className="receiving-scroll"><table className="receiving-table"><thead><tr><th>LOTE</th><th>VALIDADE</th><th>RECEBIDO</th><th>DISPONÍVEL</th></tr></thead><tbody>
    {lots.map(x=><tr key={x.id}><td>{x.lot}</td><td>{x.expiryDate}</td><td>{qty(x.receivedQuantity)} {x.unit}</td><td>{Number.isFinite(x.availableQuantity)?qty(x.availableQuantity)+' '+x.unit:'A conferir'}</td></tr>)}
   </tbody></table></div>
  </section>}
  <section className="receiving-card"><div className="inventory-list-header"><h2>Histórico real</h2><button type="button" onClick={load}>Atualizar</button></div>
   {rows.length===0?<p>Nenhum registro salvo nesta unidade.</p>:
    <div className="receiving-scroll"><table className="receiving-table"><thead><tr><th>QUANDO</th><th>TIPO</th><th>PRODUTO</th><th>QUANTIDADE</th><th>RESPONSÁVEL</th></tr></thead><tbody>
     {rows.map(r=><tr key={r.id}><td>{fmt(r.at)}</td><td>{({receive:'Recebimento',count:'Contagem',dispatch:'Saída',transfer:'Transferência',production:'Produção'})[r.kind]||'Operação'}</td><td>{r.productName||r.recipeName}</td><td>{r.kind==='receive'?qty(r.physicalQuantity)+' '+r.unit+' (pedido: '+qty(r.orderedQuantity||0)+' '+(r.receivingUnit||r.unit)+')':
      r.kind==='count'?qty(r.reserve)+' reserva + '+qty(r.rotation)+' giro ('+r.unit+')':
      r.kind==='production'?r.portions+' porções · '+r.items?.map(i=>i.productName+' '+qty(i.quantity)+' '+i.unit).join(' + '):
      r.kind==='transfer'?qty(r.quantity)+' '+r.unit+' · '+r.from+' → '+r.to:
      qty(r.quantity)+' '+r.unit+' · '+r.location+' · '+r.reason}</td><td>{r.actorName||'Responsável não identificado'}</td></tr>)}
    </tbody></table></div>}
   {(more.receipts||more.counts||more.outflows||more.transfers||more.productions)&&<button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore?'Carregando...':'Carregar registros anteriores'}</button>}
  </section>
 </section>;
}
