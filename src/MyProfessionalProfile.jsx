import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {Award,Star,Sparkles,Clock3,CheckCircle2,UserRound,Pencil,Target,Send,ShieldCheck} from 'lucide-react';
import {useFeedback} from './FeedbackProvider.jsx';
import './profile-premium.css';
const days={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta',sab:'Sábado',dom:'Domingo'};
const skills={preparo:'Preparo',montagem:'Montagem',chapa:'Chapa',vitrine:'Vitrine',vendas:'Vendas',ifood:'iFood',caixa:'Caixa',recebimento:'Recebimento',estoque:'Estoque',lideranca:'Liderança'};
const shifts={manha:'Manhã',noite:'Noite',intermediario:'Intermediário',variavel:'Variável'};
const blank={displayName:'',bio:'',developmentGoal:'',preferredShift:''};
async function api(action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const response=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Não foi possível concluir.');
 return data;
}
export default function MyProfessionalProfile({membership}){
 const {notify}=useFeedback(),[profile,setProfile]=useState(null),[personal,setPersonal]=useState(blank),[recognition,setRecognition]=useState(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[editing,setEditing]=useState(false);
 const [error,setError]=useState(''),[skill,setSkill]=useState(''),[reason,setReason]=useState(''),[requesting,setRequesting]=useState(false);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const data=await api('myProfile');
 setProfile(data.professional);setPersonal({...blank,...(data.personal||{})});setRecognition(data.recognition);
 }catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);
 const save=async e=>{e.preventDefault();if(saving)return;setSaving(true);try{const d=await api('personalSave',{fields:personal});notify(d.message,'success');setEditing(false)}
 catch(e){notify(e.message,'error')}finally{setSaving(false)}};
 const request=async e=>{e.preventDefault();if(requesting)return;setRequesting(true);try{const d=await api('skillReviewRequest',{skill,reason});
 notify(d.message,'success');setSkill('');setReason('')}catch(e){notify(e.message,'error')}finally{setRequesting(false)}};
 const confirmed=new Set(profile?.certifications||[]);
 const name=personal.displayName||auth.currentUser?.displayName||auth.currentUser?.email?.split('@')[0]||'Colaborador';
 return <section className="ti-premium team-page">
  <p className="eyebrow">MINHA JORNADA · {membership.unitId.toUpperCase()}</p>
  <div className="ti-premium-hero">
   <div className="ti-premium-avatar"><UserRound size={35}/></div>
   <div className="ti-premium-identity"><p>Meu espaço profissional <Sparkles size={17}/></p><h1>{name}</h1>
    <span>{profile?.jobTitle||'Perfil em construção'} · {profile?.sector||'Sua equipe'} · {shifts[profile?.shift]||'Turno a definir'}</span>
   </div>
   <span className="ti-premium-unit">Triamicci Intelligence</span>
  </div>
  {loading&&<p role="status">Preparando sua jornada profissional...</p>}
  {error&&<p role="alert" className="team-error">{error} <button type="button" onClick={load}>Tentar novamente</button></p>}
  {!loading&&!error&&<>
   <div className="ti-premium-stats">
    <article><Award size={23}/><strong>{recognition?.points??0}</strong><span>Pontos de evolução</span></article>
    <article><CheckCircle2 size={23}/><strong>{recognition?.confirmed??0}</strong><span>Habilidades confirmadas</span></article>
    <article><Star size={23}/><strong>{recognition?.assigned??0}</strong><span>Habilidades atribuídas</span></article>
   </div>
   <div className="ti-premium-content">
    <section className="ti-premium-card ti-premium-skills">
     <div className="ti-premium-cardhead"><div><p className="ti-premium-kicker">MEU CRESCIMENTO</p><h2><Award size={22}/> Habilidades e conquistas</h2></div><span className="ti-premium-level">{recognition?.level||'Primeiros passos'}</span></div>
     <p>Suas competências são parte da sua trajetória. As confirmações são feitas pela gerência.</p>
     <div className="ti-premium-skillgrid">{profile?.skills?.length?profile.skills.map(s=><article key={s} className={'ti-premium-skill'+(confirmed.has(s)?' verified':'')}>
       <div className="ti-premium-skill-icon">{confirmed.has(s)?<ShieldCheck size={22}/>:<Target size={22}/>}</div>
       <strong>{skills[s]||s}</strong><span>{confirmed.has(s)?'Confirmada pela gerência':'Atribuída · em evolução'}</span>
      </article>):<div className="ti-premium-empty">Suas habilidades aparecerão aqui quando a gerência as cadastrar.</div>}</div>
     <p className="ti-premium-footnote">Cada habilidade confirmada vale 100 pontos de evolução simbólica. Não representa salário, avaliação ou ranking.</p>
    </section>
    <section className="ti-premium-card"><div className="ti-premium-cardhead"><h2><Pencil size={21}/> Meu espaço</h2><button type="button" className="ti-premium-ghost" onClick={()=>setEditing(v=>!v)}>{editing?'Cancelar':'Editar minhas informações'}</button></div>
     {editing?<form className="ti-premium-form" onSubmit={save}>
      <label>Nome de exibição<input maxLength={60} value={personal.displayName} onChange={e=>setPersonal(p=>({...p,displayName:e.target.value}))}/></label>
      <label>Sobre mim<textarea maxLength={220} value={personal.bio} onChange={e=>setPersonal(p=>({...p,bio:e.target.value}))}/></label>
      <label>Meu objetivo profissional<textarea maxLength={180} value={personal.developmentGoal} onChange={e=>setPersonal(p=>({...p,developmentGoal:e.target.value}))}/></label>
      <label>Turno de preferência<select value={personal.preferredShift} onChange={e=>setPersonal(p=>({...p,preferredShift:e.target.value}))}><option value="">Não informado</option>{Object.entries(shifts).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar meu espaço'}</button>
     </form>:<div className="ti-premium-about"><p>{personal.bio||'Conte um pouco sobre seu trabalho e o que gosta de fazer.'}</p>
      <p><Target size={17}/> <strong>Meu objetivo:</strong> {personal.developmentGoal||'Ainda não definido'}</p>
      <p><Clock3 size={17}/> <strong>Turno preferido:</strong> {shifts[personal.preferredShift]||'Não informado'}</p></div>}
     <p className="ti-premium-footnote">Estas preferências não alteram seu cargo, permissões ou escala oficial.</p>
    </section>
    <section className="ti-premium-card"><h2><Clock3 size={21}/> Minha jornada habitual</h2>
     {profile?.availability?.length?<div className="ti-premium-schedule">{profile.availability.map(d=><div key={d.day}>
      <strong>{days[d.day]||d.day}</strong><span>{d.start}–{d.end}</span><small>Pausa {d.breakStart}–{d.breakEnd}</small></div>)}</div>:<p>Jornada ainda não cadastrada pela gerência.</p>}
    </section>
    <section className="ti-premium-card"><h2><Send size={21}/> Quero desenvolver uma habilidade</h2>
     <p>Conte à gerência qual habilidade gostaria de ter revisada. O pedido não confirma a habilidade automaticamente.</p>
     <form className="ti-premium-form" onSubmit={request}>
      <label>Habilidade<select required value={skill} onChange={e=>setSkill(e.target.value)}><option value="">Escolha uma habilidade</option>{Object.entries(skills).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Por que gostaria dessa revisão?<textarea required minLength={10} maxLength={400} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Conte quais atividades você já pratica ou deseja aprender."/></label>
      <button disabled={requesting||!skill||reason.trim().length<10} type="submit">{requesting?'Enviando...':'Enviar solicitação'}</button>
     </form>
    </section>
   </div>
  </>}
 </section>;
}
