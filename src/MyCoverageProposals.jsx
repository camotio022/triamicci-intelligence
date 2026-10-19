import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
export default function MyCoverageProposals(){
 const [items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 async function api(action,extra={}){const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada');const r=await fetch('/api/coverage/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});const d=await r.json();if(!r.ok)throw Error(d.message);return d;}
 async function load(){try{const d=await api('myProposals');setItems(d.proposals||[]);setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function respond(id,decision){if(!window.confirm(decision==='accepted'?'Confirmar aceite desta proposta?':'Recusar esta proposta?'))return;setBusy(id);try{await api('respond',{id,decision});await load()}catch(e){setError(e.message)}finally{setBusy('')}}
 return <section className="ti-premium-card"><h2>Minhas propostas de dobra</h2><p>O aceite não confirma regularidade da jornada nem publica uma escala. A gerência precisa validar e aprovar a cobertura.</p>
 {error&&<p role="alert">{error}</p>}{items.length===0&&<p>Nenhuma proposta enviada para sua ficha vinculada.</p>}
 {items.map(p=><article key={p.id} style={{borderTop:'1px solid #ddd',padding:'12px 0'}}><strong>{p.date} · {p.first?.start}–{p.first?.end} / {p.second?.start}–{p.second?.end}</strong><p>{p.reason}</p><p>Valor total praticado: {Number(p.practicePayment).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · Situação: {p.status}</p>
 {p.status==='pending_acceptance'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button disabled={busy===p.id} type="button" onClick={()=>respond(p.id,'accepted')}>Aceitar proposta</button><button disabled={busy===p.id} type="button" onClick={()=>respond(p.id,'declined')}>Recusar</button></div>}</article>)}
 </section>;
}
