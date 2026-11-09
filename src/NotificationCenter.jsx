import React,{createContext,useCallback,useContext,useMemo,useRef,useState} from 'react';
import {apiFetch} from './api-fetch.js';
import {useUnitLive} from './useUnitLive.js';
import {useOperationDay} from './useOperationDay.js';
import {auth} from './firebase.js';
import {Bell,Check,RefreshCw,Trash2,RotateCcw,ChevronDown,ChevronRight,AlertTriangle,Inbox,ShieldCheck,CalendarDays,UserRound,Package} from 'lucide-react';
import {useFeedback} from './FeedbackProvider.jsx';
import {canAccessPage} from '../server/permissions/v31-policy.js';
import {notificationGroups,notificationTime,notificationCategory,notificationDestination} from './notifications-model.js';
import PushSettings from './PushSettings.jsx';
import './notifications.css';
import './notification-module.css';
const NotificationContext=createContext(null);
async function call(action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const response=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Não foi possível consultar os avisos.');return data;
}
export function NotificationProvider({unitId,children}){
 const {notify}=useFeedback(),mutation=useRef(false);
 const [items,setItems]=useState([]),[busy,setBusy]=useState(''),[refreshing,setRefreshing]=useState(false);
 const [supplyAlerts,setSupplyAlerts]=useState({signals:[],deliveries:[]});
 const [notificationsReady,setNotificationsReady]=useState(false),[supplyReady,setSupplyReady]=useState(false),[loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{try{const data=await call('notifications');setItems(data.notifications||[]);setNotificationsReady(true);return true}catch{setNotificationsReady(false);return false}finally{setLoaded(true)}},[]);
 const loadSupply=useCallback(async()=>{try{
  const user=auth.currentUser;if(!user)return false;const token=await user.getIdToken();
  const response=await apiFetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'v3Alerts'})});
  if(!response.ok)throw Error('Consulta indisponível');const data=await response.json();setSupplyAlerts({signals:data.signals||[],deliveries:data.deliveries||[]});setSupplyReady(true);return true;
 }catch{setSupplyReady(false);return false}},[]);
 useUnitLive(unitId,(_initial,changes)=>Promise.all([!changes||changes.includes('notifications')?load():true,!changes||changes.includes('stock')?loadSupply():true]),{domains:['notifications','stock']});
 const refresh=async()=>{if(refreshing)return;setRefreshing(true);try{await Promise.all([load(),loadSupply()])}finally{setRefreshing(false)}};
 const mutate=async(id,action)=>{
  if(mutation.current)return false;mutation.current=true;setBusy(id);
  try{await call(action,{id});await load();if(action!=='notificationOpen')notify(action==='notificationDelete'?'Aviso enviado à lixeira.':action==='notificationRestore'?'Aviso restaurado.':'Aviso marcado como lido.','success');return true}
  catch(e){notify(e.message,'error');return false}finally{mutation.current=false;setBusy('')}
 };
 const value={unitId,items,busy,supplyAlerts,notificationsReady,supplyReady,loaded,refreshing,refresh,mutate};
 return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
const useNotifications=()=>useContext(NotificationContext);
export default function NotificationCenter({onOpen,active=false}){
 const data=useNotifications();if(!data)return null;
 const unread=data.items.filter(item=>!item.deletedAt&&!item.read).length;
 const stockCount=data.supplyAlerts.signals.length+data.supplyAlerts.deliveries.length,total=unread+stockCount;
 const ready=data.notificationsReady&&data.supplyReady;
 return <div className="ti-bell-wrap"><button type="button" className="icon-button notification" aria-label={ready?`Abrir notificações: ${unread} não lidas e ${stockCount} alertas da cozinha`:'Abrir notificações: consulta carregando ou indisponível'} aria-current={active?'page':undefined} onClick={onOpen}><Bell size={19}/>{ready&&total>0&&<span className="ti-bell-count">{total>9?'9+':total}</span>}</button></div>;
}
const icons={Acesso:ShieldCheck,Escala:CalendarDays,Cozinha:Package,Equipe:UserRound};
const fullTime=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'};
export function NotificationsPage({role,onNavigate}){
 const data=useNotifications(),today=useOperationDay();
 const [view,setView]=useState('inbox'),[onlyUnread,setOnlyUnread]=useState(false),[expanded,setExpanded]=useState(null);
 const titleRef=useRef(null);
 React.useEffect(()=>{titleRef.current?.focus()},[]);
 const active=data.items.filter(item=>!item.deletedAt),deleted=data.items.filter(item=>!!item.deletedAt),unread=active.filter(item=>!item.read).length;
 const visible=(view==='trash'?deleted:active).filter(item=>view==='trash'||!onlyUnread||!item.read||expanded===item.id);
 const groups=useMemo(()=>notificationGroups(visible),[data.items,view,onlyUnread,expanded,today]);
 const showDetails=async item=>{if(expanded===item.id){setExpanded(null);return}setExpanded(item.id);if(!item.openedAt&&!item.deletedAt)await data.mutate(item.id,'notificationOpen')};
 const changeView=next=>{setView(next);setExpanded(null);setOnlyUnread(false)};
 const change=async(item,action)=>{if(await data.mutate(item.id,action)){if(action==='notificationDelete'||action==='notificationRestore')setExpanded(null)}};
 const alertCount=data.supplyAlerts.signals.length,deliveries=data.supplyAlerts.deliveries.length;
 return <section className="ti-notify-module" aria-labelledby="notifications-title">
  <header className="ti-notify-banner"><div className="ti-notify-heading"><span className="ti-notify-brand-icon"><Bell size={20} aria-hidden="true"/></span><div><h1 id="notifications-title" tabIndex={-1} ref={titleRef}>Notificações</h1><p>{data.notificationsReady?`${unread} não lida${unread===1?'':'s'}`:'Consultando avisos'}</p></div></div><button type="button" className="ti-notify-refresh" aria-label="Atualizar notificações" aria-busy={data.refreshing} disabled={data.refreshing} onClick={data.refresh}><RefreshCw size={18} aria-hidden="true"/></button></header>
  <div className="ti-notify-toolbar"><div className="ti-notify-tabs" role="group" aria-label="Exibir notificações"><button type="button" aria-pressed={view==='inbox'} onClick={()=>changeView('inbox')}>Recebidas <span>{active.length}</span></button><button type="button" aria-pressed={view==='trash'} onClick={()=>changeView('trash')}>Lixeira <span>{deleted.length}</span></button></div>{view==='inbox'&&<button type="button" className="ti-notify-unread" aria-pressed={onlyUnread} onClick={()=>{setOnlyUnread(value=>!value);setExpanded(null)}}>Não lidas</button>}</div>
  <PushSettings unitId={data.unitId}/>
  {view==='inbox'&&(alertCount>0||deliveries>0)&&<button type="button" className="ti-notify-supply" onClick={()=>onNavigate('kitchen-v3')}><span className="ti-notify-stock-icon"><AlertTriangle size={19} aria-hidden="true"/></span><span><strong>Estoque e entregas</strong><small>{alertCount} alerta{alertCount===1?'':'s'} · {deliveries} entrega{deliveries===1?'':'s'} prevista{deliveries===1?'':'s'}</small></span><ChevronRight size={18} aria-hidden="true"/></button>}
  {data.loaded&&(!data.notificationsReady||!data.supplyReady)&&<p className="ti-notify-warning" role="status">Consulta incompleta. Os últimos avisos podem estar desatualizados. <button type="button" onClick={data.refresh} disabled={data.refreshing}>Tentar novamente</button></p>}
  {!data.loaded?<p className="ti-notify-empty" role="status">Carregando avisos…</p>:visible.length===0&&data.notificationsReady?<div className="ti-notify-empty"><Inbox size={26} aria-hidden="true"/><strong>{view==='trash'?'Lixeira vazia':onlyUnread?'Nenhum aviso não lido':'Você está em dia'}</strong><p>{view==='trash'?'Avisos excluídos aparecem aqui.':'Seus avisos aparecerão nesta lista.'}</p></div>:null}
  <div className="ti-notify-groups">{groups.map(group=><section key={group.key} aria-label={group.label}><h2 className="ti-notify-date">{group.label}</h2><div className="ti-notify-list">{group.items.map(item=>{
   const category=notificationCategory(item),Icon=icons[category],isOpen=expanded===item.id,target=notificationDestination(item);
   return <article key={item.id} className={'ti-notify-row'+(!item.read&&!item.deletedAt?' is-unread':'')}>
    <button type="button" className="ti-notify-summary" aria-expanded={isOpen} aria-controls={'notice-'+item.id} onClick={()=>showDetails(item)} disabled={!!data.busy}><span className="ti-notify-row-icon"><Icon size={18} aria-hidden="true"/></span><span className="ti-notify-copy"><span className="ti-notify-row-meta"><span>{category}</span><time dateTime={item.at||undefined}>{notificationTime(item.at)}</time></span><strong>{item.title}</strong><span className="ti-notify-preview">{item.message}</span></span><ChevronDown className={isOpen?'is-expanded':''} size={17} aria-hidden="true"/></button>
    {isOpen&&<div className="ti-notify-expanded" id={'notice-'+item.id}><p>{item.message}</p><dl><div><dt>Recebida</dt><dd>{fullTime(item.at)}</dd></div><div><dt>Origem</dt><dd>{item.source||'Equipe'}</dd></div>{item.reference&&<div><dt>Referência</dt><dd>{item.reference}</dd></div>}{item.openedAt&&<div><dt>Aberta</dt><dd>{fullTime(item.openedAt)}</dd></div>}{item.readAt&&<div><dt>Lida</dt><dd>{fullTime(item.readAt)}</dd></div>}{item.deletedAt&&<div><dt>Excluída</dt><dd>{fullTime(item.deletedAt)}</dd></div>}</dl><div className="ti-notify-row-actions">
      {item.deletedAt?<button type="button" disabled={!!data.busy} onClick={()=>change(item,'notificationRestore')}><RotateCcw size={16} aria-hidden="true"/>Restaurar</button>:<>
       {canAccessPage(role,target)&&<button type="button" onClick={()=>onNavigate(target)}><ChevronRight size={16} aria-hidden="true"/>Abrir área</button>}
       {!item.read&&<button type="button" disabled={!!data.busy} onClick={()=>change(item,'notificationRead')}><Check size={16} aria-hidden="true"/>Marcar lida</button>}
       <button type="button" disabled={!!data.busy} onClick={()=>change(item,'notificationDelete')}><Trash2 size={16} aria-hidden="true"/>Excluir</button>
      </>}
     </div></div>}
   </article>;
  })}</div></section>)}</div>
 </section>;
}
