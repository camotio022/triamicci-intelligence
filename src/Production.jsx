import React,{useCallback,useEffect,useState} from 'react';
import {BookOpen,ClipboardList,RefreshCw,History} from 'lucide-react';
import './production-v4.css';
import {startVisibleRefresh} from './visible-refresh.js';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import {suggestedQuantity} from '../server/production/logic.js';
const idFor=s=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
async function call(path,action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login.');
 const token=await user.getIdToken();
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...payload})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Erro na operação.');return data;
}
export default function Production({membership}){
 const {notify}=useFeedback();
 const [recipes,setRecipes]=useState([]),[runs,setRuns]=useState([]),[products,setProducts]=useState([]);
 const [recipeId,setRecipeId]=useState(''),[name,setName]=useState(''),[yieldQuantity,setYield]=useState('1'),[outputProductId,setOutputProductId]=useState('');
 const [lines,setLines]=useState([{productId:'',quantity:'',substitutes:[]}]);
 const [portions,setPortions]=useState('1'),[items,setItems]=useState([]),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[status,setStatus]=useState('');
 const [requestId,setRequestId]=useState(null);
 const [confirmed,setConfirmed]=useState(false);
 const [dailyTasks,setDailyTasks]=useState([]),[plannedRecipe,setPlannedRecipe]=useState(''),[plannedQuantity,setPlannedQuantity]=useState(''),[activeTaskId,setActiveTaskId]=useState(null),[taskLoading,setTaskLoading]=useState(false);
 const admin=['admin','manager','submanager'].includes(membership.role);
 const canPlan=['admin','manager','submanager','cook'].includes(membership.role);
 const loadTasks=useCallback(async()=>{try{const r=await call('/api/production/manage','dayList');setDailyTasks(r.tasks||[]);}catch(e){notify(e.message,'error')}},[notify,membership?.unitId]);
 const addDailyTask=async e=>{e.preventDefault();if(taskLoading||!plannedRecipe)return;setTaskLoading(true);try{await call('/api/production/manage','dayAdd',{recipeId:plannedRecipe,plannedQuantity:plannedQuantity?Number(plannedQuantity):null});setPlannedRecipe('');setPlannedQuantity('');await loadTasks();notify('Preparação adicionada à lista.','success')}catch(e){notify(e.message,'error')}finally{setTaskLoading(false)}};
 const load=useCallback(async()=>{
  setLoading(true);try{
   const [p,r]=await Promise.all([call('/api/products/manage','list'),call('/api/production/manage','list')]);
   setProducts(p.products||[]);setRecipes(r.recipes||[]);setRuns(r.runs||[]);
  }catch(e){setStatus(e.message)}finally{setLoading(false)}
 },[membership?.unitId]);
 useEffect(()=>{setProducts([]);setRecipes([]);setRuns([]);setDailyTasks([]);setRecipeId('');setActiveTaskId(null);},[membership?.unitId]);
 useEffect(()=>{load();loadTasks()},[load,loadTasks]);
 useEffect(()=>startVisibleRefresh(loadTasks,{document,setInterval,clearInterval}),[loadTasks]);
 const selected=recipes.find(r=>r.id===recipeId);
 const choose=id=>{
  setRecipeId(id);setRequestId(null);setConfirmed(false);setActiveTaskId(null);
  const r=recipes.find(x=>x.id===id);
  setPortions(String(r?.yieldQuantity||1));
  setItems((r?.lines||[]).map(l=>({productId:l.productId,quantity:String(l.quantity)})));
 };
 const selectProduct=(i,value)=>{setItems(a=>a.map((x,j)=>j===i?{...x,productId:value}:x));setRequestId(null);setConfirmed(false)};
 const saveRecipe=async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setStatus('');
  try{
   await call('/api/production/manage','saveRecipe',{
    id:idFor(name),name,yieldQuantity:Number(yieldQuantity),outputProductId:outputProductId||null,
    lines:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity),substitutes:l.substitutes}))});
   setStatus('Ficha técnica salva no Firebase.');notify('Ficha técnica salva com sucesso.','success');await load();
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const finish=async e=>{
  e.preventDefault();if(busy||!confirmed)return;
  if(!window.confirm(selected?.outputProductId?'Confirmar a transformação? Os ingredientes sairão da reserva e o produto preparado entrará na reserva.':'Confirmar a produção e descontar agora os ingredientes realmente utilizados do giro?'))return;
  setBusy(true);setStatus('');
  const id=requestId||crypto.randomUUID();setRequestId(id);
  try{
   const data=await call('/api/production/manage','finish',{recipeId,requestId:id,portions:Number(portions),
    items:items.map(i=>({productId:i.productId,quantity:Number(i.quantity)})),notes,taskId:activeTaskId});
   setStatus(data.message);notify(data.message,'success');setRequestId(null);setConfirmed(false);setActiveTaskId(null);await Promise.all([load(),loadTasks()]);
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const option=(id)=>products.find(p=>p.id===id);
 return <section className="inventory-page production-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId.toUpperCase()}</p>
  <h1>Produção da cozinha</h1><p>Consulte o que já foi preparado e registre uma nova produção. Fichas com produto final cadastrado transformam ingredientes da reserva em preparação na reserva; fichas antigas continuam consumindo do giro.</p>
  {status&&<p role="status" className="receiving-notice">{status}</p>}
  <section className="receiving-card ti-v4-daily-tasks"><h2>Lista de produção de hoje</h2><p>Planejamento compartilhado da cozinha. Só a confirmação da quantidade realmente produzida movimenta o estoque.</p>
   {canPlan&&<form className="ti-v4-daily-task-form" onSubmit={addDailyTask}><label>Preparação<select required value={plannedRecipe} onChange={e=>setPlannedRecipe(e.target.value)}><option value="">Escolher preparação</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Meta opcional (porções)<input type="number" min="1" max="10000" step="1" value={plannedQuantity} onChange={e=>setPlannedQuantity(e.target.value)}/></label><button type="submit" disabled={!plannedRecipe||taskLoading}>Adicionar à lista</button></form>}
   {dailyTasks.length===0?<p className="ti-v4-production-empty">Nenhuma preparação planejada para hoje.</p>:<ul className="ti-v4-daily-task-list">{dailyTasks.map(task=><li key={task.id}><div><strong>{task.recipeName}</strong><small>{task.status==="completed"?`Concluída: ${task.completedQuantity} porções`:task.status==="partial"?`Parcial: ${task.completedQuantity} de ${task.plannedQuantity} porções`:task.plannedQuantity?`Meta: ${task.plannedQuantity} porções`:"Quantidade a definir"}</small></div>{task.status!=="completed"?<button type="button" onClick={()=>{choose(task.recipeId);setActiveTaskId(task.id);document.querySelector(".production-page .ti-v4-production-layout")?.scrollIntoView({behavior:"smooth",block:"start"})}}>Registrar execução</button>:<span className="ti-v4-task-done">Concluída</span>}</li>)}</ul>}
  </section>
  <section className="receiving-card"><div className="inventory-list-header"><h2><History size={19} aria-hidden="true"/> Produções registradas</h2><button type="button" onClick={load} aria-label="Atualizar produções"><RefreshCw size={16} aria-hidden="true"/> Atualizar</button></div>
   {loading?<p>Consultando Firebase...</p>:runs.length===0?<p className="ti-v4-production-empty">Nenhuma produção finalizada foi registrada. A lista de tarefas planejadas será integrada nesta etapa seguinte da V4.</p>:
    <div className="production-history">{runs.map(r=><article key={r.id}><strong>{r.recipeName}</strong>
     <span>{r.portions} porções · {r.at?new Date(r.at).toLocaleString('pt-BR'):'—'}</span>
     <small>{r.items?.map(i=>i.productName+' '+i.quantity+' '+i.unit).join(' · ')}</small>
     <small>Responsável: {r.actorName||r.actorUid}</small></article>)}</div>}
  </section>
  <div className="production-layout ti-v4-production-layout">
   <section className="receiving-card">
    <h2><ClipboardList size={19} aria-hidden="true"/> Registrar produção</h2>
    <form className="stock-action-form" onSubmit={finish}>
     <label>Preparação<select required value={recipeId} onChange={e=>choose(e.target.value)}>
      <option value="">Selecione a preparação</option>
      {recipes.map(r=><option key={r.id} value={r.id}>{r.name} · versão {r.version}</option>)}
     </select></label>
     {selected&&<>
      <label>Porções produzidas<input type="number" required min="1" step="1" value={portions} onChange={e=>{const n=Number(e.target.value);setPortions(e.target.value);setRequestId(null);setConfirmed(false);
       if(n>0&&selected)setItems(selected.lines.map(line=>({productId:line.productId,
        quantity:String(suggestedQuantity(line.quantity,n,selected.yieldQuantity,{individual:option(line.productId)?.physicalUnit==='un'})??'')})))}}/></label>
      <p>{selected.outputProductId?'Esta ficha transforma itens da reserva em um produto preparado na reserva. As quantidades precisam respeitar a ficha validada.':'Revise as quantidades reais. Os valores iniciais vêm da ficha técnica e podem ser corrigidos.'}</p>
      {selected.outputProductId&&<div className="ti-v4-conversion-summary"><strong>{selected.name} → {option(selected.outputProductId)?.name||'Preparação final'}</strong><p>Destino: reserva · {portions||'—'} unidades preparadas.</p><small>Insumos previstos conforme ficha técnica:</small><ul>{items.map((item,i)=><li key={i}>{option(item.productId)?.name||item.productId}: {item.quantity||'—'} {option(item.productId)?.physicalUnit||option(item.productId)?.unit||''} da reserva</li>)}</ul></div>}
      {!selected.outputProductId&&items.map((item,i)=>{
       const original=selected.lines[i];const allowed=[original.productId,...(original.substitutes||[])];
       return <div className="stock-lot-row" key={i}>
        <label>Ingrediente {i+1}<select value={item.productId} onChange={e=>selectProduct(i,e.target.value)}>
         {allowed.map(id=><option key={id} value={id}>{option(id)?.name||id}</option>)}
        </select></label>
        <label>Quantidade utilizada<input type="number" required min={option(item.productId)?.physicalUnit==='un'?'1':'.001'} step={option(item.productId)?.operationalUnitOverride==='un'||option(item.productId)?.unit==='un'?'1':'.001'} value={item.quantity}
          onChange={e=>{setItems(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x));setRequestId(null);setConfirmed(false)}}/></label>
       </div>})}
      <label>Observações<input maxLength={240} value={notes} onChange={e=>{setNotes(e.target.value);setRequestId(null);setConfirmed(false)}}/></label>
      <label className="production-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> {selected.outputProductId?'Confirmo a quantidade produzida e a transformação da reserva conforme ficha técnica validada.':'Conferi os ingredientes e as quantidades reais utilizadas, não apenas as sugestões da ficha.'}</label>
      <button type="submit" className="stock-action-save" disabled={busy||!items.length||!confirmed}>{busy?'Registrando...':selected?.outputProductId?'Confirmar transformação na reserva':'Finalizar e descontar do giro'}</button>
     </>}
    </form>
   </section>
   {admin&&<details className="receiving-card ti-v4-recipe-details">
    <summary><BookOpen size={20} aria-hidden="true"/><span>Gerenciar fichas técnicas <small>Cadastro e ingredientes das preparações</small></span></summary>
    <h2>Nova ficha técnica</h2>
    <p>Defina uma preparação validada, com quantidades por rendimento. Não invente pesos nem conversões entre kg e peças.</p>
    <form className="stock-action-form" onSubmit={saveRecipe}>
     <label>Nome da preparação<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Rendimento padrão (porções)<input type="number" min="1" step="1" value={yieldQuantity} onChange={e=>setYield(e.target.value)}/></label>
     <label>Produto preparado que entrará na reserva (opcional)<select value={outputProductId} onChange={e=>setOutputProductId(e.target.value)}><option value="">Ficha antiga: apenas consumo do giro</option>{products.filter(p=>p.status==="active"&&!p.trackExpiry).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     {outputProductId&&<p>Ficha transformacional: os ingredientes deverão existir na reserva; ao confirmar produção, o preparado entrará na reserva na mesma transação. Produtos com controle de validade exigem fluxo específico.</p>}

     {lines.map((line,i)=><div className="stock-lot-row" key={i}>
      <label>Insumo principal<select required value={line.productId} onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,productId:e.target.value}:x))}>
       <option value="">Selecionar insumo</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label>Quantidade por rendimento<input required type="number" min={option(line.productId)?.physicalUnit==='un'?'1':'.001'} step={option(line.productId)?.operationalUnitOverride==='un'||option(line.productId)?.unit==='un'?'1':'.001'} value={line.quantity}
       onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))}/></label>
      <label>Substituto autorizado<select value={line.substitutes[0]||''}
       onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,substitutes:e.target.value?[e.target.value]:[]}:x))}>
       <option value="">Nenhum</option>{products.filter(p=>p.id!==line.productId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      {lines.length>1&&<button type="button" onClick={()=>setLines(a=>a.filter((_,j)=>j!==i))}>Excluir ingrediente</button>}
     </div>)}
     <button type="button" disabled={lines.length>=12} onClick={()=>setLines(a=>[...a,{productId:'',quantity:'',substitutes:[]}])}>Adicionar ingrediente</button>
     <button type="submit" className="stock-action-save" disabled={busy||!name.trim()}>{busy?'Salvando...':'Salvar ficha técnica'}</button>
    </form>
   </details>}
  </div>

 </section>;
}
