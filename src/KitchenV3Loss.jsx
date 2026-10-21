import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import {isManagement} from '../server/permissions/v31-policy.js';
async function api(action,extra={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const res=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Operação indisponível.');return data;
}
export default function KitchenV3Loss({membership,products,onChange}){
 const manager=isManagement(membership.role),{notify}=useFeedback();
 const [productId,setProductId]=useState(''),[location,setLocation]=useState('reserva'),[quantity,setQuantity]=useState(''),[reason,setReason]=useState('');
 const [pending,setPending]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewId,setReviewId]=useState(''),[reviewReason,setReviewReason]=useState('');
 const active=products.filter(p=>p.status==='active'&&p.profile?.controlMode==='quantitative');
 const product=active.find(p=>p.id===productId),unit=product?.profile?.countUnit||'un';
 const integer=['un','pacote','porcao','duzia'].includes(unit);
 async function refresh(){if(!manager)return;try{const r=await api('v3LossPending');setPending(r.losses||[])}catch(e){setError(e.message)}}
 useEffect(()=>{refresh()},[manager]);
 const submit=async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const result=await api('v3LossReport',{requestId:crypto.randomUUID(),productId,location,quantity:Number(quantity),reason:reason.trim()});
   notify(result.message,'success');setQuantity('');setReason('');await refresh();await onChange?.()}
  catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const decide=async(id,decision)=>{if(busy)return;if(decision==='v3LossReject'&&reviewReason.trim().length<8){setError('Explique a rejeição com ao menos oito caracteres.');return}
  setBusy(true);setError('');
  try{const result=await api(decision,{reportId:id,...(decision==='v3LossReject'?{reason:reviewReason.trim()}:{})});
   notify(result.message,'success');setReviewId('');setReviewReason('');await refresh();await onChange?.()}
  catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 return <section className="v3-card v3-workflow" aria-label="Registrar perdas e avarias">
  <h2>Perdas, avarias e vencimentos</h2>
  <p>Qualquer colaborador pode comunicar uma perda real. A baixa só acontece depois da aprovação da gestão.</p>
  {error&&<p className="v3-error" role="alert">{error}</p>}
  <form className="v3-form" onSubmit={submit}>
   <label>Insumo<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecione um insumo</option>{active.map(p=><option key={p.id} value={p.id}>{p.profile?.displayName||p.name}</option>)}</select></label>
   <label>Onde ocorreu?<select value={location} onChange={e=>setLocation(e.target.value)}>{(product?.profile?.locations||['reserva','giro']).map(x=><option key={x} value={x}>{x==='reserva'?'Reserva':'Giro'}</option>)}</select></label>
   <label>Quantidade perdida ({unit})<input type="number" required min={integer?'1':'.001'} step={integer?'1':'.001'} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <label>Motivo e ocorrência<textarea required minLength={8} maxLength={240} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex.: mercadoria avariada na abertura da embalagem"/></label>
   <button type="submit" disabled={busy||!productId}>{busy?'Registrando…':'Comunicar perda para aprovação'}</button>
  </form>
  {manager&&<section className="v3-approval-list"><h3>Perdas aguardando aprovação</h3><p>Confirme quantidade, local e ocorrência antes de dar baixa no estoque.</p><button type="button" className="v3-secondary" onClick={refresh}>Atualizar pendências</button>
  {pending.length===0?<p>Nenhuma perda aguardando avaliação.</p>:pending.map(item=><article key={item.id} className="v3-card">
   <strong>{products.find(x=>x.id===item.productId)?.name||'Insumo'}</strong>
   <p>{item.quantity} {item.unit} · {item.location}</p><p>{item.reason}</p>
   <button type="button" disabled={busy} onClick={()=>decide(item.id,'v3LossApprove')}>Aprovar baixa do estoque</button>
   <button type="button" className="v3-secondary" aria-expanded={reviewId===item.id} disabled={busy} onClick={()=>{setReviewId(x=>x===item.id?'':item.id);setReviewReason('')}}>Rejeitar</button>
   {reviewId===item.id&&<form className="v3-form" onSubmit={e=>{e.preventDefault();decide(item.id,'v3LossReject')}}><label>Justificativa da rejeição<textarea required minLength={8} maxLength={240} value={reviewReason} onChange={e=>setReviewReason(e.target.value)}/></label><button type="submit" disabled={busy||reviewReason.trim().length<8}>Confirmar rejeição</button></form>}
  </article>)}</section>}
 </section>;
}
