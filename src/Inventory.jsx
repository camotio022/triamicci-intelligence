import {useUnitLive} from './useUnitLive.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import { auth } from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import StockMovements from './StockMovements.jsx';
import CatalogPicker from './CatalogPicker.jsx';
import CatalogV2Review from './CatalogV2Review.jsx';
import ProductDetails from './ProductDetails.jsx';
import MeasurementEditor from './MeasurementEditor.jsx';

const categories = ['Preparações','Proteínas','Hortifruti','Laticínios','Mercearia','Congelados','Bebidas','Limpeza','Descartáveis','Outros'];
const units = ['kg','g','L','ml','un'];
const blank = {name:'',category:'Proteínas',unit:'kg',minStock:'0',trackExpiry:false,status:'active'};
async function call(action, payload={}) {
  if (!auth.currentUser) throw new Error('Sessão expirada.');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/products/manage',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload})});
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Erro ao consultar catálogo.');
  return data;
}
export default function Inventory({membership,mode='stock',onAction}) {
 const {notify}=useFeedback();
  const [products,setProducts] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [countFilter,setCountFilter]=useState('all');
  const [today,setToday]=useState(()=>restaurantDay());
  useEffect(()=>{const timer=setInterval(()=>setToday(restaurantDay()),60000);return()=>clearInterval(timer)},[]);
  const [form,setForm] = useState(blank);
  const [editing,setEditing] = useState(null);
  const [saving,setSaving] = useState(false);
  const [detailId,setDetailId] = useState(null);
  const canEdit = ['admin','manager'].includes(membership.role);
  const administration = mode === 'catalog';
  const load = useCallback(async (silent=false) => {
    if(!silent)setLoading(true);setError('');
    try { const data = await call('list');setProducts(data.products || []); }
    catch(e) {setError(e.message);}
    finally {setLoading(false);}
  },[]);
 useUnitLive(membership?.unitId,()=>load(true));
  useEffect(()=>{load();},[load]);
  const countDay=p=>{const at=p.physicalBalance?.at;if(!at)return null;const date=new Date(at);return Number.isNaN(date.getTime())?null:restaurantDay(date)};
  const todays=products.filter(p=>countDay(p)===today);
  const visible=useMemo(()=>products.filter(p=>{
   if(!(p.name+' '+p.category).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))return false;
   const day=countDay(p);
   return countFilter==='all'||countFilter==='today'&&day===today||countFilter==='previous'&&Boolean(day)&&day!==today||countFilter==='uncounted'&&!day;
  }).sort((a,b)=>countFilter==='all'?String(b.physicalBalance?.at||'').localeCompare(String(a.physicalBalance?.at||''))||a.name.localeCompare(b.name,'pt-BR'):a.name.localeCompare(b.name,'pt-BR')),[products,search,countFilter,today]);
  const edit = p => {setEditing(p);setForm({name:p.name,category:p.category,unit:p.unit,minStock:String(p.minStock),trackExpiry:p.trackExpiry,status:p.status});setNotice('');};
  const cancel = () => {setEditing(null);setForm(blank);};
  const save = async event => {
    event.preventDefault();if(saving) return;
    const minimum = Number(form.minStock);
    if (!form.name.trim() || !form.category.trim() || !Number.isFinite(minimum) || minimum < 0) {
      setNotice('Preencha os campos corretamente.');return;
    }
    setSaving(true);setNotice('');
    try {
      const payload={name:form.name.trim(),category:form.category.trim(),unit:form.unit,
        minStock:minimum,trackExpiry:form.trackExpiry};
      const result=await call(editing?'update':'create',editing?{...payload,productId:editing.id,status:form.status}:payload);
      setNotice(result.message);notify(result.message,'success');cancel();await load();
    } catch(e) {setNotice(e.message);notify(e.message,'error');}
    finally {setSaving(false);}
  };
  const set = (field,value) => setForm(old=>({...old,[field]:value}));
  const detail=products.find(p=>p.id===detailId);
  useEffect(()=>{if(!detailId)return;const previous=document.activeElement;const handle=e=>{if(e.key==='Escape')setDetailId(null)};document.addEventListener('keydown',handle);return()=>{document.removeEventListener('keydown',handle);previous?.focus?.()}},[detailId]);
  return <section className="inventory-page">
    <p className="eyebrow">OPERAÇÃO · UNIDADE {membership.unitId.toUpperCase()}</p>
    <h1>{administration?'Administração · Catálogo':'Estoque físico da cozinha'}</h1>
    <p>{administration?'Revise cadastros, aprovações e configurações sem misturar essas tarefas com a rotina de estoque.':'Consulte a última contagem de reserva e giro. Sem contagem, mostramos o saldo legado identificado, não uma quantidade física confirmada.'}</p>
    {administration&&<div className="inventory-summary"><strong>{products.length} insumos cadastrados</strong><span>{products.filter(p=>p.status==='active').length} ativos</span><span>{products.filter(p=>p.trackExpiry).length} com controle de validade</span></div>}
    {!administration&&<div className="ti-stock-overview" aria-label="Resumo do estoque"><button type="button" aria-pressed={countFilter==='all'} onClick={()=>setCountFilter('all')}><strong>{products.length}</strong><span>Insumos</span></button><button type="button" aria-pressed={countFilter==='today'} onClick={()=>setCountFilter('today')}><strong>{todays.length}</strong><span>Contados hoje</span></button><button type="button" aria-pressed={countFilter==='uncounted'} onClick={()=>setCountFilter('uncounted')}><strong>{products.filter(p=>!p.physicalBalance?.at).length}</strong><span>Sem contagem</span></button></div>}
    {!administration&&<p className="ti-stock-day-label"><strong>Hoje · {new Date(today+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}</strong> · A data indica a última contagem, não o saldo após movimentações.</p>}
    {administration&&canEdit&&<MeasurementEditor products={products}/>}
    {administration && membership.role === 'admin' && <CatalogV2Review />}
    {administration && canEdit && <CatalogPicker onAttached={load} isAdmin={membership.role === 'admin'} />}
    {administration && canEdit && editing && <form className="inventory-form" onSubmit={save}>
      <h2>{editing?'Editar insumo':'Cadastrar insumo'}</h2>
      <div className="inventory-fields">
        <label>Nome do insumo<input required maxLength={100} minLength={2} value={form.name} disabled={Boolean(editing)} onChange={e=>set('name',e.target.value)} placeholder="Ex.: Peito de frango"/></label>
        <label>Categoria<select value={form.category} disabled={Boolean(editing?.catalogId)} onChange={e=>set('category',e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Unidade de medida<select value={form.unit} disabled={Boolean(editing?.catalogId)} onChange={e=>set('unit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
        <label>Estoque mínimo<input required type="number" min="0" max="100000000" step="any" value={form.minStock} onChange={e=>set('minStock',e.target.value)}/></label>
        {editing && <label>Situação<select value={form.status} onChange={e=>set('status',e.target.value)}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>}
      </div>
      <label className="inventory-check"><input type="checkbox" checked={form.trackExpiry} disabled={Boolean(editing?.catalogId)} onChange={e=>set('trackExpiry',e.target.checked)}/> Exigir controle de lote e validade nas futuras entradas</label>
      <div className="inventory-actions"><button type="submit" disabled={saving}>{saving?'Salvando...':editing?'Salvar alterações':'Cadastrar insumo'}</button>{editing && <button type="button" className="inventory-cancel" onClick={cancel} disabled={saving}>Cancelar</button>}</div>
      {notice && <p role="status">{notice}</p>}
    </form>}
    <div className="inventory-list-header"><h2>{administration?'Produtos vinculados à unidade':'Produtos da cozinha'}</h2><button type="button" onClick={load} disabled={loading}>{loading?'Carregando...':'Atualizar'}</button></div>
    <label className="inventory-search">Buscar insumo<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome ou categoria"/></label>
    {!administration&&<div className="ti-stock-filters" role="group" aria-label="Filtrar contagens">{[["all","Todos"],["today","Contados hoje"],["previous","Contados antes"],["uncounted","Sem contagem"]].map(([id,label])=><button key={id} type="button" className={countFilter===id?"active":""} aria-pressed={countFilter===id} onClick={()=>setCountFilter(id)}>{label}</button>)}</div>}
    {error && <p role="alert">{error}</p>}
    {!administration&&<div className="ti-stock-list" aria-label="Estoque por produto">
     {visible.map(p=>{const u=p.physicalBalance?.unit||p.physicalUnit||p.unit;const counted=Boolean(p.physicalBalance);
      const mismatch=counted&&p.physicalUnit&&p.physicalBalance.unit&&p.physicalBalance.unit!==p.physicalUnit;
      const when=countDay(p);
      return <button className={"ti-stock-item"+(when===today?" ti-stock-item-today":"")} key={p.id} type="button" onClick={()=>setDetailId(p.id)} aria-label={"Ver detalhes de "+p.name}>
       <span className="ti-stock-item-main"><strong>{p.name}</strong><small>{p.category} · {when===today?"Contado hoje":when?"Última contagem: "+new Date(p.physicalBalance.at).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}):"Sem contagem física"}</small>
        {counted&&<span className="ti-stock-split"><span>Reserva <b>{p.physicalBalance.reserve} {u}</b></span><span>Giro <b>{p.physicalBalance.rotation} {u}</b></span></span>}
        {mismatch&&<small className="ti-stock-unit-warning">Unidade da contagem difere do cadastro · conferir</small>}
       </span>
       <span className="ti-stock-item-total"><strong>{counted?p.physicalBalance.total:p.quantity??'—'} <small>{counted?u:p.unit}</small></strong><small className={when===today?"ti-stock-green":""}>{counted?"Total físico":"Saldo legado"}</small></span>
       <span className="ti-stock-item-chevron" aria-hidden="true">›</span>
      </button>;
     })}
     {!loading&&visible.length===0&&<p className="ti-stock-empty">Nenhum insumo corresponde aos filtros. Experimente “Todos”.</p>}
    </div>}
    {detail&&!administration&&<div className="ti-stock-detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailId(null)}}><section className="ti-stock-detail-dialog" role="dialog" aria-modal="true" aria-label={"Detalhes de "+detail.name}><button type="button" className="ti-stock-dialog-close" onClick={()=>setDetailId(null)} aria-label="Fechar detalhes">×</button><ProductDetails product={detail} membership={membership} onBack={()=>{setDetailId(null);load()}} onAction={onAction} onRefresh={load}/></section></div>}
    {administration && <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>INSUMO</th><th>CATEGORIA</th><th>CONTAGEM FÍSICA / SALDO LEGADO</th><th>MÍNIMO</th><th>VALIDADE</th><th>SITUAÇÃO</th>{canEdit && <th>AÇÃO</th>}</tr></thead><tbody>
      {visible.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.category}</td><td>{p.physicalBalance?<><strong>{p.physicalBalance.total} {p.physicalBalance.unit}</strong><small> Última contagem: {p.physicalBalance.reserve} reserva + {p.physicalBalance.rotation} giro</small></>:<><span>{p.quantity} {p.unit}</span><small> Saldo legado; sem contagem física registrada</small></>}</td><td>{p.minStock} {p.unit}</td><td>{p.trackExpiry?'Controlada':'Não exigida'}</td><td>{p.status==='active'?'Ativo':'Inativo'}</td>{canEdit && <td><button type="button" onClick={()=>edit(p)}>Editar</button></td>}</tr>)}
    </tbody></table>{!loading && !error && visible.length===0 && <p>Nenhum insumo encontrado.</p>}</div>}
    {administration && <details className="inventory-form"><summary>Movimentações legadas (controle antigo)</summary><p>Este é o fluxo antigo e não atualiza o registro de recebimento e contagem física. Utilize Recebimento para novas entregas da cozinha.</p><StockMovements products={products} membership={membership} onUpdated={load}/></details>}
    <p className="inventory-footnote">A contagem física registrada e o saldo legado permanecem separados até conciliação. Não confunda entrada legada com recebimento de mercadorias.</p>
  </section>;
}
