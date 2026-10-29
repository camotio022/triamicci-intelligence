import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth} from './firebase.js';
import {Award,Star,Sparkles,Clock3,CheckCircle2,UserRound,Pencil,Target,Send,ShieldCheck,Camera,CalendarDays,Building2,ChefHat} from 'lucide-react';
import {useFeedback} from './FeedbackProvider.jsx';
import './profile-premium.css';
import './profile-v5.css';
import PhotoCropDialog from './PhotoCropDialog.jsx';
import MyCoverageProposals from './MyCoverageProposals.jsx';
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
export default function MyProfessionalProfile({membership,attendance=null}){
 const {notify}=useFeedback(),[profile,setProfile]=useState(null),[personal,setPersonal]=useState(blank),[recognition,setRecognition]=useState(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[editing,setEditing]=useState(false);
 const [section,setSection]=useState('overview');
 const [photoMenu,setPhotoMenu]=useState(false);
 const editingRef=useRef(false);editingRef.current=editing;
 const [syncedAt,setSyncedAt]=useState(null);const [avatar,setAvatar]=useState(null);const [uploading,setUploading]=useState(false);
 const [photoFile,setPhotoFile]=useState(null);const [registryCode,setRegistryCode]=useState(''),[claiming,setClaiming]=useState(false);
 const [error,setError]=useState(''),[skill,setSkill]=useState(''),[reason,setReason]=useState(''),[requesting,setRequesting]=useState(false);
 const load=useCallback(async(silent=false)=>{if(!silent)setLoading(true);setError('');try{const data=await api('myProfile');
 setProfile(data.professional);setAvatar(data.avatar||null);if(!editingRef.current)setPersonal({...blank,...(data.personal||{})});setRecognition(data.recognition);setSyncedAt(new Date());
 }catch(e){if(!silent)setError(e.message)}finally{if(!silent)setLoading(false)}},[]);
 useUnitLive(membership?.unitId,()=>load(true));
 useEffect(()=>{load()},[load]);
 const uploadAvatar=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15_000_000){notify('Escolha uma foto JPG, PNG ou WebP de até 15 MB.','error');return;}
  setPhotoFile(file);
 };
 const saveAvatar=async encoded=>{setUploading(true);try{const result=await api('avatarSave',{avatar:encoded});setAvatar(encoded);window.dispatchEvent(new Event('ti-avatar-updated'));setPhotoFile(null);notify(result.message,'success')}
  catch(e){notify(e.message,'error')}finally{setUploading(false)}};
 const removeAvatar=async()=>{if(uploading)return;setUploading(true);try{const d=await api('avatarRemove');setAvatar(null);window.dispatchEvent(new Event('ti-avatar-updated'));notify(d.message,'success')}catch(e){notify(e.message,'error')}finally{setUploading(false)}};
 const save=async e=>{e.preventDefault();if(saving)return;setSaving(true);try{const d=await api('personalSave',{fields:personal});notify(d.message,'success');setEditing(false);await load(true)}
 catch(e){notify(e.message,'error')}finally{setSaving(false)}};
 const request=async e=>{e.preventDefault();if(requesting)return;setRequesting(true);try{const d=await api('skillReviewRequest',{skill,reason});
 notify(d.message,'success');setSkill('');setReason('')}catch(e){notify(e.message,'error')}finally{setRequesting(false)}};
 const requestRegistryLink=async e=>{e.preventDefault();setClaiming(true);try{const result=await api('masterRegistryClaim',{id:registryCode.trim()});notify(result.message,'success');setRegistryCode('')}catch(err){notify(err.message,'error')}finally{setClaiming(false)}};
 const confirmed=new Set(profile?.certifications||[]);
 const name=personal.displayName||auth.currentUser?.displayName||auth.currentUser?.email?.split('@')[0]||'Colaborador';
 return <section className="ti-premium team-page ti-profile-v5">
  <div className="ti-premium-hero ti-profile-v5-hero">
   <div className="ti-profile-v5-mainline">
    <div className="ti-avatar-editor"><div className="ti-premium-avatar">{avatar?<img src={avatar} alt="Minha foto de perfil"/>:<UserRound size={31}/>}</div><button type="button" className="ti-profile-v5-camera" aria-label="Alterar minha foto" onClick={()=>setPhotoMenu(v=>!v)}><Camera size={15}/></button>
      {photoMenu&&<div className="ti-profile-v5-photoactions"><label>Trocar foto<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>{uploadAvatar(e);setPhotoMenu(false)}}/></label>{avatar&&<button type="button" onClick={()=>{removeAvatar();setPhotoMenu(false)}} disabled={uploading}>Remover foto</button>}</div>}
    </div>
    <div className="ti-premium-identity"><p>Meu perfil profissional</p><h1>{name}</h1><span>{profile?.jobTitle||'Perfil em construção'} · {profile?.sector||'Sua equipe'} · {shifts[profile?.shift]||'Turno a definir'}</span></div>
    <div className="ti-profile-v5-hero-actions"><span className="ti-profile-v5-active"><CheckCircle2 size={13}/> Meu perfil</span><button type="button" onClick={()=>setSection('settings')}><Pencil size={14}/> Editar perfil</button></div>
   </div>
   <div className="ti-profile-v5-identity-meta"><span><ChefHat size={18}/><small>Cargo</small><strong>{profile?.jobTitle||'Não informado'}</strong></span><span><Building2 size={18}/><small>Unidade</small><strong>{membership?.unitId||'—'}</strong></span><span><Clock3 size={18}/><small>Turno</small><strong>{shifts[profile?.shift]||'—'}</strong></span></div>
  </div>
  {photoFile&&<PhotoCropDialog file={photoFile} busy={uploading} onCancel={()=>setPhotoFile(null)} onSave={saveAvatar}/>}
  {loading&&<p role="status">Preparando sua jornada profissional...</p>}
  {error&&<p role="alert" className="team-error">{error} <button type="button" onClick={load}>Tentar novamente</button></p>}
  {(['overview','journey','schedule'].includes(section))&&attendance&&<div className="ti-my-profile-attendance">{attendance}<p className="ti-sync-status" role="status">{syncedAt?`Perfil atualizado · ${syncedAt.toLocaleTimeString("pt-BR")}`:"Sincronizando perfil…"}</p></div>}
  {!loading&&!error&&<>
   {section==='skills'&&   <div className="ti-premium-stats">
    <article><Award size={23}/><strong>{recognition?.points??0}</strong><span>Pontos de evolução</span></article>
    <article><CheckCircle2 size={23}/><strong>{recognition?.confirmed??0}</strong><span>Habilidades confirmadas</span></article>
    <article><Star size={23}/><strong>{recognition?.assigned??0}</strong><span>Habilidades atribuídas</span></article>
   </div>}
   {section==='overview'&&<section className="ti-profile-v5-overview"><div><Star size={21}/><strong>Habilidades e conquistas</strong><button type="button" onClick={()=>setSection('skills')}>Ver todas ›</button></div><p>Competências revisadas e confirmadas pela gerência.</p><div className="ti-profile-v5-statcards"><article><Award size={20}/><strong>{recognition?.confirmed??0}</strong><small>Confirmadas</small></article><article><Target size={20}/><strong>{recognition?.points??0}</strong><small>Pontos de evolução</small></article><article><Star size={20}/><strong>{recognition?.assigned??0}</strong><small>Atribuídas</small></article></div><button type="button" className="ti-profile-v5-skill-link" onClick={()=>setSection('skills')}>Ver minhas habilidades <span>›</span></button></section>}
   <div className="ti-premium-content">
    {section==='skills'&&<section className="ti-premium-card ti-premium-skills">
     <div className="ti-premium-cardhead"><div><p className="ti-premium-kicker">MEU CRESCIMENTO</p><h2><Award size={22}/> Habilidades e conquistas</h2></div><span className="ti-premium-level">{recognition?.level||'Primeiros passos'}</span></div>
     <p>Suas competências são parte da sua trajetória. As confirmações são feitas pela gerência.</p>
     <div className="ti-premium-skillgrid">{profile?.skills?.length?profile.skills.map(s=><article key={s} className={'ti-premium-skill'+(confirmed.has(s)?' verified':'')}>
       <div className="ti-premium-skill-icon">{confirmed.has(s)?<ShieldCheck size={22}/>:<Target size={22}/>}</div>
       <strong>{skills[s]||s}</strong><span>{confirmed.has(s)?'Confirmada pela gerência':'Atribuída · em evolução'}</span>
      </article>):<div className="ti-premium-empty">Suas habilidades aparecerão aqui quando a gerência as cadastrar.</div>}</div>
     <p className="ti-premium-footnote">Cada habilidade confirmada vale 100 pontos de evolução simbólica. Não representa salário, avaliação ou ranking.</p>
    </section>}
    {section==='settings'&&<section className="ti-premium-card"><div className="ti-premium-cardhead"><h2><Pencil size={21}/> Meu espaço</h2><button type="button" className="ti-premium-ghost" onClick={()=>setEditing(v=>!v)}>{editing?'Cancelar':'Editar minhas informações'}</button></div>
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
    </section>}
    {section==='settings'&&<section className="ti-premium-card"><h2><Clock3 size={21}/> Horários habituais cadastrados</h2>
     {profile?.availability?.length?<div className="ti-premium-schedule">{profile.availability.map(d=><div key={d.day}>
      <strong>{days[d.day]||d.day}</strong><span>{d.start}–{d.end}</span><small>Pausa {d.breakStart}–{d.breakEnd}</small></div>)}</div>:<p>Jornada ainda não cadastrada pela gerência.</p>}
    </section>}
    {section==='requests'&&<MyCoverageProposals unitId={membership.unitId}/>}
    {section==='settings'&&<section className="ti-premium-card"><h2><UserRound size={21}/> Vincular minha ficha ao Cadastro Mestre</h2><p>Peça à gerência o código da sua ficha. A vinculação somente ocorrerá após confirmação da identidade pela gerência; suas permissões não mudam.</p><form className="ti-premium-form" onSubmit={requestRegistryLink}><label>Código da ficha<input required maxLength={128} pattern="[A-Za-z0-9_-]+" value={registryCode} onChange={e=>setRegistryCode(e.target.value)} placeholder="Código fornecido pela gerência"/></label><button type="submit" disabled={claiming||!registryCode.trim()}>Solicitar vínculo</button></form></section>}
    {section==='skills'&&<section className="ti-premium-card"><h2><Send size={21}/> Quero desenvolver uma habilidade</h2>
     <p>Conte à gerência qual habilidade gostaria de ter revisada. O pedido não confirma a habilidade automaticamente.</p>
     <form className="ti-premium-form" onSubmit={request}>
      <label>Habilidade<select required value={skill} onChange={e=>setSkill(e.target.value)}><option value="">Escolha uma habilidade</option>{Object.entries(skills).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Por que gostaria dessa revisão?<textarea required minLength={10} maxLength={400} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Conte quais atividades você já pratica ou deseja aprender."/></label>
      <button disabled={requesting||!skill||reason.trim().length<10} type="submit">{requesting?'Enviando...':'Enviar solicitação'}</button>
     </form>
    </section>}
   </div>
  </>}
 </section>;
}
