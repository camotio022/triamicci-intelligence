import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from './firebase.js';
import StockMovements from './StockMovements.jsx';
import CatalogPicker from './CatalogPicker.jsx';
import CatalogV2Review from './CatalogV2Review.jsx';

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
export default function Inventory({membership}) {
  const [products,setProducts] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [form,setForm] = useState(blank);
  const [editing,setEditing] = useState(null);
  const [saving,setSaving] = useState(false);
  const canEdit = ['admin','manager'].includes(membership.role);
  const load = useCallback(async () => {
    setLoading(true);setError('');
    try { const data = await call('list');setProducts(data.products || []); }
    catch(e) {setError(e.message);}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const visible = useMemo(()=>products.filter(p =>
    (p.name+' '+p.category).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))),[products,search]);
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
      setNotice(result.message);cancel();await load();
    } catch(e) {setNotice(e.message);}
    finally {setSaving(false);}
  };
  const set = (field,value) => setForm(old=>({...old,[field]:value}));
  return <section className="inventory-page">
    <p className="eyebrow">OPERAÇÃO · UNIDADE {membership.unitId.toUpperCase()}</p>
    <h1>Estoque · Catálogo de insumos</h1>
    <p>Selecione produtos do catálogo central. Saldos só mudam por movimentações auditadas; o vínculo inicial começa com zero.</p>
    <div className="inventory-summary"><strong>{products.length} insumos cadastrados</strong><span>{products.filter(p=>p.status==='active').length} ativos</span><span>{products.filter(p=>p.trackExpiry).length} com controle de validade</span></div>
    {membership.role === 'admin' && <CatalogV2Review />}
    {canEdit && <CatalogPicker onAttached={load} isAdmin={membership.role === 'admin'} />}
    {canEdit && editing && <form className="inventory-form" onSubmit={save}>
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
    <div className="inventory-list-header"><h2>Insumos da unidade</h2><button type="button" onClick={load} disabled={loading}>{loading?'Carregando...':'Atualizar'}</button></div>
    <label className="inventory-search">Buscar insumo<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome ou categoria"/></label>
    {error && <p role="alert">{error}</p>}
    <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>INSUMO</th><th>CATEGORIA</th><th>SALDO</th><th>MÍNIMO</th><th>VALIDADE</th><th>SITUAÇÃO</th>{canEdit && <th>AÇÃO</th>}</tr></thead><tbody>
      {visible.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.category}</td><td>{p.quantity} {p.unit}</td><td>{p.minStock} {p.unit}</td><td>{p.trackExpiry?'Controlada':'Não exigida'}</td><td>{p.status==='active'?'Ativo':'Inativo'}</td>{canEdit && <td><button type="button" onClick={()=>edit(p)}>Editar</button></td>}</tr>)}
    </tbody></table>{!loading && !error && visible.length===0 && <p>Nenhum insumo encontrado.</p>}</div>
    <StockMovements products={products} membership={membership} onUpdated={load}/>
    <p className="inventory-footnote">Entradas e saídas já atualizam o saldo real. Produtos com controle de validade permanecem bloqueados para movimentação até implementarmos lotes. Recebimentos e contagens físicas agora possuem histórico próprio no Firebase, ainda sem conciliação com o saldo legado.</p>
  </section>;
}
