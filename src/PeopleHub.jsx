import {useViewState} from './useViewState.js';
import React,{useState} from 'react';
import MasterRegistry from './MasterRegistry.jsx';
import TeamProfiles from './TeamProfiles.jsx';
import TeamManagement from './TeamManagement.jsx';
import SchedulePlanner from './SchedulePlanner.jsx';
import CoverageConsole from './CoverageConsole.jsx';
import './people-hub.css';
import TeamTodayV31 from './TeamTodayV31.jsx';
import {isManagement} from '../server/permissions/v31-policy.js';

const sections=[
 {id:'today',title:'Equipe de hoje',subtitle:'Situação ao vivo e presenças',icon:'01'},
 {id:'staff',title:'Colaboradores',subtitle:'Fichas reais e vínculos',icon:'02'},
 {id:'skills',title:'Habilidades',subtitle:'Competências por pessoa',icon:'03'},
 {id:'shifts',title:'Jornadas',subtitle:'Turnos e intervalos',icon:'04'},
 {id:'schedule',title:'Escalas',subtitle:'Folgas e publicação',icon:'05'},
 {id:'access',title:'Acessos',subtitle:'Convites e permissões',icon:'06'},
 {id:'coverage',title:'Cobertura',subtitle:'Dobras e custos',icon:'07'}
];
export default function PeopleHub({user,membership}){
 const [section,setSection]=useViewState('PeopleHub.jsx:section',membership.unitId,'staff');
 if(!isManagement(membership.role))return <p>Esta área é reservada à gerência.</p>;
 return <section className="ti-people-hub">
  <header className="ti-people-hero"><span>TRIAMICCI · GESTÃO</span><h1>Gestão de pessoas</h1><p>Equipe real, competências, jornadas e acessos em um único lugar. Contas de teste não representam automaticamente funcionários.</p></header>
  <nav className="ti-people-nav" aria-label="Áreas de gestão de pessoas">{sections.map(item=><button key={item.id} type="button" aria-current={section===item.id?'page':undefined} className={section===item.id?'active':''} onClick={()=>setSection(item.id)}><small>{item.icon}</small><strong>{item.title}</strong><span>{item.subtitle}</span></button>)}</nav>
  <div className="ti-people-content">
   {section==='today'?<TeamTodayV31 unitId={membership.unitId}/>:section==='staff'?<MasterRegistry membership={membership}/>:section==='skills'?<TeamProfiles membership={membership} initialTab="matrix"/>:section==='shifts'?<TeamProfiles membership={membership} initialTab="shifts"/>:section==='schedule'?<SchedulePlanner membership={membership}/>:section==='coverage'?<CoverageConsole membership={membership}/>:<TeamManagement user={user} membership={membership} accessOnly/>}
  </div>
 </section>;
}
