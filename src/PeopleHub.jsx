import React from 'react';
import {CalendarDays, ChevronRight, Clock3, KeyRound, ShieldCheck, Users, UserRoundCheck, Workflow} from 'lucide-react';
import PageHeading from './ui/PageHeading.jsx';
import './people-hub.css';

const actions = [
 {page:'master-registry', title:'Colaboradores', description:'Fichas e vínculos da equipe', icon:Users},
 {page:'schedule-planning', title:'Escalas', description:'Folgas e publicação', icon:CalendarDays},
 {page:'coverage', title:'Cobertura', description:'Equipe por turno e reforços', icon:Workflow},
 {page:'team-today', title:'Equipe de hoje', description:'Presenças e turnos do dia', icon:UserRoundCheck},
 {page:'skills', title:'Habilidades', description:'Competências por pessoa', icon:ShieldCheck},
 {page:'shifts', title:'Jornadas', description:'Turnos e intervalos', icon:Clock3},
 {page:'people-access', title:'Acessos', description:'Convites e permissões', icon:KeyRound}
];

export default function PeopleHub({onNavigate}) {
 return <section className="ti-people-hub">
  <PageHeading title="Gestão de pessoas"/>
  <nav className="ti-people-actions" aria-label="Áreas de gestão de pessoas">
   {actions.map(({page,title,description,icon:Icon})=>
    <button key={page} type="button" onClick={()=>onNavigate(page)}>
     <Icon size={20} aria-hidden="true"/>
     <span><strong>{title}</strong><small>{description}</small></span>
     <ChevronRight size={16} aria-hidden="true"/>
    </button>)}
  </nav>
 </section>;
}
