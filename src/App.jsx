import React, { useState, useEffect, useRef } from 'react';
import {FeedbackProvider} from './FeedbackProvider.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import MyProfessionalProfile from './MyProfessionalProfile.jsx';
import MyAttendanceV31 from './MyAttendanceV31.jsx';
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
import './kitchen.css';
import {isManagement} from '../server/permissions/v31-policy.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import Dashboard from './Dashboard.jsx';
import TriamicciLogo from './TriamicciLogo.jsx';
import {auth} from './firebase.js';
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
 return <FeedbackProvider><AuthGate>{({ user, membership, logout }) => <Workspace user={user} membership={membership} logout={logout} />}</AuthGate></FeedbackProvider>;
}

function Workspace({ user, membership, logout }) {
 const [page, setPage] = useState('kitchen');
 const [today,setToday]=useState(()=>restaurantDay());
 useEffect(()=>{const refresh=()=>setToday(restaurantDay());const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[]);
 const [menuOpen, setMenuOpen] = useState(false);
 const [mentorHint,setMentorHint]=useState(null);
 const [actionProductId,setActionProductId] = useState(null);
 const openProductAction=(target,id)=>{navigate(target);setActionProductId(id)};
 const [profileOpen, setProfileOpen] = useState(false);
 const profileMenuRef=useRef(null);
 const [avatar,setAvatar]=useState(null);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const token=await auth.currentUser?.getIdToken();if(!token)return;const response=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'myProfile'})});if(response.ok){const data=await response.json();if(active)setAvatar(data.avatar||null)}}catch{}};refresh();const onUpdate=()=>refresh();window.addEventListener('ti-avatar-updated',onUpdate);const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},30000);return()=>{active=false;window.removeEventListener('ti-avatar-updated',onUpdate);clearInterval(timer)}},[user.uid,membership.unitId]);
 useEffect(()=>{if(!profileOpen)return;const outside=e=>{if(!profileMenuRef.current?.contains(e.target))setProfileOpen(false)};const escape=e=>{if(e.key==='Escape')setProfileOpen(false)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[profileOpen]);
 React.useEffect(()=>{const go=e=>{if(e.detail==='master-registry')setPage('master-registry')};window.addEventListener('ti-navigate',go);return()=>window.removeEventListener('ti-navigate',go)},[]);
 const navigate = nextPage => { setActionProductId(null);setPage(nextPage); setMenuOpen(false); setProfileOpen(false); };
 const openMentorStep = item => {navigate(item.page);setMentorHint({title:item.title,body:item.body,target:item.target})};
 return <div className="app-shell" data-mentor-current={mentorHint?.target||""}>
  {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
  <aside className={menuOpen ? "sidebar sidebar-open" : "sidebar"} id="primary-sidebar" aria-label="Menu principal">
    <div className="brand-mark brand-mark-official brand-signature"><div className="brand-logo-stack"><TriamicciLogo className="triamicci-logo"/><div className="brand-signature-bottom"><span className="brand-signature-line"/><span className="brand-product-name">INTELLIGENCE</span><span className="brand-signature-line"/></div></div><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
    <div className="workspace workspace-unit-card" aria-label={"Unidade atual: "+membership.unitId}><div className="workspace-unit-icon"><span className="workspace-dot"/></div><div className="workspace-unit-info"><small>UNIDADE ATUAL</small><strong>{membership.unitId}</strong></div><span className="workspace-unit-status">Ativa</span></div>
    <p className="nav-caption">ÁREA DE TRABALHO</p>
    <nav>
      <button data-mentor="mentor-profile" type="button" className={page==="my-profile" ? "nav-item active" : "nav-item"} onClick={()=>navigate("my-profile")}><Users size={18}/> Minha ficha profissional</button>
      <button type="button" className={page==="leave-requests"?"nav-item active":"nav-item"} onClick={()=>navigate("leave-requests")}><Clock3 size={18}/> Solicitar folga</button>
      <button data-mentor="mentor-mural" type="button" className={page==="mural"?"nav-item active":"nav-item"} onClick={()=>navigate("mural")}><Boxes size={18}/> Mural da equipe</button>
      <p className="ti-nav-group-label">OPERAÇÃO</p>
      <button data-mentor="mentor-kitchen" type="button" className={page === "kitchen" ? "nav-item active" : "nav-item"} onClick={() => navigate("kitchen")}><LayoutDashboard size={18}/> Operação da cozinha</button>
      <button data-mentor="mentor-receiving" type="button" className={page==="receiving" ? "nav-item active" : "nav-item"} onClick={() => navigate("receiving")}><Package size={18}/> Recebimento</button>
      <button data-mentor="mentor-inventory" type="button" className={page==="inventory" ? "nav-item active" : "nav-item"} onClick={() => navigate("inventory")}><Package size={18}/> Estoque</button>
      <button type="button" className={page==="kitchen-v3"?"nav-item active":"nav-item"} onClick={()=>navigate("kitchen-v3")}><Boxes size={18}/> Central de insumos V3</button>
      <button type="button" className={page === "production" ? "nav-item active" : "nav-item"} onClick={() => navigate("production")}><Boxes size={18}/> Produção</button>
      <button type="button" className={page === "count" ? "nav-item active" : "nav-item"} onClick={() => navigate("count")}><Boxes size={18}/> Contagem diária</button>
      <button type="button" className={page === "daily-inventory" ? "nav-item active" : "nav-item"} onClick={() => navigate("daily-inventory")}><Boxes size={18}/> Inventário inteligente</button>
      <button data-mentor="mentor-history" type="button" className={page==="history"?"nav-item active":"nav-item"} onClick={()=>navigate("history")}><Clock3 size={18}/> Histórico</button>
      {isManagement(membership.role)&&<p className="ti-nav-group-label">ADMINISTRAÇÃO</p>}
      {isManagement(membership.role)&&<button type="button" className={page==="catalog"?"nav-item active":"nav-item"} onClick={()=>navigate("catalog")}><Boxes size={18}/> Administração · Catálogo</button>}
      {isManagement(membership.role)&&<button data-mentor="mentor-people" type="button" className={["people","team","master-registry","skills","shifts","schedule-planning"].includes(page)?"nav-item active":"nav-item"} onClick={()=>navigate("people")}><Users size={18}/> Gestão de pessoas</button>}
      <p className="ti-nav-group-label">APRENDIZAGEM</p>
      <button type="button" className={page==="mentor"?"nav-item active":"nav-item"} onClick={()=>{navigate("mentor");setMentorHint(null)}}><BookOpen size={18}/> Triamicci Mentor</button>
    </nav>
    <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Boxes size={18}/></div><b>Controle inteligente</b><p>Acompanhe os insumos e evite desperdícios na operação.</p></div><div className="user-row"><div className="avatar">{avatar?<img src={avatar} alt="Minha foto" className="ti-user-avatar-img"/>:(user.displayName||user.email||"U").slice(0,2).toUpperCase()}</div><div className="user-info"><b>{user.displayName || user.email}</b><span>{membership.role}</span></div><button type="button" onClick={logout} className="logout-button">Sair da conta</button></div></div>
  </aside>
  <main className="main-content">
    <header className="topbar"><button type="button" className="mobile-menu" aria-label="Abrir menu" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button><div className="breadcrumb">Painel <span>/</span> <b>{page === "kitchen-v3" ? "Central de insumos" : page === "receiving" ? "Recebimento" : page === "leave-requests" ? "Solicitações de folga" : page === "labels" ? "Etiquetas e validades" : page === "mural" ? "Mural da equipe" : page === "schedule-planning" ? "Escalas e folgas" : page === "my-profile" ? "Minha ficha" : page === "mentor" ? "Triamicci Mentor" : page === "people" ? "Gestão de pessoas" : page === "team" ? "Colaboradores" : page === "master-registry" ? "Cadastro Mestre" : page === "skills" ? "Matriz de habilidades" : page === "shifts" ? "Turnos e disponibilidade" : page === "inventory" ? "Estoque" : page === "count" ? "Contagem diária" : page === "daily-inventory" ? "Inventário inteligente" : page === "production" ? "Produção" : page === "catalog" ? "Administração" : page === "history" ? "Histórico" : "Operação da cozinha"}</b></div><span className="ti-current-day" aria-label={"Hoje no restaurante: "+today}>HOJE · {new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"2-digit"}).format(new Date(today+"T12:00:00Z"))}</span><div className="top-actions"><NotificationCenter openProfile={()=>navigate("my-profile")} openKitchen={()=>navigate("kitchen-v3")}/><div className="profile-menu-wrap" ref={profileMenuRef}><button type="button" className="top-avatar" onClick={() => setProfileOpen(open => !open)} title="Meu perfil" aria-label="Abrir meu perfil" aria-expanded={profileOpen} aria-controls="profile-menu">{avatar?<img src={avatar} alt="" className="ti-user-avatar-img"/>:(user.displayName || user.email || 'U').slice(0,2).toUpperCase()}</button>{profileOpen && <div className="profile-popover" id="profile-menu"><strong>{user.displayName || 'Meu perfil'}</strong><span className="profile-email">{user.email}</span><div className="profile-meta"><span>Função</span><b>{({admin:'Administrador',manager:'Gerente',submanager:'Subgerente',cook:'Cozinheiro',auxiliar:'Auxiliar'})[membership.role] || membership.role}</b></div><div className="profile-meta"><span>Unidade</span><b>{membership.unitId}</b></div><button type="button" className="profile-logout" onClick={logout}>Sair da conta</button></div>}</div></div></header>
    <nav className="mobile-page-tabs ti-mobile-quicknav" aria-label="Atalhos rápidos">
      <button type="button" className={page==="kitchen"?"selected":""} onClick={()=>navigate("kitchen")}>Cozinha</button>
      <button type="button" className={page==="mural"?"selected":""} onClick={()=>navigate("mural")}>Mural</button>
      <button type="button" className={page==="my-profile"?"selected":""} onClick={()=>navigate("my-profile")}>Minha ficha</button>
      <button type="button" className={page==="inventory"?"selected":""} onClick={()=>navigate("inventory")}>Estoque</button>
      {isManagement(membership.role)&&<button type="button" className={["people","team","skills","shifts","master-registry","schedule-planning"].includes(page)?"selected":""} onClick={()=>navigate("people")}>Equipe</button>}
      <button type="button" className="ti-mobile-more" onClick={()=>setMenuOpen(true)} aria-label="Ver todos os módulos">Mais módulos</button>
    </nav>
    {mentorHint&&<aside className="ti-mentor-context" role="status"><div><strong>{mentorHint.title}</strong><p>{mentorHint.body}</p></div><button type="button" onClick={()=>{navigate("mentor");setMentorHint(null)}}>Voltar ao mentor</button><button type="button" aria-label="Fechar orientação" onClick={()=>setMentorHint(null)}>×</button></aside>}
    {page === "mentor" ? <TriamicciMentor membership={membership} user={user} onOpenStep={openMentorStep}/> : page === "leave-requests" ? <LeaveRequests membership={membership}/> : page === "labels" ? <LabelsManager membership={membership} onBack={()=>navigate("mural")}/> : page === "mural" ? <TeamMural membership={membership} onLabels={()=>navigate("labels")}/> : page === "schedule-planning" ? <SchedulePlanner membership={membership}/> : page === "kitchen" ? <KitchenHome membership={membership} navigate={navigate}/> : page === "production" ? <Production membership={membership}/> : page === "kitchen-v3" ? <KitchenV3 membership={membership}/> : page === "daily-inventory" ? <DailyInventory membership={membership}/> : page === "history" ? <PhysicalStock membership={membership} mode="history" initialProductId={actionProductId}/> : page === "catalog" ? <Inventory membership={membership} mode="catalog"/> : page === "receiving" ? <PhysicalStock membership={membership} mode="receive" initialProductId={actionProductId}/> : page === "count" ? <PhysicalStock membership={membership} mode="count" initialProductId={actionProductId}/> : page === "my-profile" ? <><MyAttendanceV31/><MyProfessionalProfile membership={membership}/></> : page === "people" ? <PeopleHub user={user} membership={membership}/> : page === "master-registry" ? <MasterRegistry/> : page === "team" ? <TeamManagement user={user} membership={membership} /> : page === "skills" ? <TeamProfiles membership={membership} initialTab="matrix"/> : page === "shifts" ? <TeamProfiles membership={membership} initialTab="shifts"/> : page === "inventory" ? <Inventory membership={membership} onAction={openProductAction} /> : <KitchenHome membership={membership} navigate={navigate} />}
    <footer className="footer"><span>© 2026 Triamicci Intelligence</span><span>Triamicci Intelligence · dados operacionais do Firebase</span></footer>
  </main>
 </div>;
}
