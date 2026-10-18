import React,{useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import proposal from '../data/triamicci-product-catalog-v2.proposal.json';

const textUnit = unit => unit==='un'?'unidades':unit||'a definir';
const origin = source => source==='supplier'?'Fornecedor':source==='internal'?'Produção interna':'A confirmar';
export default function CatalogV2Review(){
 const {notify}=useFeedback();
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState('alcatra-bife');
 const [show,setShow]=useState(false);
 const [plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const sync=async action=>{
  if(busy)return;
  if(action==='apply'&&!window.confirm('Aplicar somente metadados compatíveis do catálogo v2 ao Firebase? Nenhum saldo ou aprovação será alterado.'))return;
  setBusy(true);setNotice('');
  try{
   const token=await auth.currentUser.getIdToken();
   const res=await fetch('/api/catalog/sync-v2',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,confirm:action==='apply'?'APLICAR_CATALOGO_V2':undefined})});
   const data=await res.json();if(!res.ok)throw Error(data.message);
   setPlan(action==='apply'?null:data.plan);notify(data.message,'success');setNotice(data.message+(data.applied!==undefined?' Itens atualizados: '+data.applied+'. Gere uma nova prévia para conferir.':''));
  }catch(e){setNotice(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };

 const products=proposal.products;
 const matches=useMemo(()=>products.filter(p=>(p.name+' '+p.id+' '+p.category).toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))),[products,query]);
 const p=products.find(x=>x.id===selected);
 const names=Object.fromEntries(products.map(x=>[x.id,x.name]));
 const rules=proposal.productionRules.filter(r=>r.resultProductId===selected||r.preferredInputId===selected||r.alternativeInputIds.includes(selected));
 return <section className="inventory-form" aria-label="Revisão do Catálogo v2">
  <div className="inventory-list-header">
   <h2>Catálogo v2 — revisão administrativa</h2>
   <button type="button" onClick={()=>setShow(v=>!v)} aria-expanded={show}>{show?'Recolher':'Revisar proposta'}</button>
  </div>
  <p>Proposta de {products.length} produtos e {proposal.productionRules.length} regras de preferência. Consulte a situação dos metadados no Firebase antes de qualquer aplicação; nenhum saldo ou aprovação é alterado por esta migração.</p>
  <div className="inventory-actions">
   <button type="button" onClick={()=>sync('preview')} disabled={busy}>{busy?'Aguarde...':'Conferir diferenças no Firebase'}</button>
   <button type="button" onClick={()=>sync('apply')} disabled={busy||!plan||!plan.some(x=>x.status==='ready'||x.status==='new')}>Aplicar apenas itens compatíveis</button>
  </div>
  {notice&&<p role="status">{notice}</p>}
  {plan&&<div><strong>Resultado da conferência:</strong> {['ready','new','unchanged','conflict','missing','pending'].map(k=><span key={k}> {({ready:'Prontos',new:'Novos',unchanged:'Atualizados',conflict:'Conflitos',missing:'Ausentes',pending:'Pendentes'})[k]}: {plan.filter(x=>x.status===k).length} ·</span>)}
  <p>Produtos novos suficientemente definidos podem ser criados inativos. Produtos divergentes ou incompletos permanecerão para revisão.</p><ul>{plan.filter(x=>x.status!=='unchanged').map(x=><li key={x.id}>{x.id}: {x.status}{x.reason?' — '+x.reason:''}</li>)}</ul></div>}
  {show&&<>
   <div className="inventory-fields">
    <label>Pesquisar proposta<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filé de alcatra, peito de frango..." /></label>
    <label>Produto para revisão<select value={matches.some(x=>x.id===selected)?selected:''} onChange={e=>setSelected(e.target.value)}>
     <option value="">Selecione...</option>
     {matches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
   </div>
   {p&&<div className="catalog-v2-details">
    <h3>{p.name}</h3>
    <p><strong>Origem:</strong> {origin(p.source)} · <strong>Categoria:</strong> {p.category}</p>
    <p><strong>Unidade base atual:</strong> {textUnit(p.stockUnit)} · <strong>Recebimento:</strong> {textUnit(p.receivingUnit)} · <strong>Contagem:</strong> {textUnit(p.operationalUnit)}</p>
    <p><strong>Método:</strong> {p.countingMethod==='individual'?'Contagem individual': 'A confirmar'} · <strong>Locais:</strong> {(p.countLocations||[]).join(' e ')||'A definir'}</p>
    <p><strong>Validade:</strong> {p.trackExpiry?'Controle necessário':'Sem exigência cadastrada'} · <strong>Revisão:</strong> {p.reviewRequired?'Pendente explícita':'Ainda requer homologação do v2'}</p>
    {p.notes&&<p><strong>Observações:</strong> {p.notes}</p>}
    {rules.length>0&&<div><h4>Regras de produção associadas</h4>{rules.map(r=><p key={r.id}>Preparação: {names[r.resultProductId]}; preferencial: {names[r.preferredInputId]}; alternativa: {r.alternativeInputIds.map(id=>names[id]).join(', ')}. <strong>Sem baixa automática.</strong></p>)}</div>}
   </div>}
   <p role="status">A homologação operacional continua obrigatória antes de modificar saldos.</p>
  </>}
 </section>;
}
