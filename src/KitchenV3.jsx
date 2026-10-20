import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import KitchenV3Workflows from './KitchenV3Workflows.jsx';
import './v3-kitchen.css';
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
 const canManage=['admin','manager'].includes(membership.role);
 const [tab,setTab]=useState('overview'),[products,setProducts]=useState([]),[signals,setSignals]=useState([]),[orders,setOrders]=useState([]);
 const [selected,setSelected]=useState(''),[search,setSearch]=useState(''),[location,setLocation]=useState('reserva');
 const [observation,setObservation]=useState('missing'),[note,setNote]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editId,setEditId]=useState(''),[step,setStep]=useState(0),[mode,setMode]=useState('availability'),
  [origin,setOrigin]=useState('supplier'),[countUnit,setCountUnit]=useState('un'),[locs,setLocs]=useState(['reserva']),[presentation,setPresentation]=useState(''),[trackingNote,setTrackingNote]=useState(''),[sourceIds,setSourceIds]=useState([]),[altIds,setAltIds]=useState([]);
 const [receipt,setReceipt]=useState({productId:'',orderId:'',commercialQuantity:'',commercialUnit:'kg',stockQuantity:'',location:'reserva',lot:'',expiryDate:'',supplier:'',notes:''});
 const [count,setCount]=useState({productId:'',location:'reserva',quantity:'',notes:''});
 const [supplier,setSupplier]=useState(''),[eta,setEta]=useState(''),[orderLines,setOrderLines]=useState([{productId:'',quantity:'',unit:'kg'}]),[orderNote,setOrderNote]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const d=await api('v3Dashboard');setProducts(d.products||[]);setSignals(d.signals||[]);setOrders(d.orders||[]);}
  catch(e){setError(e.message);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);
 const active=useMemo(()=>products.filter(p=>p.status==='active'&&(p.name+' '+(p.profile?.displayName||'')).toLowerCase().includes(search.trim().toLowerCase())),[products,search]);
 const chosen=products.find(p=>p.id===selected);
 const current=products.find(p=>p.id===editId);
 const update=async(action,payload,success)=>{
  if(busy)return;setBusy(true);setError('');
  try{await api(action,payload);notify(success,'success');await load();return true;}
  catch(e){setError(e.message);notify(e.message,'error');return false;}
  finally{setBusy(false);}
 };
 const begin=p=>{const c=p.profile;setEditId(p.id);setStep(0);setMode(c?.controlMode||'availability');setOrigin(c?.origin||'supplier');setCountUnit(c?.countUnit||'un');setLocs(c?.locations||['reserva']);setPresentation(c?.receivingPresentation||'');setTrackingNote(c?.trackingNote||'');setSourceIds(c?.sourceProductIds||[]);setAltIds(c?.alternativeProductIds||[]);setTab('catalog');};
 const saveProfile=async()=>{
  if(!current)return;
  const ok=await update('v3ProfileSave',{productId:editId,expectedVersion:current.profile?.version||null,
   profile:{displayName:current.name,controlMode:mode,origin,countUnit:mode==='quantitative'?countUnit:null,locations:locs,
   receivingPresentation:presentation||null,sourceProductIds:sourceIds,alternativeProductIds:altIds,trackingNote}},'Configuração operacional atualizada.');
  if(ok){setEditId('');setStep(0);}
 };
 const receive=async e=>{
  e.preventDefault();const product=products.find(p=>p.id===receipt.productId);
  if(!product?.profile){setError('Configure o produto antes do recebimento.');return;}
  const isCounted=product.profile.controlMode==='quantitative';
  if(isCounted&&!receipt.stockQuantity.trim()){setError('Informe a quantidade física conferida; não calculamos a partir da embalagem.');return;}
  if(product.trackExpiry&&(!receipt.lot.trim()||!receipt.expiryDate)){setError('Informe lote e validade para este insumo.');return;}
  const payload={...receipt,requestId:crypto.randomUUID(),orderId:receipt.orderId||null,
   commercialQuantity:Number(receipt.commercialQuantity),stockQuantity:isCounted?Number(receipt.stockQuantity):0};
  const ok=await update('v3Receive',payload,'Recebimento conferido e registrado.');
  if(ok)setReceipt(x=>({...x,commercialQuantity:'',stockQuantity:'',lot:'',expiryDate:'',notes:''}));
 };
 const countStock=async e=>{
  e.preventDefault();
  const product=products.find(p=>p.id===count.productId);
  if(product?.trackExpiry){setError('Este produto exige contagem detalhada por lote, ainda indisponível nesta tela. Nenhum saldo foi alterado.');return;}
  const ok=await update('v3Count',{...count,requestId:crypto.randomUUID(),sessionId:crypto.randomUUID(),quantity:Number(count.quantity)},'Contagem registrada para o local.');
  if(ok)setCount(x=>({...x,quantity:'',notes:''}));
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
  <header className="v3-head"><div><p className="eyebrow">OPERAÇÃO DA COZINHA · V3</p><h1>Central de insumos</h1><p>O que temos, o que falta e o que está previsto para chegar.</p></div><button type="button" className="v3-secondary" onClick={load} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></header>
  <nav className="v3-tabs" aria-label="Seções de insumos">
   {[['overview','Visão geral'],['availability','Avisar falta'],['orders','Entregas'],['counts','Contagens'],...(canManage?[['receiving','Recebimento']]:[]),['receive','Recebimento'],['produce','Produção'],['transfer','Abastecer Giro'],['count','Contagem'],...(canManage?[['catalog','Configurar catálogo']]:[])].map(([key,label])=><button type="button" key={key} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}
  </nav>
  {error&&<p className="v3-error" role="alert">{error}</p>}
  {loading?<p role="status">Carregando dados reais da unidade…</p>:<>
   {['receive','produce','transfer','count'].includes(tab)&&<KitchenV3Workflows key={tab} kind={tab} products={products} orders={orders} membership={membership} onChange={load}/>}
   {tab==='overview'&&<div className="v3-columns">
    <section className="v3-card"><h2>Avisos da equipe</h2>{signals.length===0?<p>Nenhuma falta em aberto.</p>:signals.map(s=><article className="v3-row" key={s.id}><div><strong>{s.productName}</strong><p>{s.location==='giro'?'Giro · 1º piso':'Reserva · 2º piso'} · {s.observation==='missing'?'Possível falta':'Estoque baixo'}</p><small>{s.reports?.length||1} relato(s) · {longDate(s.updatedAt?.seconds?s.updatedAt.seconds*1000:s.updatedAt)}</small></div>{canManage&&<button className="v3-secondary" type="button" disabled={busy} onClick={()=>{const reason=window.prompt('Como essa pendência foi resolvida?');if(reason?.trim())update('v3ResolveSignal',{productId:s.productId,location:s.location,resolution:reason},'Aviso resolvido.')}}>Resolver</button>}</article>)}</section>
    <section className="v3-card"><h2>Próximas entregas</h2>{orders.length===0?<p>Não há pedidos registrados.</p>:orders.slice(0,10).map(o=><article className="v3-row" key={o.id}><div><strong>{date(o.etaDate)} · {o.supplier}</strong><p>{o.items.map(i=>i.name+' '+i.quantity+' '+i.unit).join(' · ')}</p><small>{status[o.status]||o.status}</small></div></article>)}</section>
    <section className="v3-card v3-span"><h2>Disponibilidade por insumo</h2><p>Quantidade mostrada com a origem correta. Sem conferência recente, não declaramos estoque confirmado.</p>
     <div className="v3-tiles">{active.map(p=><article key={p.id} className="v3-tile"><strong>{p.profile?.displayName||p.name}</strong><small>{p.profile?.controlMode==='quantitative'?'Contagem':p.profile?.controlMode==='on_demand'?'Sob demanda':'Disponibilidade'} · {p.profile?'Configurado':'Configuração pendente'}</small><span>{p.profile?.controlMode==='quantitative'?'Conferir locais':'Consultar sinais da equipe'}</span></article>)}</div>
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

   {tab==='receiving'&&canManage&&<section className="v3-card v3-narrow"><h2>Conferir recebimento</h2><p>Informe separadamente a quantidade comercial entregue e o saldo físico realmente aferido. Nunca converter kg em porções presumidas.</p>
    <form className="v3-form" onSubmit={receive}>
     <label>Produto<select required value={receipt.productId} onChange={e=>setReceipt(x=>({...x,productId:e.target.value}))}><option value="">Selecione o insumo</option>{products.filter(p=>p.status==='active').map(p=><option key={p.id} value={p.id}>{p.profile?.displayName||p.name}</option>)}</select></label>
     <label>Pedido correspondente (opcional)<select value={receipt.orderId} onChange={e=>setReceipt(x=>({...x,orderId:e.target.value}))}><option value="">Recebimento sem pedido cadastrado</option>{orders.filter(o=>!['received','cancelled'].includes(o.status)&&o.items.some(i=>i.productId===receipt.productId)).map(o=><option key={o.id} value={o.id}>{date(o.etaDate)} · {o.supplier}</option>)}</select></label>
     <div className="v3-line"><label>Quantidade recebida<input required type="number" min="0.001" step="0.001" value={receipt.commercialQuantity} onChange={e=>setReceipt(x=>({...x,commercialQuantity:e.target.value}))}/></label><label>Unidade comercial<select value={receipt.commercialUnit} onChange={e=>setReceipt(x=>({...x,commercialUnit:e.target.value}))}>{units.map(u=><option key={u} value={u}>{u}</option>)}</select></label></div>
     {products.find(p=>p.id===receipt.productId)?.profile?.controlMode==='quantitative'&&<label>Quantidade física aferida ({products.find(p=>p.id===receipt.productId)?.profile?.countUnit})<input required type="number" min="0.001" step="0.001" value={receipt.stockQuantity} onChange={e=>setReceipt(x=>({...x,stockQuantity:e.target.value}))}/></label>}
     <label>Local de entrada<select value={receipt.location} onChange={e=>setReceipt(x=>({...x,location:e.target.value}))}><option value="reserva">Reserva · 2º piso</option><option value="giro">Giro · 1º piso</option></select></label>
     <label>Fornecedor<input maxLength={100} value={receipt.supplier} onChange={e=>setReceipt(x=>({...x,supplier:e.target.value}))}/></label>
     <label>Lote<input maxLength={80} value={receipt.lot} onChange={e=>setReceipt(x=>({...x,lot:e.target.value}))}/></label>
     <label>Validade<input type="date" value={receipt.expiryDate} onChange={e=>setReceipt(x=>({...x,expiryDate:e.target.value}))}/></label>
     <label>Observações<textarea maxLength={240} value={receipt.notes} onChange={e=>setReceipt(x=>({...x,notes:e.target.value}))}/></label>
     <button type="submit" disabled={busy}>{busy?'Registrando…':'Confirmar conferência física'}</button>
    </form>
   </section>}
   {tab==='counts'&&<section className="v3-card v3-narrow"><h2>Contagem por localização</h2><p>Registrar uma contagem não confirma automaticamente a quantidade total. Reserva e Giro têm referências independentes.</p>
    <form className="v3-form" onSubmit={countStock}>
     <label>Insumo com controle quantitativo<select required value={count.productId} onChange={e=>setCount(x=>({...x,productId:e.target.value}))}><option value="">Selecione</option>{products.filter(p=>p.status==='active'&&p.profile?.controlMode==='quantitative').map(p=><option key={p.id} value={p.id}>{p.profile?.displayName||p.name}</option>)}</select></label>
     <label>Local<select value={count.location} onChange={e=>setCount(x=>({...x,location:e.target.value}))}><option value="reserva">Reserva · 2º piso</option><option value="giro">Giro · 1º piso</option></select></label>
     <label>Quantidade conferida {products.find(p=>p.id===count.productId)?.profile?.countUnit&&'('+products.find(p=>p.id===count.productId).profile.countUnit+')'}<input type="number" required min="0" step={['un','porcao','pacote','duzia'].includes(products.find(p=>p.id===count.productId)?.profile?.countUnit)?'1':'0.001'} value={count.quantity} onChange={e=>setCount(x=>({...x,quantity:e.target.value}))}/></label>
     <label>Observações<textarea maxLength={240} value={count.notes} onChange={e=>setCount(x=>({...x,notes:e.target.value}))}/></label>
     <button type="submit" disabled={busy}>{busy?'Registrando…':'Salvar contagem deste local'}</button>
    </form>
    <p className="v3-info">Produtos com controle de validade exigem contagem discriminada por lote; esta tela não permite ajuste sem essa conferência.</p>
   </section>}
   {tab==='catalog'&&canManage&&<div className="v3-card"><h2>Catálogo operacional configurável</h2><p>As mudanças não convertem saldos antigos. Arquivar e renomear insumos serão tratados com preservação do histórico.</p>
    <label className="v3-search">Buscar insumo<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do insumo"/></label>
    {!editId?<div className="v3-tiles">{active.map(p=><article key={p.id} className="v3-tile"><strong>{p.name}</strong><small>{p.profile?.controlMode||'Não configurado'}</small><button className="v3-secondary" type="button" onClick={()=>begin(p)}>Configurar</button></article>)}</div>:
    <div className="v3-wizard"><div className="v3-row"><h3>{current?.name}</h3><button type="button" className="v3-secondary" onClick={()=>setEditId('')}>Voltar</button></div><p className="v3-info">Etapa {step+1} de 4 · Alteração versionada e auditável</p>
     {step===0&&<div className="v3-form"><label>Como o insumo entra na cozinha?<select value={origin} onChange={e=>setOrigin(e.target.value)}>{sources.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label><label>Como chega? (embalagem ou apresentação)<input maxLength={80} value={presentation} onChange={e=>setPresentation(e.target.value)} placeholder="Ex.: fardo pesado em kg"/></label></div>}
     {step===1&&<div className="v3-form"><label>Como controlar?<select value={mode} onChange={e=>setMode(e.target.value)}>{kinds.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>{mode==='quantitative'&&<label>Como contar?<select value={countUnit} onChange={e=>setCountUnit(e.target.value)}>{units.map(u=><option key={u} value={u}>{u}</option>)}</select></label>}</div>}
     {step===2&&<div className="v3-form"><fieldset><legend>Onde pode ficar armazenado?</legend>{[['reserva','Reserva · 2º piso'],['giro','Giro · 1º piso']].map(([v,label])=><label className="v3-checkbox" key={v}><input type="checkbox" checked={locs.includes(v)} onChange={e=>setLocs(old=>e.target.checked?[...old,v]:old.filter(x=>x!==v))}/>{label}</label>)}</fieldset>{['internal','both'].includes(origin)&&<fieldset><legend>Matérias-primas permitidas na produção</legend><p>Marque as origens normais e as alternativas usadas só quando faltar a principal.</p>{products.filter(p=>p.id!==editId&&p.status==='active').map(p=><div key={p.id} className="v3-source"><strong>{p.name}</strong><select aria-label={'Relação de '+p.name} value={sourceIds.includes(p.id)?'primary':altIds.includes(p.id)?'alternative':'none'} onChange={e=>{setSourceIds(old=>old.filter(x=>x!==p.id).concat(e.target.value==='primary'?[p.id]:[]));setAltIds(old=>old.filter(x=>x!==p.id).concat(e.target.value==='alternative'?[p.id]:[]))}}><option value="none">Não utiliza</option><option value="primary">Origem principal</option><option value="alternative">Alternativa</option></select></div>)}</fieldset>}<label>Observações de preparo e armazenamento<textarea maxLength={240} value={trackingNote} onChange={e=>setTrackingNote(e.target.value)}/></label></div>}
     {step===3&&<div className="v3-review"><p><strong>Origem:</strong> {sources.find(x=>x[0]===origin)?.[1]}</p><p><strong>Recebimento:</strong> {presentation||'Conforme entrada aferida'}</p><p><strong>Controle:</strong> {kinds.find(x=>x[0]===mode)?.[1]} {mode==='quantitative'?'· '+countUnit:''}</p><p><strong>Locais:</strong> {locs.join(', ')}</p><p><strong>Matérias-primas:</strong> {sourceIds.length} principais, {altIds.length} alternativas</p><p>O histórico e a unidade dos saldos existentes permanecerão inalterados.</p></div>}
     <div className="v3-actions"><button type="button" className="v3-secondary" onClick={()=>setStep(x=>Math.max(0,x-1))} disabled={step===0}>Anterior</button>{step<3?<button type="button" disabled={step===2&&locs.length===0} onClick={()=>setStep(x=>x+1)}>Próximo</button>:<button type="button" disabled={busy} onClick={saveProfile}>{busy?'Salvando…':'Confirmar configuração'}</button>}</div>
    </div>}</div>}
  </>}
 </section>;
}
