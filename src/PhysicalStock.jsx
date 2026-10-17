import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';

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
export default function PhysicalStock({membership,mode='receive'}){
 const [products,setProducts]=useState([]),[history,setHistory]=useState({receipts:[],counts:[]});
 const [productId,setProductId]=useState(''),[supplier,setSupplier]=useState(''),[weight,setWeight]=useState('');
 const [amount,setAmount]=useState(''),[orderedWeight,setOrderedWeight]=useState(''),[pendingId,setPendingId]=useState(null),[reserve,setReserve]=useState(''),[rotation,setRotation]=useState('');
 const [lot,setLot]=useState(''),[expiry,setExpiry]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const [summary,setSummary]=useState(null);
 const canReceive=['admin','manager'].includes(membership.role);
 const load=useCallback(async()=>{
  try{
   const [p,h]=await Promise.all([api('/api/products/manage','list'),api('/api/operations/stock','list')]);
   setProducts(p.products||[]);setHistory({receipts:h.receipts||[],counts:h.counts||[]});
  }catch(e){setStatus(e.message)}
 },[]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{
  let active=true;setSummary(null);
  if(!productId)return;
  api('/api/operations/stock','summary',{productId})
   .then(data=>{if(active)setSummary(data.summary)})
   .catch(err=>{if(active)setStatus(err.message)});
  return ()=>{active=false};
 },[productId,history]);
 const p=products.find(x=>x.id===productId);
 const physicalUnit=['alcatra-bife','alcatra-cubos','frango-file-120g'].includes(p?.catalogId)?'un':p?.unit||'un';
 const previous=summary?.previous;
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
     orderedWeightKg:orderedWeight===''?null:Number(orderedWeight),deliveredWeightKg:weight===''?null:Number(weight),physicalQuantity:Number(amount),
     lot:lot.trim(),expiryDate:expiry,notes:notes.trim()});
    setAmount('');setWeight('');setOrderedWeight('');setNotes('');setLot('');setExpiry('');
   }else{
    await api('/api/operations/stock','count',{productId,requestId,reserve:Number(reserve),rotation:Number(rotation),notes:notes.trim()});
    setReserve('');setRotation('');setNotes('');
   }
   setPendingId(null);setStatus('Registro salvo no Firebase.');await load();
  }catch(e){setStatus(e.message)}finally{setBusy(false)}
 };
 const rows=mode==='receive'?history.receipts:history.counts;
 return <section className="receiving-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId}</p>
  <h1>{mode==='receive'?'Recebimento de mercadorias':'Contagem diária — reserva e giro'}</h1>
  <p>{mode==='receive'?'Registre a mercadoria conferida com a quantidade física efetivamente recebida.':
    'Informe o estoque físico encontrado em cada área; confira o histórico antes de salvar.'}</p>
  <div className="receiving-notice">Estes registros são reais e auditados no Firestore. O saldo legado do catálogo ainda não é alterado automaticamente: a conciliação e o controle de lotes serão homologados separadamente.</div>
  {mode==='receive'&&!canReceive?<p>Somente administrador ou gerente pode registrar recebimentos.</p>:
  <form className="receiving-card" onSubmit={submit}>
   <h2>{mode==='receive'?'Conferir entrega':'Registrar contagem'}</h2>
   <div className="inventory-fields">
    <label>Produto<select required value={productId} onChange={e=>{setProductId(e.target.value);setPendingId(null);setStatus('')}}>
     <option value="">Selecione o produto da unidade</option>{products.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
    {mode==='receive'?<>
     <label>Fornecedor<input required minLength={1} maxLength={160} value={supplier} onChange={e=>{setSupplier(e.target.value);setPendingId(null)}} /></label>
     <label>Quantidade física recebida ({physicalUnit})<input required type="number" min="0.001" step={physicalUnit==='un'?'1':'0.001'} value={amount} onChange={e=>{setAmount(e.target.value);setPendingId(null)}}/></label>
     <label>Peso solicitado (kg){physicalUnit==='un'&&p?.catalogId!=='frango-file-120g'?' (obrigatório para carnes em peças)':''}<input type="number" min="0.001" step="0.001" value={orderedWeight} onChange={e=>{setOrderedWeight(e.target.value);setPendingId(null)}}/></label>
     <label>Peso entregue (kg), quando houver<input type="number" min="0.001" step="0.001" value={weight} onChange={e=>{setWeight(e.target.value);setPendingId(null)}}/></label>
     {p?.trackExpiry&&<>
      <label>Lote<input required maxLength={80} value={lot} onChange={e=>{setLot(e.target.value);setPendingId(null)}}/></label>
      <label>Validade<input required type="date" value={expiry} onChange={e=>{setExpiry(e.target.value);setPendingId(null)}}/></label>
     </>}
    </>:<>
     <label>Reserva ({physicalUnit})<input required type="number" min="0" step={physicalUnit==='un'?'1':'0.001'} value={reserve} onChange={e=>{setReserve(e.target.value);setPendingId(null)}}/></label>
     <label>Giro ({physicalUnit})<input required type="number" min="0" step={physicalUnit==='un'?'1':'0.001'} value={rotation} onChange={e=>{setRotation(e.target.value);setPendingId(null)}}/></label>
    </>}
    <label>Observação<input maxLength={240} value={notes} onChange={e=>{setNotes(e.target.value);setPendingId(null)}}/></label>
   </div>
   {mode==='receive'&&orderedWeight!==''&&weight!==''&&<p><strong>Diferença do pedido:</strong> {qty(Number(weight)-Number(orderedWeight))} kg.</p>}
   {mode==='count'&&summary&&<p><strong>Última entrega:</strong> {summary.lastDelivery?qty(summary.lastDelivery.physicalQuantity)+' '+summary.lastDelivery.unit+' · '+fmt(summary.lastDelivery.at):'Nenhuma registrada'}.
   <strong> Entradas desde a contagem anterior:</strong> {summary.entriesSincePrevious===null?'Indisponível':qty(summary.entriesSincePrevious)+' '+summary.unit}.</p>}
   {mode==='count'&&summary?.complete&&previous&&total!==null&&<p><strong>Diferença física estimada:</strong> {qty(previous.total+summary.entriesSincePrevious-total)} {summary.unit}.
   Diferença entre contagens; não significa necessariamente venda ou consumo.</p>}
   {mode==='count'&&summary&&!summary.complete&&<p role="alert">{summary.reason}</p>}
   {mode==='count'&&<p><strong>Total agora:</strong> {total===null?'—':qty(total)+' '+physicalUnit}. <strong>Última contagem:</strong> {previous?qty(previous.total)+' '+summary.unit+' em '+fmt(previous.at):'Não registrada'}</p>}
   <button type="submit" disabled={busy||!productId}>{busy?'Salvando...':mode==='receive'?'Salvar recebimento':'Salvar contagem'}</button>
   {status&&<p role="status">{status}</p>}
  </form>}
  <section className="receiving-card"><div className="inventory-list-header"><h2>Histórico real</h2><button type="button" onClick={load}>Atualizar</button></div>
   {rows.length===0?<p>Nenhum registro salvo nesta unidade.</p>:
    <div className="receiving-scroll"><table className="receiving-table"><thead><tr><th>QUANDO</th><th>PRODUTO</th><th>QUANTIDADE</th><th>RESPONSÁVEL</th></tr></thead><tbody>
     {rows.map(r=><tr key={r.id}><td>{fmt(r.at)}</td><td>{r.productName}</td><td>{mode==='receive'?qty(r.physicalQuantity)+' '+r.unit:qty(r.reserve)+' reserva + '+qty(r.rotation)+' giro ('+r.unit+')'}</td><td>{r.actorUid}</td></tr>)}
    </tbody></table></div>}
  </section>
 </section>;
}
