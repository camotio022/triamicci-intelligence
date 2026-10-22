import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useMemo,useState,useRef} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import {DEFAULT_DAY,defaultAvailability} from '../server/team/ux-rules.js';
import {validateProfessionalProfile,eligibleSkills} from '../server/team/profile-rules.js';
const sectors={cozinha:'Cozinha',frente:'Frente',caixa:'Caixa',apoio:'Apoio',gestao:'Gestão'};
const abilities={preparo:'Preparo',montagem:'Montagem',chapa:'Chapa',vitrine:'Vitrine',vendas:'Vendas',ifood:'iFood',caixa:'Caixa',recebimento:'Recebimento',estoque:'Estoque',lideranca:'Liderança',etiquetagem:'Etiquetagem e validades'};
const shifts={manha:'Manhã',noite:'Noite',intermediario:'Intermediário',variavel:'Variável'};
const days={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta',sab:'Sábado',dom:'Domingo'};
const blank=()=>({sector:'cozinha',jobTitle:'Auxiliar de cozinha',skills:[],certifications:[],sectorExceptions:[],shift:'manha',availability:defaultAvailability(),notes:''});
async function api(action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Sessão expirada.');
 const token=await user.getIdToken();
 const res=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Não foi possível carregar equipe.');return data;
}
export default function TeamProfiles({membership,initialTab='profiles'}){
 const {notify}=useFeedback();
 const dialogRef=useRef(null);
 const [requests,setRequests]=useState([]);const [members,setMembers]=useState([]),[tab,setTab]=useState(initialTab),[selected,setSelected]=useState(''),
 [form,setForm]=useState(blank()),[error,setError]=useState(''),[notice,setNotice]=useState(''),
 [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[search,setSearch]=useState('');
 const load=useCallback(async(silent=false)=>{if(!silent)setLoading(true);setError('');
  try{const [reg,q]=await Promise.all([api('masterRegistryPreview'),api('skillReviewList')]);const registered=(reg.registry||[]).map(p=>({uid:p.id,name:p.name,status:p.status,registry:true,role:p.jobTitle==='Cozinheiro'?'cook':p.jobTitle==='Auxiliar de cozinha'?'auxiliar':'staff',professional:{sector:p.sector,jobTitle:p.jobTitle,shift:p.shift,availability:p.availability||[],skills:p.skills||[],certifications:p.certifications||[],notes:p.notes||'',sectorExceptions:[]}}));setMembers(registered);setRequests(q.requests||[])}
  catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useUnitLive(membership?.unitId,()=>load(true));
 useEffect(()=>{load()},[load]);
 useEffect(()=>{setTab(initialTab);setSelected('');setError('')},[initialTab]);
 const filtered=useMemo(()=>members.filter(m=>(m.name+' '+m.email+' '+(m.professional?.jobTitle||'')).toLowerCase().includes(search.toLowerCase())),[members,search]);
 const current=members.find(x=>x.uid===selected);
 const editable=current&&(current.registry||membership.role==='admin'||['cook','auxiliar'].includes(current.role));
 const select=m=>{setSelected(m.uid);setForm(m.professional?{...blank(),...structuredClone(m.professional)}:blank());setNotice('');setError('');setTab('profiles')};
 useEffect(()=>{if(!selected)return;const previous=document.activeElement;const onKey=e=>{if(e.key==='Escape'){setSelected('');return;}if(e.key!=='Tab')return;const controls=[...dialogRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')||[]];if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}};document.addEventListener('keydown',onKey);dialogRef.current?.querySelector('.ti-profile-close')?.focus();return()=>{document.removeEventListener('keydown',onKey);previous?.focus?.()}},[selected]);
 const update=(key,value)=>setForm(old=>({...old,[key]:value}));
 const toggle=(key,value)=>setForm(old=>{const arr=old[key].includes(value)?old[key].filter(x=>x!==value):[...old[key],value];
  return {...old,[key]:arr,...(key==='skills'?{certifications:old.certifications.filter(x=>arr.includes(x))}:{})}});
 const setDay=(day,checked)=>setForm(old=>({...old,availability:checked?[...old.availability,{day,...DEFAULT_DAY}]:old.availability.filter(x=>x.day!==day)}));
 const setTime=(day,key,value)=>setForm(old=>({...old,availability:old.availability.map(x=>x.day===day?{...x,[key]:value}:x)}));
 const save=async e=>{e.preventDefault();if(!selected||saving)return;
  if(!validateProfessionalProfile(form)){const msg='Confira os horários: entrada anterior à saída e pausa dentro da jornada. Confira também as habilitações.';setError(msg);notify(msg,'error');return;}
  setSaving(true);setNotice('');setError('');
  try{const d=current?.registry?await api('masterRegistryUpdate',{id:selected,changes:{sector:form.sector,jobTitle:form.jobTitle,shift:form.shift,skills:form.skills,certifications:form.certifications,availability:form.availability,notes:form.notes}}):await api('profileSave',{uid:selected,profile:form});setNotice(d.message);notify('Ficha profissional salva com sucesso.','success');await load()}
  catch(e){setError(e.message);notify(e.message,'error')}finally{setSaving(false)}};
 return <section className="team-panel team-profiles">
  <h2>Gestão operacional da equipe</h2>
  <p>Perfis profissionais, competências e disponibilidade habitual. Permissões de acesso continuam independentes.</p>
  <div className="team-delivery team-profiles-tabs" role="group" aria-label="Áreas da gestão de equipes">
   <button type="button" className={tab==='profiles'?'selected':''} onClick={()=>setTab('profiles')}>Ficha profissional</button>
   <button type="button" className={tab==='matrix'?'selected':''} onClick={()=>setTab('matrix')}>Matriz de habilidades</button>
   <button type="button" className={tab==='shifts'?'selected':''} onClick={()=>setTab('shifts')}>Turnos e disponibilidade</button>
  </div>
  <div className="team-directory-heading team-profiles-search"><label>Buscar colaborador
   <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, cargo ou e-mail"/>
  </label><button type="button" onClick={load} disabled={loading}>Atualizar</button></div>
  {requests.some(r=>r.status==='pending')&&<section className="team-review-requests" aria-label="Solicitações de revisão de habilidades">
   <h3>Solicitações de habilidades pendentes</h3><p>Analise os pedidos dos colaboradores e faça as alterações pela ficha profissional após confirmar a competência.</p>
   {requests.filter(r=>r.status==='pending').map(r=><article key={r.id}><strong>{members.find(m=>m.uid===r.uid)?.name||'Colaborador da unidade'}</strong>
    <span>Habilidade: {abilities[r.skill]||r.skill}</span><p>{r.reason}</p></article>)}
  </section>}
  {error&&<p role="alert" className="team-error">{error}</p>}
  {notice&&<p role="status" className="team-notice">{notice}</p>}
  {loading&&<p>Carregando perfis reais da unidade...</p>}
  {tab==='profiles'&&<div className="team-member-list team-profiles-list">
   {filtered.map(m=><article className="team-member" key={m.uid}>
    <div className="team-member-info"><strong>{m.name||m.email}</strong><span>{m.professional?.jobTitle||'Perfil profissional pendente'}</span>
    <div className="team-member-tags"><span>{sectors[m.professional?.sector]||'Setor pendente'}</span><span>{shifts[m.professional?.shift]||'Turno pendente'}</span></div></div>
    <button type="button" className="team-member-edit" onClick={()=>select(m)}>Abrir ficha</button>
   </article>)}
   {!loading&&!filtered.length&&<p>Nenhum colaborador encontrado.</p>}
  </div>}
  {tab==='profiles'&&current&&<div className="ti-profile-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected('')}}><div className="ti-profile-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ti-profile-title"><header className="ti-profile-dialog-header"><div><span>GESTÃO · FICHA PROFISSIONAL</span><h3 id="ti-profile-title">{current.name||current.email}</h3></div><button type="button" className="ti-profile-close" onClick={()=>setSelected('')} aria-label="Fechar ficha">×</button></header><form className="team-edit-form team-profile-form" onSubmit={save}>
    {!editable&&<p className="team-warning">Este perfil é protegido e não pode ser alterado pelo seu nível de acesso.</p>}
    <label>Setor</label><select disabled={!editable} value={form.sector} onChange={e=>update('sector',e.target.value)}>{Object.entries(sectors).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>
    <label>Cargo operacional (não altera permissões)</label><input disabled={!editable} required maxLength={80} minLength={2} value={form.jobTitle} onChange={e=>update('jobTitle',e.target.value)}/>
    <label>Turno habitual</label><select disabled={!editable} value={form.shift} onChange={e=>update('shift',e.target.value)}>{Object.entries(shifts).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    <h4>Habilidades informadas</h4>
    <p className="team-note">Habilidades fora do setor ficam desabilitadas para novas atribuições. As já registradas permanecem no histórico.</p>
    <div className="team-skills-grid">{Object.entries(abilities).map(([v,l])=>{const permitted=(eligibleSkills(form.sector).includes(v)||(form.sectorExceptions||[]).includes(v)),historic=form.skills.includes(v);return <label key={v} title={!permitted?'Habilidade de outro setor':''}><input disabled={!editable||(!permitted&&!historic)} type="checkbox" checked={historic} onChange={()=>toggle('skills',v)}/>{l}{!permitted&&<small> · {historic?'histórico':'outro setor'}</small>}</label>})}</div>
    {membership.role==='admin'&&<><h4>Exceções multifuncionais autorizadas</h4><p className="team-note">Somente administradores podem autorizar novas habilidades fora do setor. A autorização não confirma a habilidade.</p><div className="team-skills-grid">{Object.entries(abilities).filter(([v])=>!eligibleSkills(form.sector).includes(v)).map(([v,l])=><label key={v}><input disabled={!editable} type="checkbox" checked={(form.sectorExceptions||[]).includes(v)} onChange={()=>toggle('sectorExceptions',v)}/>{l}</label>)}</div></>}
    <h4>Habilitações confirmadas pela gerência</h4><p className="team-note">Marque somente habilitações verificadas internamente. Este registro não substitui certificação legal.</p>
    <div className="team-skills-grid">{form.skills.map(v=><label key={v}><input disabled={!editable} type="checkbox" checked={form.certifications.includes(v)} onChange={()=>toggle('certifications',v)}/>{abilities[v]}</label>)}</div>
    <h4>Jornada habitual</h4><button type="button" disabled={!editable} className="team-secondary" onClick={()=>update('availability',defaultAvailability())}>Aplicar horário padrão (segunda a sábado)</button><p className="team-note">Dados de referência para o próximo módulo de escalas; não autorizam folgas ou trabalho fora da jornada.</p>
    {Object.entries(days).map(([key,label])=>{const d=form.availability.find(x=>x.day===key);return <div key={key} className="team-availability-day">
     <label className="team-checkbox"><input disabled={!editable} type="checkbox" checked={Boolean(d)} onChange={e=>setDay(key,e.target.checked)}/>{label}</label>
     {d&&<div className="team-times-grid">{[['start','Entrada'],['end','Saída'],['breakStart','Início da pausa'],['breakEnd','Fim da pausa']].map(([field,text])=><label key={field}>{text}<input disabled={!editable} type="time" value={d[field]} onChange={e=>setTime(key,field,e.target.value)}/></label>)}</div>}
    </div>})}
    <label>Observações profissionais</label><textarea maxLength={240} disabled={!editable} value={form.notes} onChange={e=>update('notes',e.target.value)}/>
    <div className="team-edit-actions">{editable&&<button disabled={saving} type="submit">{saving?'Salvando...':'Salvar ficha'}</button>}<button type="button" className="team-secondary" onClick={()=>setSelected('')}>Fechar</button></div>
   </form></div></div>}
  {tab==='matrix'&&<div className="inventory-table-wrap team-matrix-scroll" role="region" aria-label="Matriz de habilidades" tabIndex={0}><table className="inventory-table"><thead><tr><th>Colaborador</th><th>Setor</th>{Object.entries(abilities).map(([k,l])=><th key={k}>{l}</th>)}</tr></thead><tbody>{filtered.map(m=><tr key={m.uid}><td>{m.name||m.email}</td><td>{sectors[m.professional?.sector]||'—'}</td>{Object.keys(abilities).map(k=><td key={k}>{m.professional?.certifications?.includes(k)?<span className="ti-skill-status confirmed" title="Habilidade confirmada pela gerência" aria-label="Confirmada">✓</span>:m.professional?.skills?.includes(k)?<span className="ti-skill-status declared" title="Habilidade declarada, não certificada" aria-label="Declarada">•</span>:<span className="ti-skill-status missing" aria-label="Não atribuída">—</span>}</td>)}</tr>)}</tbody></table><p className="ti-skill-legend"><span>✓ Confirmada</span><span>• Declarada</span><span>— Sem registro</span></p></div>}
  {tab==='matrix'&&<div className="ti-skill-mobile" aria-label="Habilidades por colaborador">
   {filtered.map(m=>{const p=m.professional||{};const skills=Object.entries(abilities).filter(([key])=>p.skills?.includes(key)||p.certifications?.includes(key));return <article className="ti-skill-person" key={m.uid}>
    <div className="ti-skill-person-head"><strong>{m.name||m.email}</strong><small>{sectors[p.sector]||'Setor pendente'} · {p.jobTitle||'Cargo pendente'}</small></div>
    {skills.length?<div className="ti-skill-person-tags">{skills.map(([key,title])=><span key={key} className={p.certifications?.includes(key)?'confirmed':'declared'}><b aria-hidden="true">{p.certifications?.includes(key)?'✓':'•'}</b>{title}<small>{p.certifications?.includes(key)?'Confirmada':'Declarada'}</small></span>)}</div>:<p>Nenhuma habilidade cadastrada.</p>}
   </article>})}
   {!loading&&filtered.length===0&&<p>Nenhum colaborador encontrado.</p>}
  </div>}
  {tab==='shifts'&&<div className="team-shift-list">{filtered.map(m=><article key={m.uid} className="team-shift-card">
  <div className="team-shift-card-head"><div><strong>{m.name||m.email}</strong><span>{m.professional?.jobTitle||'Função não informada'} · {sectors[m.professional?.sector]||'Setor pendente'}</span></div><span className="team-shift-pill">{shifts[m.professional?.shift]||'Turno não definido'}</span></div>
  {(m.professional?.availability||[]).length>0?<details className="team-shift-details"><summary>Consultar jornada e intervalos</summary><div className="team-shift-hours">{Object.entries(days).map(([key,day])=>{const slot=(m.professional?.availability||[]).find(d=>d.day===key);return <div className="team-shift-hour" key={key}><span>{day}</span><strong>{slot?slot.start+'–'+slot.end:'Folga / sem jornada'}</strong>{slot&&<small>Intervalo {slot.breakStart}–{slot.breakEnd}</small>}</div>})}</div></details>:<p className="team-shift-empty">Disponibilidade ainda não cadastrada.</p>}
  <button className="team-member-edit" type="button" onClick={()=>{select(m);setTab('profiles')}}>Editar ficha</button>
 </article>)}</div>}
 </section>;
}
