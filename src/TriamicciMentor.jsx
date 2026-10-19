import React,{useEffect,useMemo,useState} from 'react';
import {BookOpen,CheckCircle2,ChevronLeft,ChevronRight,GraduationCap,PlayCircle,RotateCcw,X} from 'lucide-react';
import {lessonsForRole,progressKey} from './mentor-lessons.js';
import './mentor.css';
function readProgress(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}}
export default function TriamicciMentor({membership,user,onOpenStep}){
 const key=progressKey(membership.unitId,user.uid);
 const lessons=useMemo(()=>lessonsForRole(membership.role),[membership.role]);
 const [progress,setProgress]=useState(()=>readProgress(key));
 const resumeKey=key+':active';
 const saved=useMemo(()=>{try{return JSON.parse(sessionStorage.getItem(resumeKey)||'null')}catch{return null}},[resumeKey]);
 const [selected,setSelected]=useState(()=>saved?.id||null),[step,setStep]=useState(()=>Number.isInteger(saved?.step)?saved.step:0),[spotlight,setSpotlight]=useState(false);
 useEffect(()=>{if(selected&&lessons.some(l=>l.id===selected)){try{sessionStorage.setItem(resumeKey,JSON.stringify({id:selected,step}))}catch{}}else{try{sessionStorage.removeItem(resumeKey)}catch{}}},[selected,step,lessons,resumeKey]);
 useEffect(()=>{setProgress(readProgress(key));setSelected(saved?.id||null);setStep(Number.isInteger(saved?.step)?saved.step:0);setSpotlight(false)},[key,saved]);
 const lesson=lessons.find(l=>l.id===selected);
 const completed=lessons.filter(l=>progress[l.id]).length;
 function saveLesson(id,value){const next={...progress,[id]:value};setProgress(next);try{localStorage.setItem(key,JSON.stringify(next))}catch{}}
 function begin(id){setSelected(id);setStep(0);setSpotlight(false)}
 function next(){if(!lesson)return;if(step===lesson.steps.length-1){saveLesson(lesson.id,true);setSelected(null);setSpotlight(false)}else{setStep(n=>n+1);setSpotlight(false)}}
 const current=lesson?.steps[step]||lesson?.steps[0];
 return <section className="ti-mentor" aria-label="Central de aprendizagem">
  <header className="ti-mentor-hero"><div className="ti-mentor-eyebrow"><GraduationCap size={20}/> TRIAMICCI MENTOR</div><h1>Aprenda a usar o Triamicci Intelligence</h1><p>Um passo de cada vez, com orientações nas próprias telas. Explore com segurança: os tutoriais não registram operações.</p><div className="ti-mentor-progress"><span>{completed} de {lessons.length} trilhas concluídas</span><progress max={lessons.length} value={completed}/></div></header>
  {!lesson?<div className="ti-mentor-grid">{lessons.map((l,i)=><article className="ti-mentor-card" key={l.id}><div className="ti-mentor-card-top"><span className="ti-mentor-number">{String(i+1).padStart(2,'0')}</span>{progress[l.id]&&<span className="ti-mentor-done"><CheckCircle2 size={16}/> Concluída</span>}</div><h2>{l.title}</h2><p>{l.description}</p><small>{l.steps.length} etapas · {l.roles.includes('auxiliar')?'Equipe':'Gerência'}</small><button type="button" onClick={()=>begin(l.id)}><PlayCircle size={17}/>{progress[l.id]?'Revisar treinamento':'Começar treinamento'}</button></article>)}</div>
  :<div className="ti-mentor-walkthrough"><div className="ti-mentor-walkthrough-top"><span><BookOpen size={17}/> {lesson.title}</span><button type="button" aria-label="Voltar às trilhas" onClick={()=>{setSelected(null);setSpotlight(false)}}><X size={18}/></button></div><div className="ti-mentor-step-number">PASSO {step+1} DE {lesson.steps.length}</div><h2>{current.title}</h2><p>{current.body}</p><div className="ti-mentor-step-actions"><button type="button" onClick={()=>{onOpenStep(current);setSpotlight(true)}}><PlayCircle size={18}/> Abrir e destacar na tela</button><button type="button" className="ti-mentor-secondary" onClick={()=>setSpotlight(false)}>Fechar destaque</button></div>{spotlight&&<div role="status" className="ti-mentor-tip">A área foi aberta. Procure o elemento destacado; você pode voltar à Central de Aprendizagem para continuar.</div>}<div className="ti-mentor-step-footer"><button type="button" disabled={step===0} onClick={()=>{setStep(n=>n-1);setSpotlight(false)}}><ChevronLeft size={16}/> Voltar</button><button type="button" onClick={next}>{step===lesson.steps.length-1?'Concluir trilha':'Próximo passo'} <ChevronRight size={16}/></button></div></div>}
  <aside className="ti-mentor-note"><RotateCcw size={17}/> Seu progresso fica salvo neste navegador, por conta e unidade. Você pode repetir qualquer tutorial.</aside>
 </section>;
}
