import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';

async function api(path,action,payload){
 const user=auth.currentUser;
 if(!user)throw Error('Sessão expirada.');
 const token=await user.getIdToken();
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...payload})});
 const data=await res.json();
 if(!res.ok)throw Error(data.message||'Falha na operação.');
 return data;
}

export default function StockActions({product,lots,membership,onUpdated}){
 const [mode,setMode]=useState('');
 const [quantity,setQuantity]=useState('');
 const [location,setLocation]=useState('giro');
 const [reason,setReason]=useState('consumption');
 const [notes,setNotes]=useState('');
 const [rows,setRows]=useState([]);
 const [newLot,setNewLot]=useState(''),[newExpiry,setNewExpiry]=useState('');
 const [pendingId,setPendingId]=useState(null),[saving,setSaving]=useState(false),[status,setStatus]=useState('');
 const admin=membership.role==='admin';
 const manager=admin||membership.role==='manager';
 const b=product.physicalBalance;
 useEffect(()=>{setRows(lots.map(l=>({lot:l.lot,expiryDate:l.expiryDate,
  reserva:String(l.reserva??0),giro:String(l.giro??0)})))},[lots]);
 const change=(fn,value)=>{fn(value);setPendingId(null);setStatus('')};
 const changeLot=(i,field,value)=>{setRows(old=>old.map((r,j)=>i===j?{...r,[field]:value}:r));setPendingId(null)};
 const submit=async e=>{
  e.preventDefault();if(saving||!b||!mode)return;
  setSaving(true);setStatus('');
  const requestId=pendingId||crypto.randomUUID();
  if(!pendingId)setPendingId(requestId);
  try{
   let response;
   if(mode==='dispatch'){
    response=await api('/api/operations/stock','dispatch',{
     productId:product.id,requestId,quantity:Number(quantity),location,reason,notes:notes.trim()});
   }else if(mode==='transfer'){
    response=await api('/api/operations/stock','transfer',{
     productId:product.id,requestId,quantity:Number(quantity),from:location,
     to:location==='reserva'?'giro':'reserva',notes:notes.trim()});
   }else{
    response=await api('/api/operations/stock','reconcile',{
     productId:product.id,requestId,lots:rows.map(l=>({
      lot:l.lot,expiryDate:l.expiryDate,reserva:Number(l.reserva),giro:Number(l.giro)
     }))});
   }
   setPendingId(null);setQuantity('');setNotes('');setStatus(response.message||'Operação registrada.');
   try{await onUpdated?.()}catch{setStatus('Operação salva. Atualize a página para recarregar os dados.')}
  }catch(e){setStatus(e.message)}finally{setSaving(false)}
 };
 if(!manager||!b)return null;
 return <section className="product-detail-panel stock-actions-panel">
  <h2>Movimentar estoque físico</h2>
  <p>Operações auditadas no Firebase. Os saldos legados não são alterados.</p>
  <div className="stock-action-switch">
   <button type="button" className={mode==='dispatch'?'selected':''} onClick={()=>change(setMode,'dispatch')}>Registrar saída</button>
   <button type="button" className={mode==='transfer'?'selected':''} onClick={()=>change(setMode,'transfer')}>Transferir área</button>
   {admin&&product.trackExpiry&&<button type="button" className={mode==='lots'?'selected':''} onClick={()=>change(setMode,'lots')}>Conferir lotes</button>}
  </div>
  {mode&&<form className="stock-action-form" onSubmit={submit}>
   {mode==='lots'?<>
    <p>Distribua o saldo físico atual entre os lotes. A soma deve ser <strong>{b.reserve} {b.unit}</strong> na reserva e <strong>{b.rotation} {b.unit}</strong> no giro. Inclua todos os lotes, mesmo quando zerados.</p>
    {rows.map((l,i)=><div className="stock-lot-row" key={l.lot+'|'+l.expiryDate}>
     <strong>{l.lot} · {l.expiryDate}</strong>
     <div className="inventory-fields">
      <label>Reserva<input required type="number" min="0" step={b.unit==='un'?'1':'0.001'} value={l.reserva} onChange={e=>changeLot(i,'reserva',e.target.value)}/></label>
      <label>Giro<input required type="number" min="0" step={b.unit==='un'?'1':'0.001'} value={l.giro} onChange={e=>changeLot(i,'giro',e.target.value)}/></label>
     </div>
    </div>)}
    <div className="inventory-fields">
     <label>Novo lote<input value={newLot} maxLength={80} onChange={e=>change(setNewLot,e.target.value)}/></label>
     <label>Validade<input type="date" value={newExpiry} onChange={e=>change(setNewExpiry,e.target.value)}/></label>
    </div>
    <button type="button" disabled={!newLot.trim()||!newExpiry||rows.length>=80} onClick={()=>{
     if(rows.some(x=>x.lot===newLot.trim()&&x.expiryDate===newExpiry))return setStatus('Lote já incluído.');
     setRows(old=>[...old,{lot:newLot.trim(),expiryDate:newExpiry,reserva:'0',giro:'0'}]);
     setNewLot('');setNewExpiry('');setPendingId(null)
    }}>Adicionar lote à conferência</button>
   </>:<>
    <div className="inventory-fields">
     <label>Área de origem<select value={location} onChange={e=>change(setLocation,e.target.value)}>
      <option value="giro">Giro</option><option value="reserva">Reserva</option>
     </select></label>
     <label>Quantidade ({b.unit})<input required type="number" min={b.unit==='un'?'1':'0.001'} step={b.unit==='un'?'1':'0.001'} value={quantity} onChange={e=>change(setQuantity,e.target.value)}/></label>
     {mode==='dispatch'&&<label>Motivo<select value={reason} onChange={e=>change(setReason,e.target.value)}>
      <option value="consumption">Consumo / produção</option>
      <option value="loss">Perda / descarte</option>
      <option value="supplier_return">Devolução ao fornecedor</option>
      <option value="adjustment">Ajuste autorizado (saída)</option>
     </select></label>}
     <label>Observação<input maxLength={240} value={notes} onChange={e=>change(setNotes,e.target.value)}/></label>
    </div>
    {mode==='transfer'&&<p>Destino: <strong>{location==='reserva'?'Giro':'Reserva'}</strong>. A transferência não muda o total do produto.</p>}
    {product.trackExpiry&&<p>Para produtos com validade, o sistema utiliza lotes conferidos e ordem de vencimento (FEFO); se os lotes não estiverem conciliados, bloqueará a operação.</p>}
   </>}
   <button className="stock-action-save" type="submit" disabled={saving||mode==='lots'&&rows.length===0}>
    {saving?'Salvando...':mode==='lots'?'Confirmar conciliação dos lotes':mode==='transfer'?'Confirmar transferência':'Confirmar saída'}
   </button>
   {status&&<p role="status">{status}</p>}
  </form>}
 </section>;
}
