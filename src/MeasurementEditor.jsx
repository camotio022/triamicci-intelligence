import {apiFetch} from './api-fetch.js';
import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {PRESENTATIONS} from '../server/operations/unit-engine.js';
const units=['kg','g','L','mL','un','duzia'];
async function request(action,data){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw Error('Entre novamente na sua conta.');
 const res=await apiFetch('/api/products/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:action==='get'?'measurementGet':'measurementSave',...data})});
 const body=await res.json();if(!res.ok)throw Error(body.message||'Não foi possível consultar as apresentações.');return body;
}
export default function MeasurementEditor({products}){
 const [countingMethod,setCountingMethod]=useState({kind:'base'});
 const [productId,setProductId]=useState(''),[version,setVersion]=useState(0),[packages,setPackages]=useState([]),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;setPackages([]);setCountingMethod({kind:'base'});setNote('');setVersion(0);setError('');setNotice('');if(!productId)return;
 request('get',{productId}).then(r=>{if(active){setVersion(r.profile?.version||0);setPackages(r.profile?.packages||[]);setCountingMethod(r.profile?.countingMethod||{kind:'base'});setNote(r.profile?.note||'')}}).catch(e=>{if(active)setError(e.message)});
 return()=>{active=false}},[productId]);
 const update=(index,key,value)=>setPackages(old=>old.map((p,i)=>i===index?{...p,[key]:value,...(key==='validated'&&!value?{contentQuantity:null,contentUnit:null,evidence:''}:{})}:p));
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');
  try{const payload=packages.map(p=>({presentation:p.presentation,fixed:!!p.validated,validated:!!p.validated,contentQuantity:p.validated?Number(p.contentQuantity):null,contentUnit:p.validated?p.contentUnit:null,evidence:p.validated?p.evidence||'':null}));
   const r=await request('save',{productId,expectedVersion:version,packages:payload,countingMethod,note});setVersion(r.version);setNotice(r.message)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 };
 return <section className="receiving-card" style={{marginTop:18}}>
  <h2>Apresentações e embalagens</h2>
  <p>Configure como cada insumo chega à loja. Somente equivalências comprovadas serão aceitas. Este cadastro <strong>não modifica saldos, lotes ou históricos</strong>.</p>
  <label>Produto<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecione um produto ativo</option>{products.filter(p=>p.status==='active').map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
  {productId&&<form className="stock-action-form" onSubmit={submit}>
   <p>Versão da configuração: {version||'Ainda não cadastrada'}</p>
   {packages.map((p,i)=><fieldset key={i} style={{border:'1px solid #dedede',borderRadius:12,padding:14,display:'grid',gap:8}}>
    <legend>Embalagem {i+1}</legend>
    <label>Apresentação<select value={p.presentation} onChange={e=>update(i,'presentation',e.target.value)}>{PRESENTATIONS.map(u=><option key={u} value={u}>{u}</option>)}</select></label>
    <label><input type="checkbox" checked={!!p.validated} onChange={e=>update(i,'validated',e.target.checked)}/> Conteúdo fixo conferido e documentado</label>
    {p.validated&&<>
     <label>Conteúdo por embalagem<input required type="number" min="0.001" step="any" value={p.contentQuantity??''} onChange={e=>update(i,'contentQuantity',e.target.value)}/></label>
     <label>Unidade do conteúdo<select required value={p.contentUnit||''} onChange={e=>update(i,'contentUnit',e.target.value)}><option value="">Selecionar unidade</option>{units.map(u=><option key={u}>{u}</option>)}</select></label>
     <label>Comprovação da equivalência<input required minLength={8} maxLength={240} value={p.evidence||''} placeholder="Ex.: rótulo do fornecedor, 12 garrafas de 1 L" onChange={e=>update(i,'evidence',e.target.value)}/></label>
    </>}
    {!p.validated&&<p>Conteúdo desconhecido ou variável. Nenhuma conversão será presumida.</p>}
    <button type="button" onClick={()=>setPackages(a=>a.filter((_,j)=>i!==j))}>Excluir embalagem</button>
   </fieldset>)}
   <button type="button" disabled={packages.length>=12} onClick={()=>setPackages(a=>[...a,{presentation:PRESENTATIONS.find(u=>!a.some(p=>p.presentation===u))||'pacote',validated:false,fixed:false,contentQuantity:null,contentUnit:null,evidence:''}])}>Adicionar apresentação</button>
   <fieldset style={{border:'1px solid #dedede',borderRadius:12,padding:14}}>
    <legend>Como a equipe conta este produto?</legend>
    <label>Método de contagem<select value={countingMethod.kind} onChange={e=>setCountingMethod(e.target.value==='base'?{kind:'base'}:{kind:'packages',presentation:packages[0]?.presentation||'',trackOpen:false})}>
     <option value="base">Quantidade na unidade física do estoque</option>
     <option value="packages" disabled={!packages.length}>Contagem por embalagem</option>
    </select></label>
    {countingMethod.kind==='packages'&&<>
     <label>Embalagem utilizada na contagem<select value={countingMethod.presentation} onChange={e=>setCountingMethod(old=>({...old,presentation:e.target.value}))}>{packages.map(p=><option key={p.presentation} value={p.presentation}>{p.presentation}</option>)}</select></label>
     <label><input type="checkbox" checked={!!countingMethod.trackOpen} onChange={e=>setCountingMethod(old=>({...old,trackOpen:e.target.checked}))}/> Diferenciar embalagens abertas e fechadas</label>
    </>}
    <p>Esta definição controla apenas a conferência auxiliar; não converte nem substitui saldos antigos.</p>
   </fieldset>
   <label>Observações<input maxLength={240} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: peito de frango em pacotes de peso variável"/></label>
   <button type="submit" disabled={busy}>{busy?'Salvando...':'Salvar configuração (sem movimentar estoque)'}</button>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </form>}
 </section>;
}
