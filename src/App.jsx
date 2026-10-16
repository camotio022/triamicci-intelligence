import React, { useState } from 'react';
import Receiving from './Receiving.jsx';
import AuthGate from './AuthGate.jsx';
import TeamManagement from './TeamManagement.jsx';
import Inventory from './Inventory.jsx';
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
 return <AuthGate>{({ user, membership, logout }) => <Workspace user={user} membership={membership} logout={logout} />}</AuthGate>;
}

function Workspace({ user, membership, logout }) {
 const [page, setPage] = useState('dashboard');
 const [menuOpen, setMenuOpen] = useState(false);
 const [profileOpen, setProfileOpen] = useState(false);
 const navigate = nextPage => { setPage(nextPage); setMenuOpen(false); setProfileOpen(false); };
 return <div className="app-shell">
  {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
  <aside className={menuOpen ? "sidebar sidebar-open" : "sidebar"} id="primary-sidebar" aria-label="Menu principal">
    <div className="brand-mark brand-mark-official"><div className="brand-logo-stack"><TriamicciLogo className="triamicci-logo"/><span className="brand-product-name">INTELLIGENCE</span></div><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
    <div className="workspace"><span className="workspace-dot"/> <span>Unidade: {membership.unitId}</span><ChevronDown size={15}/></div>
    <p className="nav-caption">MENU PRINCIPAL</p>
    <nav>
      <button type="button" className={page === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => navigate("dashboard")}><LayoutDashboard size={18}/> Visão geral</button>
      <button type="button" className={page === "receiving" ? "nav-item active" : "nav-item"} onClick={() => navigate("receiving")}><Package size={18}/> Recebimento</button>
      <button type="button" className={page === "inventory" ? "nav-item active" : "nav-item"} onClick={() => navigate("inventory")}><Package size={18}/> Estoque</button>
      <a className="nav-item"><TrendingUp size={18}/> Consumo</a>
      <a className="nav-item"><Wallet size={18}/> Financeiro</a>
      {["admin", "manager"].includes(membership.role) && <button type="button" className={page === "team" ? "nav-item active" : "nav-item"} onClick={() => navigate("team")}><Users size={18}/> Colaboradores</button>}
    </nav>
    <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Boxes size={18}/></div><b>Controle inteligente</b><p>Acompanhe os insumos e evite desperdícios na operação.</p></div><div className="user-row"><div className="avatar">TL</div><div className="user-info"><b>{user.displayName || user.email}</b><span>{membership.role}</span></div><button type="button" onClick={logout} className="logout-button">Sair da conta</button></div></div>
  </aside>
  <main className="main-content">
    <header className="topbar"><button type="button" className="mobile-menu" aria-label="Abrir menu" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button><div className="breadcrumb">Painel <span>/</span> <b>{page === "receiving" ? "Recebimento" : page === "team" ? "Colaboradores" : page === "inventory" ? "Estoque" : "Visão geral"}</b></div><div className="top-actions"><label className="search-box"><Search size={16}/><input placeholder="Buscar insumos..." /></label><button className="icon-button notification" aria-label="Notificações"><Bell size={19}/><i/></button><div className="profile-menu-wrap"><button type="button" className="top-avatar" onClick={() => setProfileOpen(open => !open)} title="Meu perfil" aria-label="Abrir meu perfil" aria-expanded={profileOpen} aria-controls="profile-menu">{(user.displayName || user.email || 'U').slice(0,2).toUpperCase()}</button>{profileOpen && <div className="profile-popover" id="profile-menu"><strong>{user.displayName || 'Meu perfil'}</strong><span className="profile-email">{user.email}</span><div className="profile-meta"><span>Função</span><b>{({admin:'Administrador',manager:'Gerente',cook:'Cozinheiro',auxiliar:'Auxiliar'})[membership.role] || membership.role}</b></div><div className="profile-meta"><span>Unidade</span><b>{membership.unitId}</b></div><button type="button" className="profile-logout" onClick={logout}>Sair da conta</button></div>}</div></div></header>
    <div className="mobile-page-tabs" aria-label="Navegação operacional"><button type="button" className={page === "dashboard" ? "selected" : ""} onClick={() => navigate("dashboard")}>Visão geral</button><button type="button" className={page === "receiving" ? "selected" : ""} onClick={() => navigate("receiving")}>Recebimento</button><button type="button" className={page === "inventory" ? "selected" : ""} onClick={() => navigate("inventory")}>Estoque</button>{["admin", "manager"].includes(membership.role) && <button type="button" className={page === "team" ? "selected" : ""} onClick={() => navigate("team")}>Colaboradores</button>}</div>
    {page === "receiving" ? <Receiving /> : page === "team" ? <TeamManagement user={user} membership={membership} /> : page === "inventory" ? <Inventory membership={membership} /> : <><section className="page-heading"><div><p className="eyebrow">QUINTA-FEIRA, 15 DE OUTUBRO</p><h1>Visão geral <span>👋</span></h1><p className="subheading">Aqui está o resumo da sua operação hoje.</p></div><button className="period-button"><Clock3 size={16}/> Últimos 7 dias <ChevronDown size={15}/></button></section>
    <section className="metric-grid">
      <Metric icon={CircleDollarSign} label="Valor em estoque" value={money(18450)} change="+8,2%" positive detail="vs. período anterior"/>
      <Metric icon={Package} label="Insumos cadastrados" value="128" change="+12" positive detail="itens no catálogo"/>
      <Metric icon={TrendingUp} label="Consumo da semana" value={money(4260)} change="+4,6%" positive={false} detail="vs. semana anterior"/>
      <Metric icon={AlertTriangle} label="Atenção ao estoque" value="5 itens" change="2 críticos" positive={false} detail="precisam de reposição"/>
    </section>
    <section className="charts-grid">
      <article className="panel consumption-panel"><div className="panel-heading"><div><h2>Movimentação de estoque</h2><p>Entradas e saídas durante a semana</p></div><button className="subtle-button">Esta semana <ChevronDown size={14}/></button></div><div className="chart-legend"><span><i className="legend-dot outgoing"/> Saídas</span><span><i className="legend-dot incoming"/> Entradas</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={consumption} margin={{top:8,right:8,left:-18,bottom:0}}><defs><linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.18}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf0f5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#9299a8',fontSize:12}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#9299a8',fontSize:11}}/><Tooltip formatter={(v)=>[v+' un.','']} contentStyle={{border:'1px solid #e8ebf2',borderRadius:12,fontSize:12}}/><Area type="monotone" dataKey="saida" name="Saídas" stroke="#2563eb" strokeWidth={2.5} fill="url(#outFill)"/><Area type="monotone" dataKey="entrada" name="Entradas" stroke="#13b8a6" strokeWidth={2.5} fill="transparent"/></AreaChart></ResponsiveContainer></div></article>
      <article className="panel category-panel"><div className="panel-heading"><div><h2>Consumo por categoria</h2><p>Distribuição dos insumos</p></div><button className="more-button" aria-label="Mais opções">•••</button></div><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius={65} outerRadius={88} paddingAngle={4} stroke="none"><Cell fill="#2563eb"/><Cell fill="#13b8a6"/><Cell fill="#f5a524"/><Cell fill="#c5cbd6"/></Pie><Tooltip formatter={(v)=>[v+'%','Consumo']}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>100%</strong><span>do consumo</span></div></div><div className="category-legend">{categories.map((c,i)=><div className="category-row" key={c.name}><span><i style={{background:['#2563eb','#13b8a6','#f5a524','#c5cbd6'][i]}}/>{c.name}</span><b>{c.value}%</b></div>)}</div></article>
    </section>
    <section className="panel stock-panel"><div className="panel-heading stock-heading"><div><h2>Estoque que precisa de atenção</h2><p>Confira os itens com nível baixo ou crítico.</p></div><button className="link-button">Ver todo o estoque <ArrowUpRight size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>INSUMO</th><th>CATEGORIA</th><th>QUANTIDADE ATUAL</th><th>STATUS</th><th></th></tr></thead><tbody>{items.map((item,i)=><tr key={item.name}><td><span className="product-icon">{item.name.slice(0,1)}</span><b>{item.name}</b></td><td className="muted-cell">{item.category}</td><td>{item.stock}</td><td><span className={'status-pill '+item.tone}><i/>{item.status}</span></td><td><button className="row-action" aria-label={'Ver '+item.name}>•••</button></td></tr>)}</tbody></table></div><div className="table-footer"><span>Mostrando <b>5</b> de <b>128</b> insumos</span><button>Ver todos os itens <ArrowUpRight size={14}/></button></div></section>
    </>}
    <footer className="footer"><span>© 2026 Triamicci Intelligence</span><span>Dados demonstrativos · Atualizado agora</span></footer>
  </main>
 </div>;
}
