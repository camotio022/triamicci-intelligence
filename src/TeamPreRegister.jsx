import {apiFetch} from './api-fetch.js';
import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
const blank={name:'',email:'',sector:'cozinha',jobTitle:'Auxiliar de cozinha',role:'auxiliar'};
async function call(action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const response=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Operação indisponível.');return data;
}
export default function TeamPreRegister({membership,onInvite}){
 const {notify}=useFeedback();const [form,setForm]=useState(blank),[items,setItems]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);try{const d=await call('rosterList');setItems(d.entries||[])}catch(e){notify(e.message,'error')}finally{setLoading(false)}},[notify]);
 useEffect(()=>{load()},[load]);
 const save=async e=>{e.preventDefault();if(busy)return;setBusy(true);
  try{const d=await call('rosterCreate',{entry:form});notify(d.message,'success');setForm(blank);await load()}
  catch(e){notify(e.message,'error')}finally{setBusy(false)}};
 return <section className="team-panel ti-preregister"><h2>Pré-cadastro de colaboradores</h2>
  <p>Prepare a identificação antes de conceder acesso. O convite é enviado separadamente e só depois da aceitação o funcionário entra no sistema.</p>
  <form className="ti-preregister-form" onSubmit={save}>
   <label>Nome completo<input required minLength={2} maxLength={80} value={form.name} onChange={e=>setForm(x=>({...x,name:e.target.value}))}/></label>
   <label>E-mail para convite<input required type="email" maxLength={254} value={form.email} onChange={e=>setForm(x=>({...x,email:e.target.value}))}/></label>
   <label>Cargo operacional<input required minLength={2} maxLength={80} value={form.jobTitle} onChange={e=>setForm(x=>({...x,jobTitle:e.target.value}))}/></label>
   <label>Setor<select value={form.sector} onChange={e=>setForm(x=>({...x,sector:e.target.value}))}>{[['cozinha','Cozinha'],['frente','Frente'],['caixa','Caixa'],['apoio','Apoio'],['gestao','Gestão']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Permissão sugerida<select value={form.role} onChange={e=>setForm(x=>({...x,role:e.target.value}))}><option value="auxiliar">Auxiliar</option><option value="cook">Cozinheiro</option>{membership.role==='admin'&&<><option value="manager">Gerente</option><option value="admin">Administrador</option></>}</select></label>
   <button type="submit" disabled={busy}>{busy?'Cadastrando...':'Cadastrar sem conceder acesso'}</button>
  </form>
  <div className="ti-roster-heading"><h3>Cadastros da equipe</h3><button type="button" disabled={loading} onClick={load}>Atualizar</button></div>
  {loading?<p role="status">Carregando pré-cadastros...</p>:items.length===0?<p>Nenhum cadastro antecipado nesta unidade.</p>:<div className="ti-roster-grid">{items.map(x=><article key={x.id} className="ti-roster-item">
   <strong>{x.name}</strong><span>{x.jobTitle} · {x.sector}</span><small>{x.email}</small><small>{x.status==='linked'?'Conta vinculada e ativa':'Aguardando convite ou aceitação'}</small>{x.status!=='linked'&&<button type="button" onClick={()=>onInvite(x.email,x.role)}>Preparar convite</button>}
  </article>)}</div>}
 </section>;
}
