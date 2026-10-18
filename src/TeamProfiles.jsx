import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {validateProfessionalProfile} from '../server/team/profile-rules.js';
const sectors={cozinha:'Cozinha',frente:'Frente',caixa:'Caixa',apoio:'Apoio',gestao:'Gestão'};
const abilities={preparo:'Preparo',montagem:'Montagem',chapa:'Chapa',vitrine:'Vitrine',vendas:'Vendas',ifood:'iFood',caixa:'Caixa',recebimento:'Recebimento',estoque:'Estoque',lideranca:'Liderança'};
const shifts={manha:'Manhã',noite:'Noite',intermediario:'Intermediário',variavel:'Variável'};
const days={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta',sab:'Sábado',dom:'Domingo'};
const blank=()=>({sector:'cozinha',jobTitle:'Auxiliar de cozinha',skills:[],certifications:[],shift:'manha',availability:[],notes:''});
async function api(action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Sessão expirada.');
 const token=await user.getIdToken();
 const res=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Não foi possível carregar equipe.');return data;
}
export default function TeamProfiles({membership,initialTab='profiles'}){
 const [members,setMembers]=useState([]),[tab,setTab]=useState(initialTab),[selected,setSelected]=useState(''),
 [form,setForm]=useState(blank()),[error,setError]=useState(''),[notice,setNotice]=useState(''),
 [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[search,setSearch]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');
  try{const d=await api('profiles');setMembers(d.members||[])}
  catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);
 const filtered=useMemo(()=>members.filter(m=>(m.name+' '+m.email+' '+(m.professional?.jobTitle||'')).toLowerCase().includes(search.toLowerCase())),[members,search]);
 const current=members.find(x=>x.uid===selected);
 const editable=current&&(membership.role==='admin'||['cook','auxiliar'].includes(current.role));
 const select=m=>{setSelected(m.uid);setForm(m.professional?structuredClone(m.professional):blank());setNotice('');setError('');setTab('profiles')};
 const update=(key,value)=>setForm(old=>({...old,[key]:value}));
 const toggle=(key,value)=>setForm(old=>{const arr=old[key].includes(value)?old[key].filter(x=>x!==value):[...old[key],value];
  return {...old,[key]:arr,...(key==='skills'?{certifications:old.certifications.filter(x=>arr.includes(x))}:{})}});
 const setDay=(day,checked)=>setForm(old=>({...old,availability:checked?[...old.availability,{day,start:'08:00',end:'17:00',breakStart:'12:00',breakEnd:'13:00'}]:old.availability.filter(x=>x.day!==day)}));
 const setTime=(day,key,value)=>setForm(old=>({...old,availability:old.availability.map(x=>x.day===day?{...x,[key]:value}:x)}));
 const save=async e=>{e.preventDefault();if(!selected||saving)return;
  if(!validateProfessionalProfile(form)){setError('Confira os horários completos: entrada anterior à saída e pausa dentro da jornada. Confira também as habilitações.');return;}
  setSaving(true);setNotice('');setError('');
  try{const d=await api('profileSave',{uid:selected,profile:form});setNotice(d.message);await load()}
  catch(e){setError(e.message)}finally{setSaving(false)}};
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
  {tab==='profiles'&&current&&<form className="team-edit-form team-profile-form" onSubmit={save}>
    <h3>Ficha profissional · {current.name||current.email}</h3>
    {!editable&&<p className="team-warning">Este perfil é protegido e não pode ser alterado pelo seu nível de acesso.</p>}
    <label>Setor</label><select disabled={!editable} value={form.sector} onChange={e=>update('sector',e.target.value)}>{Object.entries(sectors).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>
    <label>Cargo operacional (não altera permissões)</label><input disabled={!editable} required maxLength={80} minLength={2} value={form.jobTitle} onChange={e=>update('jobTitle',e.target.value)}/>
    <label>Turno habitual</label><select disabled={!editable} value={form.shift} onChange={e=>update('shift',e.target.value)}>{Object.entries(shifts).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    <h4>Habilidades informadas</h4>
    <div className="team-skills-grid">{Object.entries(abilities).map(([v,l])=><label key={v}><input disabled={!editable} type="checkbox" checked={form.skills.includes(v)} onChange={()=>toggle('skills',v)}/>{l}</label>)}</div>
    <h4>Habilitações confirmadas pela gerência</h4><p className="team-note">Marque somente habilitações verificadas internamente. Este registro não substitui certificação legal.</p>
    <div className="team-skills-grid">{form.skills.map(v=><label key={v}><input disabled={!editable} type="checkbox" checked={form.certifications.includes(v)} onChange={()=>toggle('certifications',v)}/>{abilities[v]}</label>)}</div>
    <h4>Disponibilidade semanal habitual</h4><p className="team-note">Dados de referência para o próximo módulo de escalas; não autorizam folgas ou trabalho fora da jornada.</p>
    {Object.entries(days).map(([key,label])=>{const d=form.availability.find(x=>x.day===key);return <div key={key} className="team-availability-day">
     <label className="team-checkbox"><input disabled={!editable} type="checkbox" checked={Boolean(d)} onChange={e=>setDay(key,e.target.checked)}/>{label}</label>
     {d&&<div className="team-times-grid">{[['start','Entrada'],['end','Saída'],['breakStart','Início da pausa'],['breakEnd','Fim da pausa']].map(([field,text])=><label key={field}>{text}<input disabled={!editable} type="time" value={d[field]} onChange={e=>setTime(key,field,e.target.value)}/></label>)}</div>}
    </div>})}
    <label>Observações profissionais</label><textarea maxLength={240} disabled={!editable} value={form.notes} onChange={e=>update('notes',e.target.value)}/>
    <div className="team-edit-actions">{editable&&<button disabled={saving} type="submit">{saving?'Salvando...':'Salvar ficha'}</button>}<button type="button" className="team-secondary" onClick={()=>setSelected('')}>Fechar</button></div>
   </form>}
  {tab==='matrix'&&<div className="inventory-table-wrap team-matrix-scroll" role="region" aria-label="Matriz de habilidades" tabIndex={0}><table className="inventory-table"><thead><tr><th>Colaborador</th><th>Setor</th>{Object.entries(abilities).map(([k,l])=><th key={k}>{l}</th>)}</tr></thead><tbody>{filtered.map(m=><tr key={m.uid}><td>{m.name||m.email}</td><td>{sectors[m.professional?.sector]||'—'}</td>{Object.keys(abilities).map(k=><td key={k}>{m.professional?.certifications?.includes(k)?'✓ Confirmada':m.professional?.skills?.includes(k)?'Declarada':'—'}</td>)}</tr>)}</tbody></table></div>}
  {tab==='shifts'&&<div className="team-member-list">{filtered.map(m=><article key={m.uid} className="team-member"><div className="team-member-info"><strong>{m.name||m.email}</strong><span>{shifts[m.professional?.shift]||'Sem turno cadastrado'}</span><span>{m.professional?.availability?.length?m.professional.availability.map(d=>days[d.day]+': '+d.start+'–'+d.end+' (pausa '+d.breakStart+'–'+d.breakEnd+')').join(' · '):'Disponibilidade não cadastrada'}</span></div><button className="team-member-edit" type="button" onClick={()=>select(m)}>Editar ficha</button></article>)}</div>}
 </section>;
}
