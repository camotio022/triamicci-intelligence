import {requestJson} from './api-client.js';
import {CATALOG_56_UNITS} from '../server/operations/unit-engine.js';
import React,{useEffect,useMemo,useState} from 'react';
import draft from '../data/triamicci-product-catalog-56.staging.json';
import './operational-catalog-mobile.css';
const units=CATALOG_56_UNITS;
const configLabels={stockUnit:'Estoque',receivingUnit:'Recebimento',operationalUnit:'Contagem',source:'Origem',trackExpiry:'Validade',minStock:'Estoque mínimo',countFrequency:'Frequência',critical:'Produto crítico'};
const configValue=(key,value)=>typeof value==='boolean'?(value?'Sim':'Não'):({supplier:'Fornecedor',internal:'Cozinha',daily:'Diária',weekly:'Semanal',on_demand:'Sob demanda'})[value]||value||'Não informado';
async function request(action,payload={}){
 return requestJson('/api/catalog/manage',{module:'operationalCatalog',action,...payload},{sessionMessage:'Faça login novamente.',formatError:data=>data.message||'Não foi possível consultar o catálogo.'});
}
export default function OperationalCatalogSetup({onActivated}){
 const [entries,setEntries]=useState([]);
 const [selected,setSelected]=useState(null);
 const [form,setForm]=useState(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [filter,setFilter]=useState('');
 const [showAdvanced,setShowAdvanced]=useState(false),[advancedReviewed,setAdvancedReviewed]=useState(false);
 const [showRegistered,setShowRegistered]=useState(false),[loaded,setLoaded]=useState(false),[statusFilter,setStatusFilter]=useState('all');
 const statusLabels={active:'Ativo',duplicate:'Possível duplicidade',not_registered:'Cadastro pendente',inactive:'Cadastro inativo',missing_profile:'Configuração pendente',review_required:'Revisão necessária'};
 const refresh=async()=>{try{const r=await request('status');setEntries(r.items||[]);setLoaded(true);setError('')}catch(e){setError(e.message)}};
 useEffect(()=>{refresh()},[]);
 const product=useMemo(()=>draft.products.find(p=>p.id===selected),[selected]);
 const choose=p=>{setShowAdvanced(false);setAdvancedReviewed(false);setSelected(p.id);setError('');setNotice('');setForm({name:p.name,category:p.category,stockUnit:p.stockUnit,receivingUnit:p.receivingUnit||'',operationalUnit:p.operationalUnit||p.stockUnit,source:p.source,trackExpiry:p.trackExpiry,minStock:0,countFrequency:'weekly',critical:false,reviewConfirmed:false,existingProductId:null});const matches=entries.find(row=>row.id===p.id)?.matches||[];if(matches.length===1)useExisting(matches[0])};
 const useExisting=match=>setForm(f=>({...f,...match.configuration,existingProductId:match.id,reviewConfirmed:false}));
 const existingMatch=entries.find(row=>row.id===selected)?.matches?.find(row=>row.id===form?.existingProductId);
 const status=new Map(entries.map(p=>[p.id,p]));
 const shown=draft.products.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')) && (showRegistered || !status.get(p.id)?.active)&&(statusFilter==='all'||status.get(p.id)?.reason===statusFilter));
 const count=entries.filter(p=>p.active).length;
 const conflicts=entries.filter(p=>p.needsReconciliation).length;
 const set=(key,value)=>setForm(f=>({...f,[key]:value,reviewConfirmed:false}));
 const submit=async e=>{e.preventDefault();setError('');setNotice('');setBusy(true);try{await request('activate',{id:selected,...form});setNotice(form.existingProductId?'Cadastro conciliado; ID, saldo e histórico preservados.':'Cadastro ativado para a unidade com saldo inicial zero.');await refresh();onActivated?.()}catch(err){setError(err.message)}finally{setBusy(false)}};
 return <div className="ti-operational-setup"><header className="ti-operational-head"><div><span className="ti-operational-eyebrow">CATÁLOGO · ADMINISTRAÇÃO</span><h2>Configuração do Catálogo</h2></div><span className="ti-operational-count">{count}/56 ativos</span></header>
 <p className="ti-operational-intro">Revise os campos antes de ativar. O cadastro não cria saldo nem realiza conversões automáticas.</p>
 <p role="status">{loaded?<><strong>{count} de 56 ativos nesta unidade.</strong> {56-count} aguardam preparação; {conflicts} exigem revisão de cadastros existentes. Ativar não registra estoque: a gestão precisa fazer a primeira contagem.</>:"Consultando a preparação dos 56 produtos…"}</p>
 <div className="ti-operational-filters"><label>Situação<select disabled={!loaded} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);if(e.target.value==='active')setShowRegistered(true)}}><option value="all">Todas as situações</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label} · {entries.filter(x=>x.reason===key).length}</option>)}</select></label>
 <label>Buscar produto <input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nome do produto"/></label></div>
 <label><input type="checkbox" checked={showRegistered} onChange={e=>setShowRegistered(e.target.checked)}/> Mostrar também os já cadastrados</label>
 <div className="ti-operational-products" role="group" aria-label="Produtos do catálogo">{shown.map(p=><button type="button" key={p.id} onClick={()=>choose(p)} disabled={!loaded||Boolean(status.get(p.id)?.active)} aria-pressed={selected===p.id} className="ti-operational-product"><strong>{p.name}</strong><br/><small>{!loaded?'Consultando…':statusLabels[status.get(p.id)?.reason]||'Revisão necessária'} · {p.category}</small></button>)}{loaded&&shown.length===0&&<p className="ti-operational-empty">Nenhum produto corresponde à busca ou aos filtros.</p>}</div>
 {product&&form&&<>{status.get(product.id)?.needsReconciliation&&<p role="alert">Foi encontrado um possível cadastro anterior. Confira o nome, as unidades e o vínculo antes de ativar. A conciliação é validada pelo servidor; histórico e saldos antigos permanecem preservados.</p>}<form onSubmit={submit} className="inventory-form ti-operational-form"><div className="ti-operational-form-title"><h3>Validar: {product.name}</h3><button type="button" onClick={()=>{setSelected(null);setForm(null)}} aria-label="Fechar configuração">Fechar</button></div>
 {status.get(product.id)?.needsReconciliation&&<label>Cadastro existente para conciliar<select value={form.existingProductId||''} onChange={e=>{const match=status.get(product.id).matches?.find(m=>m.id===e.target.value);if(match)useExisting(match);else set('existingProductId',null)}}><option value="">Selecione após revisar</option>{status.get(product.id).matches?.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}{existingMatch?.configuration&&<section className="ti-catalog-comparison" aria-label="Comparação com o cadastro existente"><h4>Configuração da cozinha preservada</h4><p>O formulário usa os valores já cadastrados nesta unidade. As sugestões do catálogo servem apenas para comparação; saldos não serão convertidos.</p><div className="ti-catalog-comparison-mobile">{Object.entries(configLabels).map(([key,label])=><div className="ti-catalog-comparison-row" key={key}><strong>{label}</strong><div><span>Cadastro existente</span><b>{configValue(key,existingMatch.configuration[key])}</b></div><div><span>Sugestão</span><b>{configValue(key,product[key])}</b></div></div>)}</div><div className="ti-catalog-comparison-desktop"><table><thead><tr><th>Campo</th><th>Cadastro existente</th><th>Sugestão do catálogo</th></tr></thead><tbody>{Object.entries(configLabels).map(([key,label])=><tr key={key}><th scope="row">{label}</th><td>{configValue(key,existingMatch.configuration[key])}</td><td>{configValue(key,product[key])}</td></tr>)}</tbody></table></div></section>}<div className="ti-operational-identity"><span><strong>Produto</strong>{form.name}</span><span><strong>Categoria</strong>{form.category}</span></div>
 <label>Unidade de estoque<select aria-label="Unidade de estoque" value={form.stockUnit} onChange={e=>set('stockUnit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
 <label>Origem<select value={form.source} onChange={e=>{const source=e.target.value;setForm(f=>({...f,source,receivingUnit:source==='internal'?'':f.receivingUnit,reviewConfirmed:false}))}}><option value="supplier">Recebido de fornecedor</option><option value="internal">Preparado na cozinha</option></select></label>
 {form.source==='supplier'&&<label>Unidade de recebimento<select aria-label="Unidade de recebimento" value={form.receivingUnit} onChange={e=>set('receivingUnit',e.target.value)}><option value="">Selecione</option>{units.map(u=><option key={u}>{u}</option>)}</select></label>}
 <label>Unidade para contagem<select aria-label="Unidade para contagem" value={form.operationalUnit} onChange={e=>set('operationalUnit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
 {form.source==='supplier'&&form.receivingUnit!==form.operationalUnit&&<p role="status">Na entrega, informe a quantidade recebida em {form.receivingUnit} e a quantidade física realmente conferida em {form.operationalUnit}. O sistema não calcula uma a partir da outra.</p>}
 <button type="button" className="ti-operational-advanced-toggle" aria-expanded={showAdvanced} onClick={()=>{setShowAdvanced(v=>!v);setAdvancedReviewed(true)}}>{showAdvanced?'Ocultar opções adicionais':'Estoque mínimo, frequência e alertas'}</button><div className="ti-operational-advanced" hidden={!showAdvanced}><label>Estoque mínimo<input type="number" min="0" step="any" value={form.minStock} onChange={e=>set('minStock',Number(e.target.value))}/></label>
 <label>Frequência de contagem<select value={form.countFrequency} onChange={e=>set('countFrequency',e.target.value)}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="on_demand">Sob demanda</option></select></label>
 <label><input type="checkbox" checked={form.critical} onChange={e=>set('critical',e.target.checked)}/> Produto crítico</label>
 <label><input type="checkbox" checked={form.trackExpiry} onChange={e=>set('trackExpiry',e.target.checked)}/> Exigir controle de validade</label></div>
 <label className="ti-operational-confirm"><input type="checkbox" disabled={!advancedReviewed} checked={form.reviewConfirmed} onChange={e=>setForm(f=>({...f,reviewConfirmed:e.target.checked}))}/> {advancedReviewed?'Conferi os campos deste produto na operação':'Abra e revise estoque mínimo, frequência e alertas antes de confirmar'}</label>
 <button className="ti-operational-submit" type="submit" disabled={busy||!advancedReviewed||!form.reviewConfirmed||status.get(selected)?.active||(status.get(selected)?.needsReconciliation&&!form.existingProductId)}>{busy?'Salvando...':status.get(selected)?.active?'Já ativo':'Validar e ativar'}</button></form></>}
 {error&&<p role="alert">{error} <button type="button" onClick={refresh}>Tentar novamente</button></p>}{notice&&<p role="status">{notice}</p>}</div>;
}
