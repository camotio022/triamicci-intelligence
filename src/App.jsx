import React, { useState } from 'react';
import {FeedbackProvider} from './FeedbackProvider.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import MyProfessionalProfile from './MyProfessionalProfile.jsx';
import PhysicalStock from './PhysicalStock.jsx';
import DailyInventory from './DailyInventory.jsx';
import AuthGate from './AuthGate.jsx';
import TeamManagement from './TeamManagement.jsx';
import TeamProfiles from './TeamProfiles.jsx';
import Inventory from './Inventory.jsx';
import KitchenHome from './KitchenHome.jsx';
import Production from './Production.jsx';
import './kitchen.css';
import Dashboard from './Dashboard.jsx';
import TriamicciLogo from './TriamicciLogo.jsx';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LayoutDashboard, Package, TrendingUp, Wallet, Bell, Search, ChevronDown, ArrowUpRight, ArrowDownRight, AlertTriangle, Clock3, Boxes, CircleDollarSign, Menu, Users, X } from 'lucide-react';

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
 const [menuOpen, setMenuOpen] = useState(false);
 const [actionProductId,setActionProductId] = useState(null);
 const openProductAction=(target,id)=>{navigate(target);setActionProductId(id)};
 const [profileOpen, setProfileOpen] = useState(false);
 const navigate = nextPage => { setActionProductId(null);setPage(nextPage); setMenuOpen(false); setProfileOpen(false); };
 return <div className="app-shell">
  {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
  <aside className={menuOpen ? "sidebar sidebar-open" : "sidebar"} id="primary-sidebar" aria-label="Menu principal">
    <div className="brand-mark brand-mark-official"><div className="brand-logo-stack"><TriamicciLogo className="triamicci-logo"/><span className="brand-product-name">INTELLIGENCE</span></div><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
    <div className="workspace"><span className="workspace-dot"/> <span>Unidade: {membership.unitId}</span><ChevronDown size={15}/></div>
    <p className="nav-caption">ÁREA DE TRABALHO</p>
    <nav>
      <button type="button" className={page === "my-profile" ? "nav-item active" : "nav-item"} onClick={()=>navigate("my-profile")}><Users size={18}/> Minha ficha profissional</button>
      <p className="ti-nav-group-label">OPERAÇÃO</p>
      <button type="button" className={page === "kitchen" ? "nav-item active" : "nav-item"} onClick={() => navigate("kitchen")}><LayoutDashboard size={18}/> Operação da cozinha</button>
      <button type="button" className={page === "receiving" ? "nav-item active" : "nav-item"} onClick={() => navigate("receiving")}><Package size={18}/> Recebimento</button>
      <button type="button" className={page === "inventory" ? "nav-item active" : "nav-item"} onClick={() => navigate("inventory")}><Package size={18}/> Estoque</button>
      <button type="button" className={page === "production" ? "nav-item active" : "nav-item"} onClick={() => navigate("production")}><Boxes size={18}/> Produção</button>
      <button type="button" className={page === "count" ? "nav-item active" : "nav-item"} onClick={() => navigate("count")}><Boxes size={18}/> Contagem diária</button>
      <button type="button" className={page === "daily-inventory" ? "nav-item active" : "nav-item"} onClick={() => navigate("daily-inventory")}><Boxes size={18}/> Inventário inteligente</button>
      <button type="button" className={page==="history"?"nav-item active":"nav-item"} onClick={()=>navigate("history")}><Clock3 size={18}/> Histórico</button>
      {["admin","manager"].includes(membership.role)&&<p className="ti-nav-group-label">ADMINISTRAÇÃO</p>}
      {["admin","manager"].includes(membership.role)&&<button type="button" className={page==="catalog"?"nav-item active":"nav-item"} onClick={()=>navigate("catalog")}><Boxes size={18}/> Administração · Catálogo</button>}
      {["admin", "manager"].includes(membership.role) && <button type="button" className={page === "team" ? "nav-item active" : "nav-item"} onClick={() => navigate("team")}><Users size={18}/> Colaboradores</button>}
      {["admin","manager"].includes(membership.role) && <button type="button" className={page==="skills"?"nav-item active":"nav-item"} onClick={()=>navigate("skills")}><Users size={18}/> Matriz de habilidades</button>}
      {["admin","manager"].includes(membership.role) && <button type="button" className={page==="shifts"?"nav-item active":"nav-item"} onClick={()=>navigate("shifts")}><Users size={18}/> Turnos e disponibilidade</button>}
    </nav>
    <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Boxes size={18}/></div><b>Controle inteligente</b><p>Acompanhe os insumos e evite desperdícios na operação.</p></div><div className="user-row"><div className="avatar">TL</div><div className="user-info"><b>{user.displayName || user.email}</b><span>{membership.role}</span></div><button type="button" onClick={logout} className="logout-button">Sair da conta</button></div></div>
  </aside>
  <main className="main-content">
    <header className="topbar"><button type="button" className="mobile-menu" aria-label="Abrir menu" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button><div className="breadcrumb">Painel <span>/</span> <b>{page === "receiving" ? "Recebimento" : page === "my-profile" ? "Minha ficha" : page === "team" ? "Colaboradores" : page === "skills" ? "Matriz de habilidades" : page === "shifts" ? "Turnos e disponibilidade" : page === "inventory" ? "Estoque" : page === "count" ? "Contagem diária" : page === "daily-inventory" ? "Inventário inteligente" : page === "production" ? "Produção" : page === "catalog" ? "Administração" : page === "history" ? "Histórico" : "Operação da cozinha"}</b></div><div className="top-actions"><NotificationCenter openProfile={()=>navigate("my-profile")}/><div className="profile-menu-wrap"><button type="button" className="top-avatar" onClick={() => setProfileOpen(open => !open)} title="Meu perfil" aria-label="Abrir meu perfil" aria-expanded={profileOpen} aria-controls="profile-menu">{(user.displayName || user.email || 'U').slice(0,2).toUpperCase()}</button>{profileOpen && <div className="profile-popover" id="profile-menu"><strong>{user.displayName || 'Meu perfil'}</strong><span className="profile-email">{user.email}</span><div className="profile-meta"><span>Função</span><b>{({admin:'Administrador',manager:'Gerente',cook:'Cozinheiro',auxiliar:'Auxiliar'})[membership.role] || membership.role}</b></div><div className="profile-meta"><span>Unidade</span><b>{membership.unitId}</b></div><button type="button" className="profile-logout" onClick={logout}>Sair da conta</button></div>}</div></div></header>
    <div className="mobile-page-tabs" aria-label="Navegação operacional"><button type="button" className={page === "my-profile" ? "selected" : ""} onClick={() => navigate("my-profile")}>Minha ficha</button><button type="button" className={page === "kitchen" ? "selected" : ""} onClick={() => navigate("kitchen")}>Cozinha</button><button type="button" className={page === "receiving" ? "selected" : ""} onClick={() => navigate("receiving")}>Recebimento</button><button type="button" className={page === "inventory" ? "selected" : ""} onClick={() => navigate("inventory")}>Estoque</button><button type="button" className={page === "count" ? "selected" : ""} onClick={() => navigate("count")}>Contagem</button><button type="button" className={page === "production" ? "selected" : ""} onClick={() => navigate("production")}>Produção</button><button type="button" className={page === "daily-inventory" ? "selected" : ""} onClick={() => navigate("daily-inventory")}>Inventário</button><button type="button" className={page === "history" ? "selected" : ""} onClick={() => navigate("history")}>Histórico</button>{["admin", "manager"].includes(membership.role) && <button type="button" className={page === "team" ? "selected" : ""} onClick={() => navigate("team")}>Colaboradores</button>}</div>
    {page === "kitchen" ? <KitchenHome membership={membership} navigate={navigate}/> : page === "production" ? <Production membership={membership}/> : page === "daily-inventory" ? <DailyInventory membership={membership}/> : page === "history" ? <PhysicalStock membership={membership} mode="history" initialProductId={actionProductId}/> : page === "catalog" ? <Inventory membership={membership} mode="catalog"/> : page === "receiving" ? <PhysicalStock membership={membership} mode="receive" initialProductId={actionProductId}/> : page === "count" ? <PhysicalStock membership={membership} mode="count" initialProductId={actionProductId}/> : page === "my-profile" ? <MyProfessionalProfile membership={membership}/> : page === "team" ? <TeamManagement user={user} membership={membership} /> : page === "skills" ? <TeamProfiles membership={membership} initialTab="matrix"/> : page === "shifts" ? <TeamProfiles membership={membership} initialTab="shifts"/> : page === "inventory" ? <Inventory membership={membership} onAction={openProductAction} /> : <KitchenHome membership={membership} navigate={navigate} />}
    <footer className="footer"><span>© 2026 Triamicci Intelligence</span><span>Triamicci Intelligence · dados operacionais do Firebase</span></footer>
  </main>
 </div>;
}
