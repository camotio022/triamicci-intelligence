import Checklists from './Checklists.jsx';
import {apiFetch} from './api-fetch.js';
import {readViewCache,writeViewCache} from './fastCache.js';
import React, { useState, useEffect, useRef } from 'react';
import {FeedbackProvider} from './FeedbackProvider.jsx';
import NotificationCenter,{NotificationProvider,NotificationsPage} from './NotificationCenter.jsx';
import MyProfessionalProfile from './MyProfessionalProfile.jsx';
import MyAttendanceV31 from './MyAttendanceV31.jsx';
import StockConference from './StockConference.jsx';
import PhysicalStock from './PhysicalStock.jsx';
import DailyInventory from './DailyInventory.jsx';
import AuthGate from './AuthGate.jsx';
import TeamManagement from './TeamManagement.jsx';
import PeopleHub from './PeopleHub.jsx';
import TriamicciMentor from './TriamicciMentor.jsx';
import MasterRegistry from './MasterRegistry.jsx';
import TeamProfiles from './TeamProfiles.jsx';
import SchedulePlanner from './SchedulePlanner.jsx';
import LeaveRequests from './LeaveRequests.jsx';
import TeamMural from './TeamMural.jsx';
import LabelsManager from './LabelsManager.jsx';
import Inventory from './Inventory.jsx';
import KitchenHome from './KitchenHome.jsx';
import Production from './Production.jsx';
import KitchenV3 from './KitchenV3.jsx';
import StorageManager from './StorageManager.jsx';
import './kitchen.css';
import './v4-foundation.css';
import {isManagement,canAccessPage} from '../server/permissions/v31-policy.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import Dashboard from './Dashboard.jsx';
import TriamicciLogo from './TriamicciLogo.jsx';
import SidebarPremium from './SidebarPremium.jsx';
import {auth,isIndependentSession} from './firebase.js';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LayoutDashboard, Package, TrendingUp, Wallet, Bell, Search, ChevronDown, ArrowUpRight, ArrowDownRight, AlertTriangle, Clock3, Boxes, CircleDollarSign, Menu, Users, X, BookOpen } from 'lucide-react';

const consumption = [
  { day: 'Seg', saida: 420, entrada: 260 }, { day: 'Ter', saida: 360, entrada: 310 },
  { day: 'Qua', saida: 510, entrada: 280 }, { day: 'Qui', saida: 390, entrada: 350 },
  { day: 'Sex', saida: 620, entrada: 410 }, { day: 'Sáb', saida: 720, entrada: 490 },
  { day: 'Dom', saida: 560, entrada: 300 },
];
const categories = [{name:'Proteínas',value:38},{name:'Hortifruti',value:26},{name:'Laticínios',value:20},{name:'Outros',value:16}];
const items = [
  {name:'Peito de frango',category:'Proteínas',stock:'4,2 kg',status:'Estoque baixo',tone:'warning'},
  {name:'Queijo mussarela',category:'Laticínios',stock:'2,8 kg',status:'Estoque baixo',tone:'warning'},
  {name:'Tomate italiano',category:'Hortifruti',stock:'12 kg',status:'Disponível',tone:'good'},
  {name:'Óleo de soja',category:'Mercearia',stock:'1,5 L',status:'Crítico',tone:'danger'},
  {name:'Batata congelada',category:'Congelados',stock:'18 kg',status:'Disponível',tone:'good'},
];
const money = n => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});

function Metric({icon:Icon,label,value,change,positive=true,detail}) {
  return <article className="metric-card">
    <div className="metric-top"><span className="metric-icon"><Icon size={19}/></span><span className={positive?'change positive':'change negative'}>{positive?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {change}</span></div>
    <p className="metric-label">{label}</p><strong className="metric-value">{value}</strong><p className="metric-detail">{detail}</p>
  </article>;
}

export default function App() {
 return <FeedbackProvider><AuthGate>{({ user, membership, logout }) => <Workspace key={user.uid+":"+membership.unitId+":"+membership.role} user={user} membership={membership} logout={logout} />}</AuthGate></FeedbackProvider>;
}

export function Workspace(props) {
 return <NotificationProvider key={props.user.uid+':'+props.membership.unitId+':'+props.membership.role} unitId={props.membership.unitId}><WorkspaceContent {...props}/></NotificationProvider>;
}
function WorkspaceContent({ user, membership, logout }) {
 const routes=['storages','notifications','checklists','kitchen','mural','production','receiving','count','inventory','daily-inventory','history','catalog','kitchen-v3','my-profile','people','master-registry','team','skills','shifts','schedule-planning','leave-requests','labels','mentor'];
 const initialRoute=()=>{const params=new URLSearchParams(window.location.search);const target=params.get('page');if(params.get('pushUnit')&&params.get('pushUnit')!==membership.unitId)return 'kitchen';return routes.includes(target)&&canAccessPage(membership.role,target)?target:'kitchen'};
 const [requestedPage, setPage] = useState(initialRoute);
 const [productionTaskId,setProductionTaskId]=useState(null);
 const page=canAccessPage(membership.role,requestedPage)?requestedPage:'kitchen';
 const [today,setToday]=useState(()=>restaurantDay());
 useEffect(()=>{const refresh=()=>setToday(restaurantDay());const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[]);
 const [menuOpen, setMenuOpen] = useState(false);
 // Coordinate app chrome across mobile platforms. iOS standalone may retain its
 // installation-time native status-bar appearance; never overlay system icons.
 useEffect(()=>{
  const mobile=window.matchMedia('(max-width: 760px)');
  const root=document.documentElement;
  const theme=document.querySelector('meta[name="theme-color"]');
  const initialTheme=theme?.getAttribute('content')||'#f7f8fb';
  const sync=()=>{
   const opened=mobile.matches&&menuOpen;
   root.classList.toggle('ti-drawer-open',opened);
   if(theme)theme.setAttribute('content',mobile.matches?(opened?'#ffffff':'#f7f8fb'):initialTheme);
  };
  sync();
  mobile.addEventListener?.('change',sync);
  return()=>{
   mobile.removeEventListener?.('change',sync);
   root.classList.remove('ti-drawer-open');
   if(theme)theme.setAttribute('content',initialTheme);
  };
 },[menuOpen]);
 // A mobile drawer is modal: prevent background scroll, close on Escape and restore focus.
 const menuTriggerRef=useRef(null);
 useEffect(()=>{
  if(!menuOpen)return;
  const onEscape=e=>{if(e.key==='Escape'){e.preventDefault();setMenuOpen(false)}};
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  document.addEventListener('keydown',onEscape);
  return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onEscape);menuTriggerRef.current?.focus()};
 },[menuOpen]);
 const [mobileExtraOpen,setMobileExtraOpen]=useState(false);
 const [mentorHint,setMentorHint]=useState(null);
 const [mentorSource,setMentorSource]=useState(null);
 const [actionProductId,setActionProductId] = useState(null);
 const openProductAction=(target,id)=>{navigate(target,id)};
 const [profileOpen, setProfileOpen] = useState(false);
 const profileMenuRef=useRef(null);
 const [avatar,setAvatar]=useState(()=>readViewCache(user.uid,membership.unitId,'avatar')??user.photoURL??null);
 useEffect(()=>{
  let active=true;
  const cached=readViewCache(user.uid,membership.unitId,'avatar');
  setAvatar(cached??user.photoURL??null);
  const refresh=async()=>{try{
   const token=await auth.currentUser?.getIdToken();if(!token)return;
   const response=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'myProfile'})});
   if(response.ok){const data=await response.json();if(active){
    const next=data.avatar||null;setAvatar(next);
    if(!next||next.length<160000)writeViewCache(user.uid,membership.unitId,'avatar',next,600000);
   }}
  }catch{/* Sem bloquear navegação por erro na foto. */}};
  if(cached===null)refresh();
  const onUpdate=()=>refresh();
  window.addEventListener('ti-avatar-updated',onUpdate);
  return()=>{active=false;window.removeEventListener('ti-avatar-updated',onUpdate)};
 },[user.uid,membership.unitId,user.photoURL]);
 useEffect(()=>{if(!profileOpen)return;const outside=e=>{if(!profileMenuRef.current?.contains(e.target))setProfileOpen(false)};const escape=e=>{if(e.key==='Escape')setProfileOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[profileOpen]);
 useEffect(()=>{const go=e=>{if(['master-registry','kitchen-v3'].includes(e.detail))navigate(e.detail)};window.addEventListener('ti-navigate',go);return()=>window.removeEventListener('ti-navigate',go)},[membership.unitId,membership.role]);
 const navigate = (nextPage,productId=null) => {if(!routes.includes(nextPage)||!canAccessPage(membership.role,nextPage))return;window.history.replaceState({...window.history.state,scroll:window.scrollY},'');const url=new URL(window.location.href);url.searchParams.set('page',nextPage);window.history.pushState({page:nextPage,productId,unit:membership.unitId,scroll:0},'',url);setActionProductId(productId);setPage(nextPage);setMenuOpen(false);setProfileOpen(false);window.scrollTo(0,0);};
 useEffect(()=>{window.history.replaceState({...window.history.state,page:initialRoute(),unit:membership.unitId},'');const old=history.scrollRestoration;history.scrollRestoration='manual';const back=e=>{const state=e.state||{};setPage(routes.includes(state.page)&&canAccessPage(membership.role,state.page)?state.page:initialRoute());setActionProductId(state.unit===membership.unitId?state.productId||null:null);setMenuOpen(false);setProfileOpen(false);requestAnimationFrame(()=>window.scrollTo(0,state.scroll||0));setTimeout(()=>window.scrollTo(0,state.scroll||0),250);};window.addEventListener('popstate',back);return()=>{window.removeEventListener('popstate',back);history.scrollRestoration=old}},[membership.unitId,membership.role]);
 const openMentorStep = item => {navigate(item.page);setMentorHint({title:item.title,body:item.body,target:item.target})};
 return <div className={"app-shell"+(page==="notifications"?" ti-notifications-active":"")} data-mentor-current={mentorHint?.target||""}>
  {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
  <SidebarPremium open={menuOpen} onClose={()=>setMenuOpen(false)} user={user} membership={membership} avatar={avatar} logout={logout} page={page} navigate={navigate} onMentorReset={()=>setMentorHint(null)}/>
  <main className="main-content" key={membership.unitId+':'+membership.role+':'+user.uid}>
    <header className="topbar"><button ref={menuTriggerRef} type="button" className="mobile-menu" aria-label="Abrir menu" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button><div className="breadcrumb"><span className="ti-mobile-brand">Triamicci</span><span className="ti-desktop-crumb">Painel</span> <span>/</span> <b>{page === "notifications" ? "Notificações" : page === "checklists" ? "Checklists" : page === "storages" ? "Gestão de Estoques" : page === "kitchen-v3" ? "Estoque e insumos" : page === "receiving" ? "Recebimento" : page === "leave-requests" ? "Solicitações de folga" : page === "labels" ? "Etiquetas e validades" : page === "mural" ? "Mural da equipe" : page === "schedule-planning" ? "Escalas e folgas" : page === "my-profile" ? "Minha ficha" : page === "mentor" ? "Triamicci Mentor" : page === "people" ? "Gestão de pessoas" : page === "team" ? "Colaboradores" : page === "master-registry" ? "Cadastro Mestre" : page === "skills" ? "Matriz de habilidades" : page === "shifts" ? "Turnos e disponibilidade" : page === "inventory" ? "Estoque" : page === "count" ? "Conferência de estoque" : page === "daily-inventory" ? "Inventário inteligente" : page === "production" ? "Produção" : page === "catalog" ? "Gestão de Insumos" : page === "history" ? "Histórico" : "Operação da cozinha"}</b></div><span className="ti-current-day" aria-label={"Hoje no restaurante: "+today}>HOJE · {new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"2-digit"}).format(new Date(today+"T12:00:00Z"))}</span><div className="top-actions"><NotificationCenter active={page==="notifications"} onOpen={()=>{if(page!=="notifications")navigate("notifications");else window.scrollTo(0,0)}}/><div className="profile-menu-wrap" ref={profileMenuRef}><button type="button" className="top-avatar" onClick={() => setProfileOpen(open => !open)} title="Meu perfil" aria-label="Abrir meu perfil" aria-expanded={profileOpen} aria-controls="profile-menu">{avatar?<img src={avatar} alt="" className="ti-user-avatar-img"/>:(user.displayName || user.email || 'U').slice(0,2).toUpperCase()}</button>{profileOpen && <div className="profile-popover" id="profile-menu"><strong>{user.displayName || 'Meu perfil'}</strong><span className="profile-email">{user.email}</span>{isIndependentSession&&<p>Sessão independente nesta aba</p>}<a className="profile-secondary-session" href="?session=independent" target="_blank" rel="noopener noreferrer">Abrir outra conta em sessão independente</a><div className="profile-meta"><span>Função</span><b>{({admin:'Administrador',manager:'Gerente',submanager:'Subgerente',cook:'Cozinheiro',auxiliar:'Auxiliar'})[membership.role] || membership.role}</b></div><div className="profile-meta"><span>Unidade</span><b>{membership.unitId}</b></div><button type="button" className="profile-logout" onClick={logout}>Sair da conta</button></div>}</div></div></header>
        <h1 className="ti-mobile-page-label">{page === "notifications" ? "Notificações" : page === "checklists" ? "Checklists da unidade" : page === "storages" ? "Gestão de Estoques" : page === "kitchen-v3" ? "Estoque e insumos" : page === "receiving" ? "Recebimento" : page === "leave-requests" ? "Solicitações de folga" : page === "labels" ? "Etiquetas e validades" : page === "mural" ? "Mural da equipe" : page === "schedule-planning" ? "Planejamento de escalas" : page === "my-profile" ? "Minha ficha" : page === "mentor" ? "Triamicci Mentor" : page === "people" ? "Gestão de pessoas" : page === "team" ? "Colaboradores" : page === "master-registry" ? "Cadastro mestre" : page === "skills" ? "Matriz de habilidades" : page === "shifts" ? "Turnos e disponibilidade" : page === "inventory" ? "Estoque" : page === "count" ? "Conferência de estoque" : page === "daily-inventory" ? "Inventário inteligente" : page === "production" ? "Produção" : page === "catalog" ? "Gestão de Insumos" : page === "history" ? "Histórico" : "Operação da cozinha"}</h1>
<div className="ti-mobile-context" aria-label="Data e unidade"><span>{new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long"}).format(new Date(today+"T12:00:00Z"))}</span><span>Unidade {membership.unitId}</span></div>
    <nav className="mobile-page-tabs ti-mobile-quicknav" aria-label="Atalhos rápidos">
      <button type="button" className={page==="kitchen"?"selected":""} onClick={()=>navigate("kitchen")}>Cozinha</button>
      <button type="button" className={page==="mural"?"selected":""} onClick={()=>navigate("mural")}>Mural</button>
      <button type="button" className={page==="my-profile"?"selected":""} onClick={()=>navigate("my-profile")}>Minha ficha</button>
      <button type="button" className={page==="inventory"?"selected":""} onClick={()=>navigate("inventory")}>Estoque</button>
      {isManagement(membership.role)&&<button type="button" className={["people","team","skills","shifts","master-registry","schedule-planning"].includes(page)?"selected":""} onClick={()=>navigate("people")}>Equipe</button>}
      <button type="button" className="ti-mobile-more" onClick={()=>setMenuOpen(true)} aria-label="Ver todos os módulos">Mais módulos</button>
    </nav>
    {mentorHint&&<aside className="ti-mentor-context" role="status"><div><strong>{mentorHint.title}</strong><p>{mentorHint.body}</p></div><button type="button" onClick={()=>{navigate("mentor");setMentorHint(null)}}>Voltar ao mentor</button><button type="button" aria-label="Fechar orientação" onClick={()=>setMentorHint(null)}>×</button></aside>}
    {page === "notifications" ? <NotificationsPage role={membership.role} onNavigate={navigate}/> : page === "checklists" ? <Checklists membership={membership}/> : page === "mentor" ? <TriamicciMentor membership={membership} user={user} onOpenStep={openMentorStep} initialPage={mentorSource}/> : page === "leave-requests" ? <LeaveRequests membership={membership}/> : page === "labels" ? <LabelsManager membership={membership} onBack={()=>navigate("mural")}/> : page === "mural" ? <TeamMural membership={membership} onLabels={()=>navigate("labels")} onOpenProduction={taskId=>{setProductionTaskId(taskId);navigate("production");}}/> : page === "schedule-planning" ? <SchedulePlanner membership={membership}/> : page === "kitchen" ? <KitchenHome membership={membership} navigate={navigate}/> : page === "production" ? <Production membership={membership} initialTaskId={productionTaskId}/> : page === "storages" ? <StorageManager membership={membership}/> : page === "kitchen-v3" ? <KitchenV3 membership={membership}/> : page === "daily-inventory" ? <DailyInventory membership={membership}/> : page === "history" ? <PhysicalStock membership={membership} mode="history" initialProductId={actionProductId}/> : page === "catalog" ? <Inventory membership={membership} mode="catalog"/> : page === "receiving" ? <PhysicalStock membership={membership} mode="receive" initialProductId={actionProductId}/> : page === "count" ? <StockConference membership={membership} initialProductId={actionProductId}/> : page === "my-profile" ? <section className="ti-my-profile-page"><MyProfessionalProfile membership={membership} attendance={<MyAttendanceV31 unitId={membership.unitId}/>} /></section> : page === "people" ? <PeopleHub user={user} membership={membership}/> : page === "master-registry" ? <MasterRegistry membership={membership}/> : page === "team" ? <TeamManagement user={user} membership={membership} /> : page === "skills" ? <TeamProfiles membership={membership} initialTab="matrix"/> : page === "shifts" ? <TeamProfiles membership={membership} initialTab="shifts"/> : page === "inventory" ? <Inventory membership={membership} onAction={openProductAction} /> : <KitchenHome membership={membership} navigate={navigate} />}
    <footer className="footer"><span>© 2026 Triamicci Intelligence</span><span>Triamicci Intelligence · dados operacionais do Firebase</span></footer>
  </main>
 </div>;
}
