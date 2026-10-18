import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
const days=['Domingo','Segunda','Terça','Quarta','Quinta'];
const states={existing:'Ficha existente',needs_review:'Possível conta existente',ambiguous:'Duplicidade',new:'Sem correspondência'};
async function api(action,extra={}){
 const token=await auth.currentUser?.getIdToken();
 const r=await fetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Erro ao consultar cadastro.');return data;
}
export default function MasterRegistry(){
 const [data,setData]=useState(null),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{setBusy(true);setError('');try{const v=await api('masterRegistryPreview');setData(v);setSelected([])}catch(e){setError(e.message)}finally{setBusy(false)}},[]);
 useEffect(()=>{refresh()},[refresh]);
 const selectable=(data?.people||[]).filter(p=>p.state==='new');
 const importSelected=async()=>{
  if(!selected.length||!window.confirm('Criar '+selected.length+' fichas sem login? Contas já existentes não serão modificadas.'))return;
  setBusy(true);setError('');
  try{const r=await api('masterRegistryImport',{confirm:true,names:selected});setNotice(r.message);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
 };
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
  <p>Colaboradores com correspondência ficam bloqueados para importação até conferirmos identidade e vínculo. Daniel e Geraldo não participam desta importação.</p>
  <button type="button" onClick={importSelected} disabled={busy||selected.length===0}>Criar {selected.length} ficha(s) selecionada(s)</button>
  <button type="button" onClick={()=>setSelected(selectable.map(p=>p.name))} disabled={busy||!selectable.length} style={{marginLeft:8}}>Selecionar sem conflito</button>
 </section>;
}
