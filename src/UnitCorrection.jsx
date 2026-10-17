import React,{useState} from 'react';
import {auth} from './firebase.js';
const units=['un','kg','g','L','ml'];
export default function UnitCorrection({product,membership,onUpdated}){
 const [open,setOpen]=useState(false);
 const [operational,setOperational]=useState(product.operationalUnitOverride||product.unit);
 const [receiving,setReceiving]=useState(product.receivingUnitOverride||product.unit);
 const [reason,setReason]=useState('');
 const [saving,setSaving]=useState(false),[status,setStatus]=useState('');
 if(membership.role!=='admin')return null;
 const submit=async e=>{
  e.preventDefault();if(saving)return;
  if(!window.confirm('Esta alteração NÃO converterá contagens antigas. Será preciso fazer uma nova contagem na unidade corrigida. Confirmar?'))return;
  setSaving(true);setStatus('');
  try{
   const token=await auth.currentUser?.getIdToken();
   if(!token)throw Error('Sessão expirada.');
   const r=await fetch('/api/products/manage',{method:'POST',headers:{
    'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'correctUnits',productId:product.id,
     operationalUnit:operational,receivingUnit:receiving,reason,confirm:'RECONTAR_UNIDADE'})});
   const data=await r.json();if(!r.ok)throw Error(data.message||'Erro ao corrigir unidade.');
   setStatus(data.message);setOpen(false);await onUpdated?.();
  }catch(e){setStatus(e.message)}finally{setSaving(false)}
 };
 return <section className="product-detail-panel stock-actions-panel">
  <h2>Configuração administrativa</h2>
  <p>Corrija a unidade de contagem ou de recebimento deste produto sem modificar saldos anteriores. A correção é auditada e exige nova contagem física.</p>
  <button type="button" onClick={()=>setOpen(v=>!v)}>{open?'Cancelar revisão':'Revisar unidades de medida'}</button>
  {open&&<form className="stock-action-form" onSubmit={submit}>
   <div className="inventory-fields">
    <label>Unidade física (reserva/giro)<select value={operational} onChange={e=>setOperational(e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
    <label>Unidade comercial do pedido<select value={receiving} onChange={e=>setReceiving(e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
    <label>Justificativa<input required minLength={8} maxLength={240} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex.: latinha contada por unidade, não por mililitros"/></label>
   </div>
   <p>Ao salvar, o saldo legado e as contagens históricas permanecem na unidade original. Faça uma nova contagem imediatamente para validar o estoque físico.</p>
   <button type="submit" className="stock-action-save" disabled={saving||reason.trim().length<8}>{saving?'Salvando...':'Confirmar correção da unidade'}</button>
  </form>}
  {status&&<p role="status">{status}</p>}
 </section>;
}
