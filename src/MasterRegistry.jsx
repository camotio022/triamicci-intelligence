import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
const skillOptions={cozinha:['preparo','montagem','chapa','recebimento','estoque','etiquetagem'],frente:['vitrine','vendas','ifood'],caixa:['caixa','vendas','ifood'],apoio:['recebimento','estoque','etiquetagem','montagem'],gestao:['lideranca','recebimento','estoque','etiquetagem']};
const days=['Domingo','Segunda','Terça','Quarta','Quinta'];
const states={existing:'Ficha existente',needs_review:'Possível conta existente',ambiguous:'Duplicidade',new:'Sem correspondência'};
async function api(action,extra={}){
 const token=await auth.currentUser?.getIdToken();
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Erro ao consultar cadastro.');return data;
}
export default function MasterRegistry(){
 const [claims,setClaims]=useState([]),[editing,setEditing]=useState(null),[form,setForm]=useState({}),[data,setData]=useState(null),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{setBusy(true);setError('');try{const v=await api('masterRegistryPreview');setData(v);const claimsData=await api('masterRegistryClaims');setClaims(claimsData.claims||[]);setSelected([])}catch(e){setError(e.message)}finally{setBusy(false)}},[]);
 useEffect(()=>{refresh()},[refresh]);
 const selectable=(data?.people||[]).filter(p=>p.state==='new');
 const linkAccount=async(claim)=>{if(!window.confirm('Confirmou pessoalmente que esta conta pertence ao colaborador?'))return;setBusy(true);try{const d=await api('masterRegistryLink',{id:claim.registryId,uid:claim.accountUid});setNotice(d.message);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const importSelected=async()=>{
  if(!selected.length||!window.confirm('Criar '+selected.length+' fichas sem login? Contas já existentes não serão modificadas.'))return;
  setBusy(true);setError('');
  try{const r=await api('masterRegistryImport',{confirm:true,names:selected});setNotice(r.message);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const openEdit=p=>{setEditing(p.id);setForm({jobTitle:p.jobTitle||'',sector:p.sector||'cozinha',shift:p.shift||'manha',fixedWeekday:p.fixedWeekday||1,status:p.status||'active',skills:p.skills||[],certifications:p.certifications||[]});setError('');};
 const toggleSkill=(skill)=>setForm(old=>{const skills=old.skills.includes(skill)?old.skills.filter(s=>s!==skill):[...old.skills,skill];return {...old,skills,certifications:old.certifications.filter(s=>skills.includes(s))}});
 const saveEdit=async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await api('masterRegistryUpdate',{id:editing,changes:form});setNotice(r.message);setEditing(null);await refresh()}catch(err){setError(err.message)}finally{setBusy(false)}};
 return <section className="ti-planning-card" style={{padding:20,maxWidth:1000,margin:'auto'}}>
  <h2>Cadastro Mestre de Colaboradores</h2>
  <p>Levantamento inicial dos 12 colaboradores ativos. As contas de teste não são consideradas funcionários automaticamente. Possíveis correspondências precisam de revisão manual.</p>
  {error&&<p role="alert" style={{color:'#ad2727'}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <button type="button" onClick={refresh} disabled={busy}>Atualizar conferência</button>
  <p><strong>{data?.registry?.length||0}</strong> fichas no Cadastro Mestre; <strong>{data?.accounts?.length||0}</strong> contas encontradas na unidade. Não há vínculo automático.</p>
  <div style={{overflowX:'auto'}}>
   <table style={{width:'100%',borderCollapse:'collapse'}}>
    <thead><tr><th>Importar</th><th>Colaborador</th><th>Cargo / setor</th><th>Turno</th><th>Folga</th><th>Conciliação</th></tr></thead>
    <tbody>{(data?.people||[]).map(p=><tr key={p.name} style={{borderBottom:'1px solid #ddd'}}>
     <td><input type="checkbox" aria-label={'Selecionar '+p.name} checked={selected.includes(p.name)} disabled={busy||p.state!=='new'} onChange={e=>setSelected(old=>e.target.checked?[...old,p.name]:old.filter(x=>x!==p.name))}/></td>
     <td>{p.name}</td><td>{p.jobTitle} · {p.sector}</td><td>{p.shift==='manha'?'Manhã':'Noite'}</td><td>{days[p.fixedWeekday]}</td><td>{states[p.state]}{p.accountMatches>0?' ('+p.accountMatches+' conta(s) possível(is))':''}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <h3>Vínculos solicitados pelos próprios usuários</h3>
  {!claims.length&&<p>Nenhuma solicitação pendente.</p>}
  {claims.map(claim=><article key={claim.id} style={{padding:12,border:'1px solid #ddd',borderRadius:8,marginBottom:8}}><strong>{data?.registry?.find(p=>p.id===claim.registryId)?.name||'Ficha '+claim.registryId}</strong> · Conta {data?.accounts?.find(x=>x.uid===claim.accountUid)?.name||claim.accountUid}<p>Confirme a identidade do colaborador antes de vincular. Nome parecido não é comprovação.</p><button type="button" disabled={busy} onClick={()=>linkAccount(claim)}>Confirmar vínculo</button></article>)}
  <h3>Fichas já criadas</h3>
  {!data?.registry?.length&&<p>Nenhuma ficha cadastrada nesta unidade.</p>}
  <div style={{display:'grid',gap:8}}>
   {(data?.registry||[]).map(p=><article key={p.id} style={{border:'1px solid #ccc',borderRadius:8,padding:12}}>
    <strong>{p.name}</strong> · {p.jobTitle||'Cargo pendente'} · {p.status==='inactive'?'Desligado':'Ativo'}
    <div><small>{p.sector} · {p.shift} · {days[p.fixedWeekday]||'Folga pendente'} · {p.accountUid?'Conta vinculada':'Sem conta vinculada'}</small></div>
    <button type="button" disabled={busy} onClick={()=>openEdit(p)}>Abrir ficha</button>
   </article>)}
  </div>
  {editing&&<form onSubmit={saveEdit} style={{display:'grid',gap:8,border:'1px solid #aaa',padding:16,borderRadius:8,marginTop:12}}>
   <h3>Editar ficha · {data.registry.find(p=>p.id===editing)?.name}</h3>
   <label>Cargo <input required maxLength={80} value={form.jobTitle} onChange={e=>setForm(old=>({...old,jobTitle:e.target.value}))}/></label>
   <label>Setor <select value={form.sector} onChange={e=>setForm(old=>({...old,sector:e.target.value,skills:[],certifications:[]}))}>{[['cozinha','Cozinha'],['frente','Frente'],['caixa','Caixa'],['apoio','Apoio'],['gestao','Gestão']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Turno <select value={form.shift} onChange={e=>setForm(old=>({...old,shift:e.target.value}))}>{[['manha','Manhã'],['noite','Noite'],['intermediario','Intermediário'],['variavel','Variável']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Folga fixa <select value={form.fixedWeekday} onChange={e=>setForm(old=>({...old,fixedWeekday:Number(e.target.value)}))}>{[1,2,3,4].map(i=><option key={i} value={i}>{days[i]}</option>)}</select></label>
   <fieldset><legend>Habilidades confirmadas</legend>{(skillOptions[form.sector]||[]).map(skill=><label key={skill} style={{display:'inline-flex',alignItems:'center',gap:4,marginRight:12}}><input type="checkbox" checked={form.skills.includes(skill)} onChange={()=>toggleSkill(skill)}/>{skill}</label>)}</fieldset>
   <fieldset><legend>Certificações validadas</legend>{form.skills.map(skill=><label key={skill} style={{display:'inline-flex',gap:4,marginRight:12}}><input type="checkbox" checked={form.certifications.includes(skill)} onChange={()=>setForm(old=>({...old,certifications:old.certifications.includes(skill)?old.certifications.filter(x=>x!==skill):[...old.certifications,skill]}))}/>{skill}</label>)}</fieldset>
   <label>Situação <select value={form.status} onChange={e=>setForm(old=>({...old,status:e.target.value}))}><option value="active">Ativo</option><option value="inactive">Desligado</option></select></label>
   <p>Não altera a conta de acesso nem as escalas já publicadas.</p>
   <button type="submit" disabled={busy}>Salvar ficha</button>
   <button type="button" onClick={()=>setEditing(null)}>Cancelar</button>
  </form>}
  <p>Colaboradores com correspondência ficam bloqueados para importação até conferirmos identidade e vínculo. Daniel e Geraldo não participam desta importação.</p>
  <button type="button" onClick={importSelected} disabled={busy||selected.length===0}>Criar {selected.length} ficha(s) selecionada(s)</button>
  <button type="button" onClick={()=>setSelected(selectable.map(p=>p.name))} disabled={busy||!selectable.length} style={{marginLeft:8}}>Selecionar sem conflito</button>
 </section>;
}
