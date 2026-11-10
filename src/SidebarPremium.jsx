import React,{useEffect,useMemo,useState} from 'react';
import {LayoutDashboard,ClipboardCheck,Package,ChefHat,UserRound,CalendarDays,Users,History,Boxes,Settings,BookOpen,Search,ChevronDown,X,LogOut,Building2,ClipboardList,Bell} from 'lucide-react';
import {isManagement,canAccessPage} from '../server/permissions/v31-policy.js';
import {isIndependentSession} from './firebase.js';
import './sidebar-premium.css';

const sections=[
 {id:'personal',title:'Meu espaço',icon:UserRound,items:[
  {id:'notifications',label:'Notificações',icon:Bell},
  {id:'my-profile',label:'Minha ficha profissional',icon:UserRound,mentor:'mentor-profile'},
  {id:'leave-requests',label:'Solicitar folga',icon:CalendarDays},
  {id:'mural',label:'Mural da equipe',icon:Users,mentor:'mentor-mural'}
 ]},
 {id:'operations',title:'Mais operações',icon:Boxes,items:[
  {id:'storages',label:'Gestão de Estoques',icon:Boxes},
   {id:'daily-inventory',label:'Inventário inteligente',icon:ClipboardList},
  {id:'history',label:'Histórico',icon:History,mentor:'mentor-history'}
 ]},
 {id:'management',title:'Administração',icon:Settings,management:true,items:[
  {id:'catalog',label:'Gestão de Insumos',icon:Package},
  {id:'people',label:'Gestão de pessoas',icon:Users,mentor:'mentor-people'}
 ]},
 {id:'learning',title:'Aprendizagem',icon:BookOpen,items:[
  {id:'mentor',label:'Triamicci Mentor',icon:BookOpen}
 ]}
];
const quick=[
 {id:'kitchen',label:'Operação da cozinha',icon:LayoutDashboard,mentor:'mentor-kitchen'},
 {id:'checklists',label:'Checklists da unidade',icon:ClipboardCheck},
 {id:'kitchen-v3',label:'Estoque e insumos',icon:Package},
 {id:'production',label:'Produção',icon:ChefHat}
];
const roleName={admin:'Administrador',manager:'Gerente',submanager:'Subgerente',cook:'Cozinheiro',auxiliar:'Auxiliar'};
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export default function SidebarPremium({open,onClose,user,membership,avatar,logout,page,navigate,onMentorReset}){
 const key='ti.sidebar.groups.'+user.uid+'.'+membership.unitId;
 const [query,setQuery]=useState('');
 const [expanded,setExpanded]=useState(()=>{
  try{const previous=JSON.parse(localStorage.getItem(key)||'{}');return previous&&typeof previous==='object'&&!Array.isArray(previous)?previous:{}}catch{return {}}
 });
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(expanded))}catch{/* Storage opcional. */}},[key,expanded]);
 useEffect(()=>{if(open)setQuery('')},[open]);
 useEffect(()=>{if(!open)return;const handle=e=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle)},[open,onClose]);
 const permitted=item=>canAccessPage(membership.role,item.id);
 const matches=item=>normalize(item.label).includes(normalize(query.trim()));
 const quickMatches=quick.filter(item=>permitted(item)&&matches(item));
 const groups=useMemo(()=>sections.filter(section=>!section.management||isManagement(membership.role)).map(section=>({...section,items:section.items.filter(item=>permitted(item)&&matches(item))})).filter(section=>section.items.length),[membership.role,query]);
 const go=item=>{if(item.id==='mentor')onMentorReset?.();navigate(item.id)};
 const navItem=item=>{
  const Icon=item.icon;
  const active=page===item.id||item.id==='people'&&['team','master-registry','skills','shifts','schedule-planning'].includes(page);
  return <button key={item.id} type="button" data-mentor={item.mentor||undefined} className={'nav-item ti-sidebar-link'+(active?' active is-active':'')} aria-current={active?'page':undefined} onClick={()=>go(item)}><Icon aria-hidden="true" size={20} strokeWidth={1.9}/><span>{item.label}</span></button>;
 };
 return <aside className={'sidebar ti-sidebar-premium'+(open?' sidebar-open':'')} id="primary-sidebar" aria-label="Menu principal">
  <div className="ti-sidebar-top">
   <div className="ti-sidebar-brand">
    <div className="ti-sidebar-brand-icon" aria-hidden="true"><svg viewBox="0 0 88 88" width="50" height="50"><rect width="88" height="88" rx="16" fill="#007934"/><g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round"><path d="M6 44 C20 34 68 33 82 44 C77 48 70 49 66 49" strokeWidth="4.5"/><path d="M20 53 C31 47 59 46 73 51 C63 61 33 63 20 53Z" strokeWidth="2.7"/><path d="M26 53 C40 50 58 50 67 52" strokeWidth="1.8"/></g></svg></div>
    <div className="ti-sidebar-brand-name"><strong>Triamicci</strong><span>INTELLIGENCE</span></div>
    <button type="button" className="ti-sidebar-close" onClick={onClose} aria-label="Fechar menu"><X size={23}/></button>
   </div>
   <div className="ti-sidebar-unit" aria-label={'Unidade atual: '+membership.unitId+'. Vínculo ativo. Não indica conexão com o servidor.'}>
    <span className="ti-sidebar-unit-symbol"><Building2 size={19} aria-hidden="true"/></span>
    <span className="ti-sidebar-unit-name"><small>UNIDADE ATUAL</small><strong>{membership.unitId}</strong></span>
    <span className="ti-sidebar-unit-state"><span className="ti-sidebar-pulse" aria-hidden="true"/>Ativa</span>
   </div>
   <label className="ti-sidebar-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Buscar funcionalidade</span><input aria-label="Buscar funcionalidade" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar funcionalidade..." type="search"/></label>
  </div>
  <nav className="ti-sidebar-scroll" aria-label="Funcionalidades">
   {quickMatches.length>0&&<div className="ti-sidebar-quick"><p className="ti-sidebar-caption">ACESSO RÁPIDO</p>{quickMatches.map(navItem)}</div>}
   {groups.map(section=>{
    const Icon=section.icon,visible=!!query.trim()||!!expanded[section.id],active=section.items.some(item=>page===item.id);
    return <section className="ti-sidebar-group" key={section.id}>
     <button type="button" className={'ti-sidebar-group-toggle'+(active?' has-active':'')} aria-expanded={visible} aria-controls={'sidebar-group-'+section.id} onClick={()=>setExpanded(old=>({...old,[section.id]:!old[section.id]}))}>
      <Icon size={20} aria-hidden="true"/><span>{section.title}</span><ChevronDown size={17} aria-hidden="true" className={visible?'rotated':''}/>
     </button>
     {visible&&<div id={'sidebar-group-'+section.id} className="ti-sidebar-group-items">{section.items.map(navItem)}</div>}
    </section>;
   })}
   {!quickMatches.length&&!groups.length&&<p className="ti-sidebar-no-results">Nenhuma funcionalidade encontrada.</p>}
  </nav>
  <div className="ti-sidebar-footer">
   <div className="ti-sidebar-avatar">{avatar?<img src={avatar} alt="" className="ti-user-avatar-img"/>:(user.displayName||user.email||'U').slice(0,2).toUpperCase()}</div>
   <div className="ti-sidebar-user"><strong>{user.displayName||user.email||'Meu perfil'}</strong><span>{roleName[membership.role]||membership.role}{isIndependentSession?' · sessão independente':''}</span></div>
   <button type="button" className="ti-sidebar-logout" onClick={logout} title="Sair da conta" aria-label="Sair da conta"><LogOut size={20}/></button>
  </div>
 </aside>;
}
