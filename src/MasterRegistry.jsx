import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import './master-registry.css';
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
 const activate=async()=>{if(!window.confirm('Confirmou os 12 colaboradores, cargos, folgas e vínculos? Ativar esta base como fonte de novas escalas?'))return;setBusy(true);setError('');try{const d=await api('masterRegistryActivate',{confirm:true});setNotice(d.message);await refresh()}catch(err){setError(err.message);notifyLocal(err.message)}finally{setBusy(false)}};
 const notifyLocal=message=>setError(message);
 const linkAccount=async(claim)=>{if(!window.confirm('Confirmou pessoalmente que esta conta pertence ao colaborador?'))return;setBusy(true);try{const d=await api('masterRegistryLink',{id:claim.registryId,uid:claim.accountUid});setNotice(d.message);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const importSelected=async()=>{
  if(!selected.length||!window.confirm('Criar '+selected.length+' fichas sem login? Contas já existentes não serão modificadas.'))return;
  setBusy(true);setError('');
  try{const r=await api('masterRegistryImport',{confirm:true,names:selected});setNotice(r.message);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const openEdit=p=>{setEditing(p.id);setForm({jobTitle:p.jobTitle||'',sector:p.sector||'cozinha',shift:p.shift||'manha',fixedWeekday:p.fixedWeekday||1,status:p.status||'active',skills:p.skills||[],certifications:p.certifications||[]});setError('');};
 const toggleSkill=(skill)=>setForm(old=>{const skills=old.skills.includes(skill)?old.skills.filter(s=>s!==skill):[...old.skills,skill];return {...old,skills,certifications:old.certifications.filter(s=>skills.includes(s))}});
 const saveEdit=async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await api('masterRegistryUpdate',{id:editing,changes:form});setNotice(r.message);setEditing(null);await refresh()}catch(err){setError(err.message)}finally{setBusy(false)}};
 return <section className="ti-planning-card ti-master">
  <div className="ti-master-hero"><p className="ti-master-eyebrow">PESSOAS · GESTÃO</p><h2>Cadastro Mestre</h2><p>Uma única base de colaboradores. Contas de acesso e fichas profissionais são independentes.</p></div>
  <p className="ti-master-hint">Confira as correspondências antes de importar. Contas de teste nunca entram na equipe automaticamente.</p>
  {error&&<p role="alert" style={{color:'#ad2727'}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <div className="ti-master-toolbar"><button type="button" onClick={refresh} disabled={busy}>Atualizar</button><button type="button" className="ti-master-primary" onClick={()=>setSelected(selectable.map(p=>p.name))} disabled={busy||!selectable.length}>Selecionar sem conflito</button></div>
  <div className="ti-master-metrics"><div><strong>{data?.registry?.length||0}</strong><span>Fichas cadastradas</span></div><div><strong>{data?.accounts?.length||0}</strong><span>Contas da unidade</span></div><div><strong>{selectable.length}</strong><span>Sem conflito</span></div></div>
  <div className="ti-master-import-table">
   <table>
    <thead><tr><th>Importar</th><th>Colaborador</th><th>Cargo / setor</th><th>Turno</th><th>Folga</th><th>Conciliação</th></tr></thead>
    <tbody>{(data?.people||[]).map(p=><tr key={p.name}>
     <td data-label="Importar"><input type="checkbox" aria-label={'Selecionar '+p.name} checked={selected.includes(p.name)} disabled={busy||p.state!=='new'} onChange={e=>setSelected(old=>e.target.checked?[...old,p.name]:old.filter(x=>x!==p.name))}/></td>
     <td data-label="Colaborador"><strong>{p.name}</strong></td><td data-label="Função">{p.jobTitle} · {p.sector}</td><td data-label="Turno">{p.shift==='manha'?'Manhã':'Noite'}</td><td data-label="Folga">{days[p.fixedWeekday]}</td><td data-label="Conciliação">{states[p.state]}{p.state==='needs_review'&&<div><small>Código para reivindicação: <code>{p.seedId}</code></small></div>}{p.accountMatches>0?' ('+p.accountMatches+' conta(s) possível(is))':''}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <section className="ti-master-activation"><h3>Fonte oficial para escalas</h3><p>{data?.activated?'Cadastro Mestre ativado. Novas escalas usarão apenas as fichas ativas, não contas de teste.':'Ainda em conferência. Escalas continuam no modelo anterior até você ativar os 12 cadastros completos.'}</p><button type="button" disabled={busy||!data||data.activated} onClick={activate}>{data?.activated?'Cadastro ativado':'Ativar Cadastro Mestre após conferência'}</button></section>
  <h3>Vínculos solicitados pelos próprios usuários</h3>
  {!claims.length&&<p>Nenhuma solicitação pendente.</p>}
  {claims.map(claim=><article className="ti-master-claim" key={claim.id}><strong>{data?.registry?.find(p=>p.id===claim.registryId)?.name||data?.people?.find(p=>p.seedId===claim.registryId)?.name||'Ficha '+claim.registryId}</strong> · Conta {data?.accounts?.find(x=>x.uid===claim.accountUid)?.name||claim.accountUid}<p>Confirme a identidade do colaborador antes de vincular. Nome parecido não é comprovação.</p><button type="button" disabled={busy} onClick={()=>linkAccount(claim)}>Confirmar vínculo</button></article>)}
  <h3>Equipe cadastrada</h3>
  {!data?.registry?.length&&<p>Nenhuma ficha cadastrada nesta unidade.</p>}
  <div className="ti-master-cards">
   {(data?.registry||[]).map(p=><article className="ti-master-person" key={p.id}>
    <strong>{p.name}</strong> · {p.jobTitle||'Cargo pendente'} · {p.status==='inactive'?'Desligado':'Ativo'}
    <div><small>{p.sector} · {p.shift} · {days[p.fixedWeekday]||'Folga pendente'} · {p.accountUid?'Conta vinculada':'Sem conta vinculada'}</small></div><details className="ti-master-technical"><summary>Vincular conta existente</summary><p>Compartilhe este código apenas com o próprio colaborador.</p><code>{p.id}</code><button type="button" onClick={()=>navigator.clipboard?.writeText(p.id)}>Copiar código</button></details>
    <button type="button" disabled={busy} onClick={()=>openEdit(p)}>Abrir ficha</button>
   </article>)}
  </div>
  {editing&&<form onSubmit={saveEdit} className="ti-master-editor">
   <h3>Editar ficha · {data.registry.find(p=>p.id===editing)?.name}</h3>
   <label>Cargo <input required maxLength={80} value={form.jobTitle} onChange={e=>setForm(old=>({...old,jobTitle:e.target.value}))}/></label>
   <label>Setor <select value={form.sector} onChange={e=>setForm(old=>({...old,sector:e.target.value,skills:[],certifications:[]}))}>{[['cozinha','Cozinha'],['frente','Frente'],['caixa','Caixa'],['apoio','Apoio'],['gestao','Gestão']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Turno <select value={form.shift} onChange={e=>setForm(old=>({...old,shift:e.target.value}))}>{[['manha','Manhã'],['noite','Noite'],['intermediario','Intermediário'],['variavel','Variável']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Folga fixa <select value={form.fixedWeekday} onChange={e=>setForm(old=>({...old,fixedWeekday:Number(e.target.value)}))}>{[1,2,3,4].map(i=><option key={i} value={i}>{days[i]}</option>)}</select></label>
   <fieldset><legend>Habilidades confirmadas</legend>{(skillOptions[form.sector]||[]).map(skill=><label key={skill} className="ti-master-check"><input type="checkbox" checked={form.skills.includes(skill)} onChange={()=>toggleSkill(skill)}/>{skill}</label>)}</fieldset>
   <fieldset><legend>Certificações validadas</legend>{form.skills.map(skill=><label key={skill} className="ti-master-check"><input type="checkbox" checked={form.certifications.includes(skill)} onChange={()=>setForm(old=>({...old,certifications:old.certifications.includes(skill)?old.certifications.filter(x=>x!==skill):[...old.certifications,skill]}))}/>{skill}</label>)}</fieldset>
   <label>Situação <select value={form.status} onChange={e=>setForm(old=>({...old,status:e.target.value}))}><option value="active">Ativo</option><option value="inactive">Desligado</option></select></label>
   <p>Não altera a conta de acesso nem as escalas já publicadas.</p>
   <button type="submit" className="ti-master-primary" disabled={busy}>Salvar ficha</button>
   <button type="button" onClick={()=>setEditing(null)}>Cancelar</button>
  </form>}
  <p>Para pessoas com conta existente, compartilhe o código da ficha mostrado na prévia. O colaborador solicita o vínculo em Minha ficha; a gerência verifica a identidade e confirma aqui.</p>
  <p>Colaboradores com correspondência ficam bloqueados para importação até conferirmos identidade e vínculo. Daniel e Geraldo não participam desta importação.</p>
  {selectable.length>0&&<button type="button" className="ti-master-primary" onClick={importSelected} disabled={busy||selected.length===0}>Criar {selected.length} ficha(s) selecionada(s)</button>}
  
 </section>;
}
