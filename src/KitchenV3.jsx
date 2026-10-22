import {isManagement} from '../server/permissions/v31-policy.js';
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import KitchenV3Workflows from './KitchenV3Workflows.jsx';
import KitchenV3Loss from './KitchenV3Loss.jsx';
import KitchenV3History from './KitchenV3History.jsx';
import './v3-kitchen.css';
import './v4-stock-nav.css';
import './v4-stock-overview.css';
async function api(action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const response=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Falha na operação.');return data;
}
const kinds=[['availability','Disponibilidade'],['quantitative','Contagem quantitativa'],['on_demand','Conferir quando necessário']];
const sources=[['supplier','Fornecedor'],['internal','Produção interna'],['both','Fornecedor ou produção']];
const units=['kg','g','L','mL','un','porcao','pacote','duzia'];
const status={reported:'A verificar',requested:'Pedido feito',confirmed:'Confirmado pelo fornecedor',overdue:'Atrasado',partially_received:'Recebido parcialmente',received:'Recebido',cancelled:'Cancelado'};
const date=iso=>iso?new Date(iso+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const longDate=x=>x?new Date(x).toLocaleString('pt-BR'):'—';
export default function KitchenV3({membership}){
 const {notify}=useFeedback();
 const canManage=isManagement(membership.role);
 const [tab,setTab]=useState('overview'),[products,setProducts]=useState([]),[signals,setSignals]=useState([]),[orders,setOrders]=useState([]);
 const [selected,setSelected]=useState(''),[search,setSearch]=useState(''),[location,setLocation]=useState('reserva'),[showArchived,setShowArchived]=useState(false),[newName,setNewName]=useState(''),[newCategory,setNewCategory]=useState('Proteínas'),[newUnit,setNewUnit]=useState('kg'),[newExpiry,setNewExpiry]=useState(false),[resolutionById,setResolutionById]=useState({});
 const [observation,setObservation]=useState('missing'),[note,setNote]=useState('');
 const [overviewFilter,setOverviewFilter]=useState('alerts'),[showAllOrders,setShowAllOrders]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editId,setEditId]=useState(''),[step,setStep]=useState(0),[mode,setMode]=useState('availability'),
  [origin,setOrigin]=useState('supplier'),[countUnit,setCountUnit]=useState('un'),[locs,setLocs]=useState(['reserva']),[presentation,setPresentation]=useState(''),[trackingNote,setTrackingNote]=useState(''),[displayName,setDisplayName]=useState(''),[aliases,setAliases]=useState(''),[sourceIds,setSourceIds]=useState([]),[altIds,setAltIds]=useState([]);
 const [supplier,setSupplier]=useState(''),[eta,setEta]=useState(''),[orderLines,setOrderLines]=useState([{productId:'',quantity:'',unit:'kg'}]),[orderNote,setOrderNote]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const d=await api('v3Dashboard');setProducts(d.products||[]);setSignals(d.signals||[]);setOrders(d.orders||[]);}
  catch(e){setError(e.message);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);
 const active=useMemo(()=>products.filter(p=>(showArchived||p.status==='active')&&(p.name+' '+(p.profile?.displayName||'')+' '+(p.profile?.aliases||[]).join(' ')).toLowerCase().includes(search.trim().toLowerCase())),[products,search,showArchived]);
 const chosen=products.find(p=>p.id===selected);
 const current=products.find(p=>p.id===editId);
 const update=async(action,payload,success)=>{
  if(busy)return;setBusy(true);setError('');
  try{await api(action,payload);notify(success,'success');await load();return true;}
  catch(e){setError(e.message);notify(e.message,'error');return false;}
  finally{setBusy(false);}
 };
 const addProduct=async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{const user=auth.currentUser;const token=await user?.getIdToken();if(!token)throw Error('Faça login.');
   const response=await fetch('/api/products/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'create',name:newName.trim(),category:newCategory,unit:newUnit,minStock:0,trackExpiry:newExpiry})});
   const d=await response.json();if(!response.ok)throw Error(d.message||'Não foi possível cadastrar.');
   notify('Insumo cadastrado. Configure seu fluxo antes de usar.','success');setNewName('');await load();
  }catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const begin=p=>{const c=p.profile;setEditId(p.id);setStep(0);setMode(c?.controlMode||'availability');setOrigin(c?.origin||'supplier');setCountUnit(c?.countUnit||'un');setLocs(c?.locations||['reserva']);setPresentation(c?.receivingPresentation||'');setTrackingNote(c?.trackingNote||'');setDisplayName(c?.displayName||p.name);setAliases((c?.aliases||[]).join(', '));setSourceIds(c?.sourceProductIds||[]);setAltIds(c?.alternativeProductIds||[]);setTab('catalog');};
 const saveProfile=async()=>{
  if(!current)return;
  const ok=await update('v3ProfileSave',{productId:editId,expectedVersion:current.profile?.version||null,
   profile:{displayName:displayName.trim(),aliases:aliases.split(',').map(x=>x.trim()).filter(Boolean),controlMode:mode,origin,countUnit:mode==='quantitative'?countUnit:null,locations:locs,
   receivingPresentation:presentation||null,sourceProductIds:sourceIds,alternativeProductIds:altIds,trackingNote}},'Configuração operacional atualizada.');
  if(ok){setEditId('');setStep(0);}
 };
 const addOrderLine=()=>setOrderLines(old=>[...old,{productId:'',quantity:'',unit:'kg'}]);
 const saveOrder=async e=>{
  e.preventDefault();
  const items=orderLines.map(l=>({...l,quantity:Number(l.quantity)}));
  if(new Set(items.map(x=>x.productId)).size!==items.length){setError('Não repita um produto no mesmo pedido.');return;}
  const ok=await update('v3OrderCreate',{requestId:crypto.randomUUID(),supplier,etaDate:eta,items,notes:orderNote},'Pedido incluído na agenda.');
  if(ok){setSupplier('');setEta('');setOrderLines([{productId:'',quantity:'',unit:'kg'}]);setOrderNote('');}
 };
 return <section className="v3-page">
  <header className="v3-head"><div><p className="eyebrow">OPERAÇÃO · ESTOQUE E INSUMOS</p><h1>Estoque e insumos</h1><p>O que temos, o que falta e o que está previsto para chegar.</p></div><button type="button" className="v3-secondary" onClick={load} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></header>
  <nav className="ti-v4-stock-nav" aria-label="Seções de estoque e insumos">
   {[
    {id:'today',name:'Hoje',items:[['overview','Visão geral']]},
    {id:'operations',name:'Operações',items:[['availability','Avisar falta'],['orders','Entregas'],['receive','Recebimento'],['produce','Produção'],['transfer','Abastecer Giro'],['loss','Perdas e avarias'],...(canManage?[['count','Contagem oficial']]:[])]},
    {id:'management',name:'Consultas e gestão',items:[['history','Histórico'],...(canManage?[['catalog','Configurar catálogo']]:[])]}
   ].map(group=>{
    const activeGroup=group.items.some(([key])=>key===tab);
    return <button type="button" key={group.id} className={activeGroup?'ti-v4-stock-group selected':'ti-v4-stock-group'} aria-current={activeGroup?'page':undefined} onClick={()=>setTab(group.items[0][0])}>{group.name}</button>;
   })}
  </nav>
  {tab!=='overview'&&<nav className="ti-v4-stock-subnav" aria-label="Operações e consultas de estoque">
   {(tab==='history'||tab==='catalog'?[['history','Histórico'],...(canManage?[['catalog','Configurar catálogo']]:[])]:[['availability','Avisar falta'],['orders','Entregas'],['receive','Recebimento'],['produce','Produção'],['transfer','Abastecer Giro'],['loss','Perdas e avarias'],...(canManage?[['count','Contagem oficial']]:[])]).map(([key,label])=><button type="button" key={key} className={tab===key?'selected':''} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}
  </nav>}
  {error&&<p className="v3-error" role="alert">{error}</p>}
  {loading?<p role="status">Carregando dados reais da unidade…</p>:<>
   {tab==='history'&&<KitchenV3History products={products}/>}
   {tab==='loss'&&<KitchenV3Loss membership={membership} products={products} onChange={load}/>}
   {['receive','produce','transfer','count'].includes(tab)&&<KitchenV3Workflows key={tab} kind={tab} products={products} orders={orders} membership={membership} onChange={load} onConfigure={p=>p?begin(p):setTab('catalog')}/>}
   {tab==='overview'&&<div className="ti-v4-stock-overview">
    <div className="ti-v4-stock-overview-stats" aria-label="Resumo de estoque">
     <button type="button" onClick={()=>setOverviewFilter('alerts')} aria-pressed={overviewFilter==='alerts'} className={overviewFilter==='alerts'?'selected':''}><strong>{signals.length}</strong><span>Avisos da equipe</span></button>
     <button type="button" onClick={()=>setTab('orders')}><strong>{orders.filter(o=>o.status==='overdue').length}</strong><span>Entregas atrasadas</span></button>
     <button type="button" onClick={()=>setOverviewFilter('review')} aria-pressed={overviewFilter==='review'} className={overviewFilter==='review'?'selected':''}><strong>{active.filter(p=>!p.profile).length}</strong><span>Sem configuração</span></button>
    </div>
    <section className="v3-card ti-v4-stock-alerts"><header className="ti-v4-stock-section-head"><div><h2>Avisos da equipe</h2><p>Relatos da equipe que precisam de verificação.</p></div><span className="ti-v4-stock-pill">{signals.length}</span></header>
     {signals.length===0?<p className="ti-v4-stock-empty">Nenhum aviso em aberto.</p>:<div className="ti-v4-stock-list">{signals.map(sig=><article className="ti-v4-stock-item" key={sig.id}><div className="ti-v4-stock-item-title"><div><strong>{sig.productName}</strong><small>{sig.location==='giro'?'Giro · 1º piso':'Reserva · 2º piso'} · {sig.reports?.length||1} relato(s)</small></div><span className="ti-v4-stock-pill attention">{sig.observation==='missing'?'Possível falta':'Estoque baixo'}</span></div>{canManage&&<details className="ti-v4-stock-action"><summary>Conferir aviso</summary><form className="v3-inline-resolve" onSubmit={e=>{e.preventDefault();update('v3ResolveSignal',{productId:sig.productId,location:sig.location,resolution:resolutionById[sig.id]||''},'Aviso resolvido.')}}><label>Decisão<input required maxLength={240} value={resolutionById[sig.id]||''} onChange={e=>setResolutionById(old=>({...old,[sig.id]:e.target.value}))} placeholder="Ex.: conferido e localizado"/></label><button type="submit" disabled={busy}>Resolver</button></form></details>}</article>)}</div>}
    </section>
    <section className="v3-card ti-v4-stock-deliveries"><header className="ti-v4-stock-section-head"><div><h2>Entregas previstas</h2><p>Atrasadas e próximas entregas da unidade.</p></div><button type="button" className="v3-secondary" onClick={()=>setTab('orders')}>Ver agenda</button></header>
     {orders.length===0?<p className="ti-v4-stock-empty">Não há pedidos cadastrados.</p>:<div className="ti-v4-stock-list">{[...orders].sort((a,b)=>(a.status==='overdue'?-1:0)-(b.status==='overdue'?-1:0)||String(a.etaDate||'').localeCompare(String(b.etaDate||''))).slice(0,showAllOrders?20:3).map(o=><article className="ti-v4-stock-item" key={o.id}><div className="ti-v4-stock-item-title"><div><strong>{o.supplier}</strong><small>{date(o.etaDate)} · {o.items.length} item(ns)</small></div><span className={'ti-v4-stock-pill '+(o.status==='overdue'?'attention':'')}>{status[o.status]||o.status}</span></div><details><summary>Ver itens</summary><p>{o.items.map(i=>i.name+' '+i.quantity+' '+i.unit).join(' · ')}</p></details></article>)}</div>}
     {orders.length>3&&<button type="button" className="ti-v4-stock-more" onClick={()=>setShowAllOrders(v=>!v)}>{showAllOrders?'Mostrar menos':'Mostrar mais entregas'}</button>}
    </section>
    <section className="v3-card ti-v4-stock-availability"><header className="ti-v4-stock-section-head"><div><h2>Disponibilidade por insumo</h2><p>Informações declaradas ou estimadas não equivalem a contagem física confirmada.</p></div></header>
     <div className="ti-v4-stock-filters" role="group" aria-label="Filtrar disponibilidade">{[['alerts','Sinalizados'],['review','A revisar'],['all','Todos']].map(([id,label])=><button type="button" key={id} aria-pressed={overviewFilter===id} className={overviewFilter===id?'selected':''} onClick={()=>setOverviewFilter(id)}>{label}</button>)}</div>
     <label className="v3-search">Buscar insumo<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do insumo"/></label>
     <div className="ti-v4-stock-list">{active.filter(p=>overviewFilter==='all'||(overviewFilter==='alerts'?signals.some(sig=>sig.productId===p.id):!p.profile)).slice(0,30).map(p=>{const balance=p.v3Balance,sessions=balance?.countSessions||{};const verified=Boolean(sessions.reserva&&sessions.giro&&sessions.reserva===sessions.giro&&balance?.quality==='COUNTED_AT_LOCATION');const hasSignal=signals.some(sig=>sig.productId===p.id);return <article className="ti-v4-stock-item" key={p.id}><div className="ti-v4-stock-item-title"><div><strong>{p.profile?.displayName||p.name}</strong><small>{p.profile?.controlMode==='quantitative'?'Contagem':p.profile?.controlMode==='on_demand'?'Sob demanda':'Disponibilidade'} · {p.profile?'Configurado':'Configuração pendente'}</small></div><span className={'ti-v4-stock-pill '+(hasSignal?'attention':'')}>{hasSignal?'Sinalizado':verified?'Conferido':balance?'Estimado':'Não verificado'}</span></div>{balance&&p.profile?.controlMode==='quantitative'&&<small>Reserva {balance.reserva??'—'} · Giro {balance.giro??'—'} · Total {balance.total} {balance.unit} {verified?'(mesma rodada)':'(não confirmado em conjunto)'}</small>}</article>})}</div>
     {active.filter(p=>overviewFilter==='all'||(overviewFilter==='alerts'?signals.some(sig=>sig.productId===p.id):!p.profile)).length===0&&<p className="ti-v4-stock-empty">Nenhum insumo neste filtro.</p>}
     {active.length>30&&<p className="ti-v4-stock-hint">Exibindo até 30 insumos. Use a busca para localizar um produto específico.</p>}
    </section>
   </div>}
   {tab==='availability'&&<div className="v3-card v3-narrow"><h2>Sinalizar falta ou estoque baixo</h2><p>Qualquer membro da equipe pode avisar. O aviso não zera nem altera o saldo.</p>
    <form onSubmit={e=>{e.preventDefault();update('v3Signal',{productId:selected,location,observation,note},'Equipe avisada.').then(ok=>{if(ok)setNote('')});}} className="v3-form">
     <label>Insumo<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione</option>{products.filter(p=>p.status==='active').map(p=><option value={p.id} key={p.id}>{p.profile?.displayName||p.name}</option>)}</select></label>
     <label>Onde procurou?<select value={location} onChange={e=>setLocation(e.target.value)}><option value="reserva">Reserva · 2º piso</option><option value="giro">Giro · 1º piso</option></select></label>
     <label>Situação<select value={observation} onChange={e=>setObservation(e.target.value)}><option value="missing">Não encontrei</option><option value="low">Está acabando</option><option value="available">Encontrei disponível</option></select></label>
     <label>Observação (opcional)<textarea maxLength={240} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: procurei nas duas geladeiras"/></label>
     <button type="submit" disabled={busy}>{busy?'Enviando…':'Avisar equipe'}</button>
    </form>
    {chosen&&signals.some(s=>s.productId===selected&&s.location===location)&&<p className="v3-info" role="status">Já existe um aviso sobre esse produto neste local.</p>}
   </div>}
   {tab==='orders'&&<div className="v3-columns">
    {canManage&&<section className="v3-card"><h2>Registrar pedido feito no WhatsApp</h2><p>A data prevista é obrigatória. Pedido não adiciona mercadoria ao estoque.</p>
     <form className="v3-form" onSubmit={saveOrder}>
      <label>Fornecedor<input required maxLength={100} value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Nome do fornecedor"/></label>
      <label>Entrega prevista<input required type="date" value={eta} onChange={e=>setEta(e.target.value)}/></label>
      {orderLines.map((line,index)=><div className="v3-line" key={index}><label>Insumo<select required value={line.productId} onChange={e=>setOrderLines(old=>old.map((x,i)=>i===index?{...x,productId:e.target.value}:x))}><option value="">Selecione</option>{products.filter(p=>p.status==='active').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Quantidade<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>setOrderLines(old=>old.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label><label>Unidade<select value={line.unit} onChange={e=>setOrderLines(old=>old.map((x,i)=>i===index?{...x,unit:e.target.value}:x))}>{units.map(u=><option key={u} value={u}>{u}</option>)}</select></label></div>)}
      <button type="button" className="v3-secondary" onClick={addOrderLine}>Adicionar insumo</button>
      <label>Observações<textarea value={orderNote} maxLength={240} onChange={e=>setOrderNote(e.target.value)}/></label>
      <button type="submit" disabled={busy}>{busy?'Salvando…':'Registrar pedido'}</button>
     </form>
    </section>}
    <section className="v3-card"><h2>Agenda compartilhada de entregas</h2>{orders.length===0?<p>Não há pedidos cadastrados.</p>:orders.map(o=><article key={o.id} className="v3-order"><div className="v3-row"><div><strong>{date(o.etaDate)} · {o.supplier}</strong><p>{status[o.status]||o.status}</p></div></div>{o.items.map((i,k)=><p key={k}>{i.name} — {i.quantity} {i.unit}</p>)}{canManage&&['requested','confirmed','overdue','partially_received'].includes(o.status)&&<label>Situação<select value={o.status} disabled={busy} onChange={e=>update('v3OrderStatus',{orderId:o.id,status:e.target.value},'Pedido atualizado.')}><option value={o.status}>{status[o.status]}</option>{({requested:['confirmed','overdue','cancelled'],confirmed:['overdue','cancelled'],overdue:['confirmed','cancelled'],partially_received:['cancelled']})[o.status]?.map(x=><option value={x} key={x}>{status[x]}</option>)}</select></label>}</article>)}</section>
   </div>}

   {tab==='catalog'&&canManage&&<div className="v3-card"><h2>Catálogo operacional configurável</h2><p>As mudanças não convertem saldos antigos. Arquivar e renomear insumos serão tratados com preservação do histórico.</p>
    <form className="v3-form v3-new-product" onSubmit={addProduct}><h3>Cadastrar novo insumo</h3><div className="v3-line"><label>Nome<input required minLength={2} maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex.: Rúcula"/></label><label>Categoria<select value={newCategory} onChange={e=>setNewCategory(e.target.value)}>{['Proteínas','Preparações','Hortifruti','Laticínios','Mercearia','Congelados','Bebidas','Limpeza','Descartáveis','Outros'].map(x=><option key={x}>{x}</option>)}</select></label><label>Unidade inicial<select value={newUnit} onChange={e=>setNewUnit(e.target.value)}>{['kg','g','L','ml','un'].map(x=><option key={x}>{x}</option>)}</select></label></div><label className="v3-checkbox"><input type="checkbox" checked={newExpiry} onChange={e=>setNewExpiry(e.target.checked)}/>Exigir lote e validade</label><button disabled={busy} type="submit">Criar e depois configurar</button></form><label className="v3-search">Buscar insumo<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do insumo"/></label><label className="v3-checkbox"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Mostrar insumos arquivados</label>
    {!editId?<div className="v3-tiles">{active.map(p=><article key={p.id} className="v3-tile"><strong>{p.name}</strong><small>{p.profile?.controlMode||'Não configurado'}</small><button className="v3-secondary" type="button" onClick={()=>begin(p)} disabled={p.status!=='active'}>Configurar</button><button className="v3-secondary" type="button" disabled={busy} onClick={()=>update('v3ArchiveProduct',{productId:p.id,active:p.status!=='active'},p.status==='active'?'Insumo arquivado.':'Insumo reativado.')}>{p.status==='active'?'Arquivar':'Reativar'}</button></article>)}</div>:
    <div className="ti-unified-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditId('')}}><div className="ti-unified-modal" role="dialog" aria-modal="true" aria-label="Configuração do insumo"><div className="v3-wizard"><div className="v3-row"><h3>{current?.name}</h3><button type="button" className="v3-secondary" onClick={()=>setEditId('')}>Voltar</button></div><p className="v3-info">Etapa {step+1} de 4 · Alteração versionada e auditável</p>
     {step===0&&<div className="v3-form"><label>Nome claro e único que será exibido<input required maxLength={100} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Ex.: Tilápia grelhada"/></label><label>Sinônimos usados na cozinha (separe por vírgula)<input maxLength={240} value={aliases} onChange={e=>setAliases(e.target.value)} placeholder="Ex.: Filé para grelha"/></label><label>Como o insumo entra na cozinha?<select value={origin} onChange={e=>setOrigin(e.target.value)}>{sources.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label><label>Como chega? (embalagem ou apresentação)<input maxLength={80} value={presentation} onChange={e=>setPresentation(e.target.value)} placeholder="Ex.: fardo pesado em kg"/></label></div>}
     {step===1&&<div className="v3-form"><label>Como controlar?<select value={mode} onChange={e=>setMode(e.target.value)}>{kinds.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>{mode==='quantitative'&&<label>Como contar?<select value={countUnit} onChange={e=>setCountUnit(e.target.value)}>{units.map(u=><option key={u} value={u}>{u}</option>)}</select></label>}</div>}
     {step===2&&<div className="v3-form"><fieldset><legend>Onde pode ficar armazenado?</legend>{[['reserva','Reserva · 2º piso'],['giro','Giro · 1º piso']].map(([v,label])=><label className="v3-checkbox" key={v}><input type="checkbox" checked={locs.includes(v)} onChange={e=>setLocs(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{label}</label>)}</fieldset>{['internal','both'].includes(origin)&&<fieldset><legend>Matérias-primas permitidas na produção</legend><p>Marque as origens normais e as alternativas usadas só quando faltar a principal.</p>{products.filter(p=>p.id!==editId&&p.status==='active').map(p=><div key={p.id} className="v3-source"><strong>{p.name}</strong><select aria-label={'Relação de '+p.name} value={sourceIds.includes(p.id)?'primary':altIds.includes(p.id)?'alternative':'none'} onChange={e=>{setSourceIds(old=>old.filter(x=>x!==p.id).concat(e.target.value==='primary'?[p.id]:[]));setAltIds(old=>old.filter(x=>x!==p.id).concat(e.target.value==='alternative'?[p.id]:[]))}}><option value="none">Não utiliza</option><option value="primary">Origem principal</option><option value="alternative">Alternativa</option></select></div>)}</fieldset>}<label>Observações de preparo e armazenamento<textarea maxLength={240} value={trackingNote} onChange={e=>setTrackingNote(e.target.value)}/></label></div>}
     {step===3&&<div className="v3-review"><p><strong>Nome exibido:</strong> {displayName}</p><p><strong>Sinônimos:</strong> {aliases||'Nenhum'}</p><p><strong>Origem:</strong> {sources.find(x=>x[0]===origin)?.[1]}</p><p><strong>Recebimento:</strong> {presentation||'Conforme entrada aferida'}</p><p><strong>Controle:</strong> {kinds.find(x=>x[0]===mode)?.[1]} {mode==='quantitative'?'· '+countUnit:''}</p><p><strong>Locais:</strong> {locs.join(', ')}</p><p><strong>Matérias-primas:</strong> {sourceIds.length} principais, {altIds.length} alternativas</p><p>O histórico e a unidade dos saldos existentes permanecerão inalterados.</p></div>}
     <div className="v3-actions"><button type="button" className="v3-secondary" onClick={()=>setStep(x=>Math.max(0,x-1))} disabled={step===0}>Anterior</button>{step<3?<button type="button" disabled={step===2&&locs.length===0} onClick={()=>setStep(x=>x+1)}>Próximo</button>:<button type="button" disabled={busy} onClick={saveProfile}>{busy?'Salvando…':'Confirmar configuração'}</button>}</div>
    </div></div></div>}</div>}
  </>}
 </section>;
}
