import {apiFetch} from './api-fetch.js';
import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth} from './firebase.js';
import './notifications.css';
import {Bell,Check,RefreshCw,Trash2,RotateCcw,Eye} from 'lucide-react';
import {useFeedback} from './FeedbackProvider.jsx';

async function call(action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const res=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Erro na consulta.');return data;
}
const timestamp=value=>value?new Date(value).toLocaleString('pt-BR'):'—';

export default function NotificationCenter({unitId,openProfile,openKitchen}){
 const panelRef=useRef(null),{notify}=useFeedback();
 const [open,setOpen]=useState(false),[items,setItems]=useState([]),[busy,setBusy]=useState(''),[view,setView]=useState('inbox'),[expanded,setExpanded]=useState('');
 const [supplyAlerts,setSupplyAlerts]=useState({signals:[],deliveries:[]});
 const [notificationsReady,setNotificationsReady]=useState(false),[supplyReady,setSupplyReady]=useState(false);
 const load=useCallback(async()=>{try{const data=await call('notifications');setItems(data.notifications||[]);setNotificationsReady(true);return true}catch(e){setNotificationsReady(false);notify(e.message,'error');return false}},[notify]);
 const loadSupply=useCallback(async()=>{try{const user=auth.currentUser;if(!user)return false;const token=await user.getIdToken();const r=await apiFetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'v3Alerts'})});if(!r.ok)throw Error('Consulta indisponível');const d=await r.json();setSupplyAlerts({signals:d.signals||[],deliveries:d.deliveries||[]});setSupplyReady(true);return true}catch{setSupplyReady(false);return false}},[]);
 useUnitLive(unitId,(_initial,changes)=>Promise.all([!changes||changes.includes('notifications')?load():true,!changes||changes.includes('stock')?loadSupply():true]),{domains:['notifications','stock']});
 useEffect(()=>{setItems([]);setView('inbox');setExpanded('');setNotificationsReady(false);setSupplyReady(false)},[unitId]);
 useEffect(()=>{if(!open)return;const outside=e=>{if(!panelRef.current?.contains(e.target))setOpen(false)};const key=e=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}},[open]);
 const mutate=async(id,action)=>{if(busy)return;setBusy(id);try{await call(action,{id});await load();if(action==='notificationDelete')setExpanded('');notify(action==='notificationDelete'?'Aviso enviado à lixeira.':action==='notificationRestore'?'Aviso restaurado.':'Aviso atualizado.','success')}catch(e){notify(e.message,'error')}finally{setBusy('')}};
 const showDetails=async n=>{if(expanded===n.id){setExpanded('');return}setExpanded(n.id);if(!n.openedAt&&!n.deletedAt)await mutate(n.id,'notificationOpen')};
 const active=items.filter(n=>!n.deletedAt),deleted=items.filter(n=>!!n.deletedAt);
 const visible=view==='trash'?deleted:active;
 const unread=active.filter(n=>!n.read).length+supplyAlerts.signals.length;
 return <div className="ti-bell-wrap" ref={panelRef}>
  <button type="button" className="icon-button notification" aria-label={notificationsReady&&supplyReady?'Notificações: '+unread+' não lidas':'Notificações: consulta indisponível ou carregando'} aria-expanded={open} onClick={()=>setOpen(x=>!x)}><Bell size={19}/>{notificationsReady&&supplyReady&&unread>0&&<span className="ti-bell-count">{unread>9?'9+':unread}</span>}</button>
  {open&&<div className="ti-notification-panel" role="region" aria-label="Central de notificações">
   <div className="ti-notification-head"><h2>Notificações</h2><button type="button" onClick={()=>{load();loadSupply()}} aria-label="Atualizar notificações"><RefreshCw size={18}/></button></div>
   <div className="ti-notification-tabs" role="group" aria-label="Exibir notificações"><button type="button" className={view==='inbox'?'selected':''} aria-pressed={view==='inbox'} onClick={()=>setView('inbox')}>Recebidas ({active.length})</button><button type="button" className={view==='trash'?'selected':''} aria-pressed={view==='trash'} onClick={()=>setView('trash')}>Lixeira ({deleted.length})</button></div>
   {view==='inbox'&&(supplyAlerts.signals.length>0||supplyAlerts.deliveries.length>0)&&<section className="ti-supply-alerts" aria-label="Avisos de estoque e entregas"><strong>Cozinha · estoque e entregas</strong>
    {supplyAlerts.signals.slice(0,4).map(a=><p key={a.id}>⚠️ {a.productName} · {a.observation==='missing'?'Possível falta':'Estoque baixo'} ({a.location==='reserva'?'Reserva':'Giro'})</p>)}
    {supplyAlerts.deliveries.slice(0,3).map(d=><p key={d.id}>📦 {d.supplier} · previsão {new Date(d.etaDate+'T12:00:00').toLocaleDateString('pt-BR')}</p>)}
    <button type="button" onClick={()=>{openKitchen?.();setOpen(false)}}>Abrir central de insumos</button>
   </section>}
   {(!notificationsReady||!supplyReady)&&<p role="status">Não foi possível confirmar todos os avisos. Os últimos dados disponíveis podem estar desatualizados.</p>}
   {notificationsReady&&!visible.length&&<p className="ti-notification-empty">{view==='trash'?'A lixeira está vazia.':'Nenhuma notificação profissional nesta lista.'}</p>}
   {visible.map(n=><article className={'ti-notification-item'+(!n.read&&!n.deletedAt?' unread':'')} key={n.id}>
    <strong>{n.title}</strong><p>{n.message}</p><small>Recebida: {timestamp(n.at)}</small>
    <div className="ti-notification-actions">
     <button type="button" disabled={!!busy} aria-expanded={expanded===n.id} onClick={()=>showDetails(n)}><Eye size={15}/>{expanded===n.id?'Ocultar':'Detalhes'}</button>
     {n.deletedAt?<button type="button" disabled={!!busy} onClick={()=>mutate(n.id,'notificationRestore')}><RotateCcw size={15}/> Restaurar</button>:<>
      {!n.read&&<button type="button" disabled={!!busy} onClick={()=>mutate(n.id,'notificationRead')}><Check size={15}/> Lida</button>}
      <button type="button" disabled={!!busy} onClick={()=>mutate(n.id,'notificationDelete')}><Trash2 size={15}/> Excluir</button>
     </>}
    </div>
    {expanded===n.id&&<dl className="ti-notification-detail"><div><dt>Origem</dt><dd>{n.source||'Equipe'}</dd></div><div><dt>Referência</dt><dd>{n.reference||'Não informada'}</dd></div><div><dt>Lida em</dt><dd>{timestamp(n.readAt)}</dd></div><div><dt>Aberta em</dt><dd>{timestamp(n.openedAt)}</dd></div>{n.deletedAt&&<div><dt>Excluída em</dt><dd>{timestamp(n.deletedAt)}</dd></div>}</dl>}
   </article>)}
   <button type="button" className="ti-notification-profile" onClick={()=>{openProfile?.();setOpen(false)}}>Ver minha ficha profissional</button>
  </div>}
 </div>;
}
