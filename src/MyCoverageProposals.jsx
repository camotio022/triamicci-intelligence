import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
export default function MyCoverageProposals(){
 const [items,setItems]=useState([]),[requests,setRequests]=useState([]),[requestKind,setRequestKind]=useState('coverage'),[requestDate,setRequestDate]=useState(''),[requestReason,setRequestReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
 async function api(action,extra={}){const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada');const r=await fetch('/api/coverage/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});const d=await r.json();if(!r.ok)throw Error(d.message);return d;}
 async function load(){try{const d=await api('myProposals');setItems(d.proposals||[]);setRequests(d.requests||[]);setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function sendRequest(e){e.preventDefault();if(busy)return;setBusy('request');setError('');setNotice('');try{const d=await api('requestChange',{kind:requestKind,date:requestDate,reason:requestReason.trim()});setNotice(d.message);setRequestReason('');setRequestDate('');await load()}catch(e){setError(e.message)}finally{setBusy('')}}
 async function respond(id,decision){if(!window.confirm(decision==='accepted'?'Confirmar aceite desta proposta?':'Recusar esta proposta?'))return;setBusy(id);try{await api('respond',{id,decision});await load()}catch(e){setError(e.message)}finally{setBusy('')}}
 return <section className="ti-premium-card"><h2>Trocas de turno e coberturas</h2>
 <p>Você pode solicitar cobertura ou troca de turno. A gestão analisa e publica a alteração posteriormente.</p>
 <form className="ti-cov-fields" onSubmit={sendRequest}><label>Tipo de solicitação<select value={requestKind} onChange={e=>setRequestKind(e.target.value)}><option value="coverage">Precisarei de cobertura</option><option value="swap">Solicitar troca de turno</option></select></label><label>Data solicitada<input type="date" required value={requestDate} onChange={e=>setRequestDate(e.target.value)}/></label><label>Motivo<textarea required minLength={10} maxLength={500} value={requestReason} onChange={e=>setRequestReason(e.target.value)}/></label><button type="submit" disabled={busy==='request'||requestReason.trim().length<10}>{busy==='request'?'Enviando…':'Enviar solicitação'}</button></form>
 {notice&&<p role="status">{notice}</p>}
 <h3>Minhas solicitações</h3>{requests.length===0?<p>Nenhuma solicitação registrada.</p>:requests.map(r=><article key={r.id}><strong>{r.date} · {r.kind==='swap'?'Troca de turno':'Cobertura'}</strong><p>Situação: {({pending:'Em análise',approved:'Aprovada pela gestão',rejected:'Recusada'})[r.status]||r.status}</p>{r.note&&<p>Retorno gerencial: {r.note}</p>}</article>)}
 <h3>Convites para dobra</h3><p>O aceite não confirma regularidade da jornada nem publica uma escala. A gerência precisa validar e aprovar a cobertura.</p>
 {error&&<p role="alert">{error}</p>}{items.length===0&&<p>Nenhuma proposta enviada para sua ficha vinculada.</p>}
 {items.map(p=><article key={p.id} style={{borderTop:'1px solid #ddd',padding:'12px 0'}}><strong>{p.date} · {p.first?.start}–{p.first?.end} / {p.second?.start}–{p.second?.end}</strong><p>{p.reason}</p><p>Valor total praticado: {Number(p.practicePayment).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · Situação: {p.status}</p>
 {p.status==='pending_acceptance'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button disabled={busy===p.id} type="button" onClick={()=>respond(p.id,'accepted')}>Aceitar proposta</button><button disabled={busy===p.id} type="button" onClick={()=>respond(p.id,'declined')}>Recusar</button></div>}</article>)}
 </section>;
}
