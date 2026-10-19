import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
async function call(path,action,args){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Sessão expirada.');
 const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...args})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Falha ao consultar.');return data;
}
export default function ManagerPackageReview({productId,conferenceId,opened=0,physicalUnit}){
 const [lots,setLots]=useState([]),[allot,setAllot]=useState({}),[measurements,setMeasurements]=useState([]),[review,setReview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;setLots([]);setReview(null);setAllot({});setMeasurements(Array.from({length:Math.min(opened,100)},()=>''));if(!productId||!conferenceId)return;
 call('/api/operations/stock','lots',{productId}).then(x=>{if(alive)setLots(x.lots||[])}).catch(e=>{if(alive)setError(e.message)});
 return()=>{alive=false}},[productId,conferenceId,opened]);
 const preview=async()=>{
  setBusy(true);setError('');setReview(null);
  try{
   const openedMeasurements=measurements.some(v=>v===''||!Number.isFinite(Number(v))||Number(v)<=0)?[]:measurements.map(v=>({quantity:Number(v),unit:physicalUnit}));
   const lotAllocations=Object.entries(allot).filter(([,v])=>v!==''&&Number(v)>0).map(([id,v])=>({id,quantity:Number(v)}));
   const response=await call('/api/operations/package-review','preview',{productId,conferenceId,openedMeasurements,lotAllocations});
   setReview(response.review);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 return <section className="ti-receive-stage" aria-label="Revisão gerencial de lotes">
  <h3>Revisão gerencial da conferência</h3>
  <p>Prévia apenas. Não altera estoque. Informe somente quantidades medidas e identificadas na área da conferência.</p>
  {opened>0&&measurements.map((v,i)=><label key={i}>Restante medido na embalagem aberta {i+1} ({physicalUnit})<input type="number" min="0.001" step="any" value={v} onChange={e=>setMeasurements(old=>old.map((x,j)=>i===j?e.target.value:x))}/></label>)}
  {lots.length>0&&<fieldset><legend>Quantidades encontradas por lote ({physicalUnit})</legend>{lots.map(l=><label key={l.id}>Lote {l.lot||l.id} · validade {l.expiryDate||'a conferir'}<input type="number" min="0" step="any" value={allot[l.id]||''} onChange={e=>setAllot(s=>({...s,[l.id]:e.target.value}))}/></label>)}</fieldset>}
  <button type="button" disabled={busy} onClick={preview}>{busy?'Conferindo...':'Verificar conciliação, sem atualizar o estoque'}</button>
  {error&&<p role="alert">{error}</p>}
  {review&&<div className="ti-receive-summary">
   <strong>{review.readyForHumanReview?'Prévia pronta para revisão':'Há pendências para a conciliação'}</strong>
   <span>Área: {review.area||'—'} · Quantidade calculada: {review.ok?review.quantity+' '+review.unit:'indeterminada'}</span>
   <span>Saldo de referência: {review.referenceBalance??'—'} {review.referenceUnit||''}</span>
   <span>Lotes: {review.lotStatus||'—'}</span>
   {review.blockers?.length>0&&<span>Impedimentos: {review.blockers.join(', ')}</span>}
   <strong>Nenhuma atualização de saldo está habilitada nesta tela.</strong>
  </div>}
 </section>;
}
