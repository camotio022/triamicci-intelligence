import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {Clock3,CheckCircle2,UserRound} from 'lucide-react';
const days={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta',sab:'Sábado',dom:'Domingo'};
const skills={preparo:'Preparo',montagem:'Montagem',chapa:'Chapa',vitrine:'Vitrine',vendas:'Vendas',ifood:'iFood',caixa:'Caixa',recebimento:'Recebimento',estoque:'Estoque',lideranca:'Liderança'};
export default function MyProfessionalProfile({membership}){
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{
 const token=await auth.currentUser.getIdToken();const res=await fetch('/api/members/manage',{
 method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'myProfile'})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Erro na consulta.');
 if(active)setProfile(data.professional||null);
 }catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 return <section className="team-page ti-my-profile">
  <p className="eyebrow">MINHA EQUIPE · UNIDADE {membership.unitId.toUpperCase()}</p><h1><UserRound size={24}/> Minha ficha profissional</h1>
  <p>Consulte suas atribuições. Alterações e habilitações são registradas pela gerência.</p>
  {loading&&<p role="status">Carregando sua ficha...</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&!profile&&<div className="team-panel">Ainda não foi cadastrada uma ficha profissional para você.</div>}
  {profile&&<div className="ti-my-profile-grid">
   <div className="team-panel"><h2>Atuação</h2><p><strong>Cargo:</strong> {profile.jobTitle}</p><p><strong>Setor:</strong> {profile.sector}</p><p><strong>Turno:</strong> {profile.shift}</p></div>
   <div className="team-panel"><h2>Minhas habilidades</h2><div className="team-member-tags">{profile.skills?.length?profile.skills.map(s=><span key={s}>{skills[s]||s}</span>):<p>Nenhuma habilidade atribuída.</p>}</div><h3>Habilitações confirmadas</h3>{profile.certifications?.length?profile.certifications.map(s=><p key={s}><CheckCircle2 size={16}/> {skills[s]||s}</p>):<p>Nenhuma habilitação confirmada.</p>}</div>
   <div className="team-panel"><h2><Clock3 size={19}/> Jornada habitual</h2>{profile.availability?.length?profile.availability.map(d=><p key={d.day}><strong>{days[d.day]||d.day}</strong> · {d.start} às {d.end} · pausa {d.breakStart} às {d.breakEnd}</p>):<p>Jornada não cadastrada.</p>}</div>
  </div>}
 </section>;
}
