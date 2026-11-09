import React,{useEffect,useMemo,useState} from 'react';
import {X,Truck,ClipboardCheck} from 'lucide-react';
import {auth} from './firebase.js';
import {apiFetch} from './api-fetch.js';
import {isManagement} from '../server/permissions/v31-policy.js';
import './storage-manager.css';
const codeOf=p=>p?.operationalUnitOverride||p?.profile?.countUnit||p?.operationalUnit||p?.unit||'un';
async function api(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const response=await apiFetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Recebimento indisponível.');return data;
}
export default function StorageReceiving({membership,products,storages,links,onClose,onChange}){
 const [list,setList]=useState({receipts:[],pending:[],orders:[]}),[supplier,setSupplier]=useState(''),[orderId,setOrderId]=useState(''),[productId,setProductId]=useState(''),[quantity,setQuantity]=useState(''),[lot,setLot]=useState(''),[expiry,setExpiry]=useState(''),[notes,setNotes]=useState(''),[reason,setReason]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[showForm,setShowForm]=useState(false);
 const manager=isManagement(membership.role);
 const configured=products.filter(p=>p.status==='active'&&links.some(l=>l.productId===p.id&&storages.some(s=>s.id===l.primaryStorageId)));
 const selected=configured.find(p=>p.id===productId);
 const stock=storages.find(s=>s.id===links.find(l=>l.productId===productId)?.primaryStorageId);
 const load=async()=>{setLoading(true);try{const next=await api('storageReceiptList');setList(next)}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{let active=true;api('storageReceiptList').then(x=>{if(active)setList(x)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const submit=async()=>{if(busy||!selected||!stock)return;setBusy(true);setError('');try{const result=await api('storageReceiptInspect',{requestId:crypto.randomUUID(),supplier,orderId:orderId||null,notes,lines:[{productId,storageId:stock.id,stockQuantity:Number(quantity.replace(',','.')),stockUnit:codeOf(selected),lot,expiryDate:expiry}]});setMessage(result.message);setShowForm(false);setQuantity('');setProductId('');setNotes('');await load();onChange?.(result.message)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const decide=async(id,decision)=>{setBusy(true);setError('');try{const r=await api(decision==='approve'?'storageReceiptApprove':'storageReceiptReject',{requestId:id,reason:decision==='reject'?(reason[id]||''):''});setMessage(r.message);await load();onChange?.(r.message)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <div className="ti-storage-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-label="Recebimento da nova operação" className="ti-storage-sheet ti-storage-receiving">
  <div className="ti-storage-sheet-head"><h2><Truck size={20}/> Recebimento</h2><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
  <p>Mercadorias conferidas ficam disponíveis para preparação antes da aprovação do gerente. O saldo só é definido por contagem validada.</p>
  <button type="button" className="ti-storage-primary" onClick={()=>setShowForm(v=>!v)}>{showForm?'Fechar cadastro':'＋ Nova entrega'}</button>
  {showForm&&<div className="ti-storage-inline-form">
   <label>Fornecedor<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Nome do fornecedor" maxLength={100}/></label>
   <label>Pedido associado<select value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">Entrega sem pedido (justificar)</option>{list.orders?.map(o=><option key={o.id} value={o.id}>{o.supplier||'Pedido'} · {o.id.slice(0,8)}</option>)}</select></label>
   <label>Insumo<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecionar insumo</option>{configured.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {selected&&<p className="ti-storage-hint">Destino definido: {stock?.name||'Não configurado'} · {stock?.area==='reserva'?'Reserva':'Giro'} · Unidade: {codeOf(selected)}</p>}
   <label>Quantidade recebida<input inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder={'Quantidade '+(selected?codeOf(selected):'')}/></label>
   {selected?.trackExpiry&&<><label>Lote<input value={lot} onChange={e=>setLot(e.target.value)} placeholder="Lote do fornecedor" maxLength={80}/></label><label>Validade<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label></>}
   <label>{orderId?'Observações (opcional)':'Justificativa obrigatória'}<input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={400} placeholder="Ex.: entrega fora do pedido previsto"/></label>
   <button className="ti-storage-primary" disabled={busy||supplier.trim().length<2||!productId||!stock||!(Number(quantity.replace(',','.'))>0)||!orderId&&notes.trim().length<8||selected?.trackExpiry&&(!lot.trim()||!expiry)} onClick={submit}>{busy?'Registrando…':'Registrar conferência'}</button>
  </div>}
  <h3 className="ti-storage-subtitle">Aguardando gerência <span>{list.pending?.length||0}</span></h3>
  {loading?<p>Consultando entregas…</p>:<div className="ti-storage-receipts">{list.pending?.length===0?<p>Nenhum recebimento pendente nesta nova operação.</p>:list.pending?.map(r=><article key={r.id}><div><strong>{r.supplier}</strong><small>{r.lines?.map(l=>l.productName+' · '+l.stockQuantity+' '+l.stockUnit).join(', ')}</small><small>Registrado em {r.createdAt?new Date(r.createdAt).toLocaleDateString('pt-BR'):'—'}</small></div>{manager&&<div className="ti-storage-receipt-actions"><button disabled={busy} onClick={()=>decide(r.id,'approve')}>Aprovar</button><button disabled={busy} onClick={()=>setReason(old=>({...old,[r.id]:old[r.id]===undefined?'':undefined}))}>Recusar</button></div>}{manager&&reason[r.id]!==undefined&&<div className="ti-storage-inline-form"><label>Motivo da recusa<input value={reason[r.id]} onChange={e=>setReason(old=>({...old,[r.id]:e.target.value}))} maxLength={240}/></label><button disabled={busy||(reason[r.id]||'').trim().length<8} onClick={()=>decide(r.id,'reject')}>Confirmar recusa</button></div>}</article>)}</div>}
  {message&&<p className="ti-storage-notice" role="status">{message}</p>}{error&&<div className="ti-storage-error" role="alert">{error}</div>}
  <p className="ti-storage-disclaimer">Recebimentos desta nova estrutura são separados dos registros antigos. Aprovação administrativa não duplica saldo.</p>
 </section></div>;
}
