import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth} from './firebase.js';
import './notifications.css';
import {Bell,Check,RefreshCw} from 'lucide-react';
import {useFeedback} from './FeedbackProvider.jsx';
async function call(action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const res=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Erro na consulta.');return data;
}
export default function NotificationCenter({openProfile,openKitchen}){
 const panelRef=useRef(null);
 const {notify}=useFeedback(),[open,setOpen]=useState(false),[items,setItems]=useState([]),[busy,setBusy]=useState(false),[supplyAlerts,setSupplyAlerts]=useState({signals:[],deliveries:[]});
 const load=useCallback(async()=>{try{const data=await call('notifications');setItems(data.notifications||[])}catch(e){notify(e.message,'error')}},[notify]);
 useEffect(()=>{load();const poll=()=>{if(document.visibilityState==='visible')load()};const timer=setInterval(poll,15000);window.addEventListener('focus',poll);return()=>{clearInterval(timer);window.removeEventListener('focus',poll)}},[load]);
 useEffect(()=>{if(!open)return;const outside=e=>{if(!panelRef.current?.contains(e.target))setOpen(false)};const key=e=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}},[open]);
 useEffect(()=>{let live=true;const loadSupply=async()=>{try{const user=auth.currentUser;if(!user)return;const token=await user.getIdToken();
  const r=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'v3Alerts'})});
  if(r.ok){const d=await r.json();if(live)setSupplyAlerts({signals:d.signals||[],deliveries:d.deliveries||[]})}}catch{ /* indisponibilidade não bloqueia outras notificações */ }};
  loadSupply();const timer=setInterval(()=>{if(document.visibilityState==='visible')loadSupply()},60000);return()=>{live=false;clearInterval(timer)}},[]);
 const read=async id=>{setBusy(true);try{await call('notificationRead',{id});setItems(old=>old.map(x=>x.id===id?{...x,read:true}:x))}catch(e){notify(e.message,'error')}finally{setBusy(false)}};
 const unread=items.filter(x=>!x.read).length+supplyAlerts.signals.length;
 return <div className="ti-bell-wrap" ref={panelRef}>
  <button type="button" className="icon-button notification" aria-label={'Notificações: '+unread+' não lidas'} aria-expanded={open} onClick={()=>{setOpen(x=>!x);load()}}><Bell size={19}/>{unread>0&&<span className="ti-bell-count">{unread>9?'9+':unread}</span>}</button>
  {open&&<div className="ti-notification-panel">
   <div className="ti-notification-head"><h2>Notificações</h2><button type="button" onClick={load} aria-label="Atualizar notificações"><RefreshCw size={18}/></button></div>
   {(supplyAlerts.signals.length>0||supplyAlerts.deliveries.length>0)&&<section className="ti-supply-alerts" aria-label="Avisos de estoque e entregas"><strong>Cozinha · estoque e entregas</strong>
     {supplyAlerts.signals.slice(0,4).map(a=><p key={a.id}>⚠️ {a.productName} · {a.observation==='missing'?'Possível falta':'Estoque baixo'} ({a.location==='reserva'?'Reserva':'Giro'})</p>)}
     {supplyAlerts.deliveries.slice(0,3).map(d=><p key={d.id}>📦 {d.supplier} · previsão {new Date(d.etaDate+'T12:00:00').toLocaleDateString('pt-BR')}</p>)}
     <button type="button" onClick={()=>{openKitchen?.();setOpen(false)}}>Abrir central de insumos</button>
    </section>}
   {!items.length&&!supplyAlerts.signals.length&&!supplyAlerts.deliveries.length?<p>Nenhum aviso profissional até agora.</p>:items.map(n=><article className={'ti-notification-item'+(!n.read?' unread':'')} key={n.id}>
    <strong>{n.title}</strong><p>{n.message}</p><small>{n.at?new Date(n.at).toLocaleString('pt-BR'):'—'}</small>
    {!n.read&&<button disabled={busy} type="button" onClick={()=>read(n.id)}><Check size={15}/> Marcar como lida</button>}
   </article>)}
   <button type="button" className="ti-notification-profile" onClick={()=>{openProfile();setOpen(false)}}>Ver minha ficha profissional</button>
  </div>}
 </div>;
}
