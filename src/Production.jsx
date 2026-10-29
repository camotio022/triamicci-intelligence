import React,{useCallback,useEffect,useState} from 'react';
import {BookOpen,ClipboardList,RefreshCw,History} from 'lucide-react';
import './production-v4.css';
import {useUnitLive} from './useUnitLive.js';
import LiveStatus from './LiveStatus.jsx';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import {executionQuantity} from '../server/production/daily-task.js';
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
 const [editRecipeId,setEditRecipeId]=useState(''),[recipeVersion,setRecipeVersion]=useState(null),[method,setMethod]=useState(''),[outputLot,setOutputLot]=useState(''),[expiryDate,setExpiryDate]=useState('');
 const [lines,setLines]=useState([{productId:'',quantity:'',substitutes:[]}]);
 const [portions,setPortions]=useState('1'),[items,setItems]=useState([]),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[status,setStatus]=useState('');
 const [requestId,setRequestId]=useState(null);
 const [confirmed,setConfirmed]=useState(false);
 const [dailyTasks,setDailyTasks]=useState([]),[plannedRecipe,setPlannedRecipe]=useState(''),[plannedQuantity,setPlannedQuantity]=useState(''),[activeTaskId,setActiveTaskId]=useState(null),[taskLoading,setTaskLoading]=useState(false);
 const admin=['admin','manager','submanager'].includes(membership.role);
 const canPlan=['admin','manager','submanager','cook'].includes(membership.role);
 const loadTasks=useCallback(async()=>{try{const r=await call('/api/production/manage','dayList');setDailyTasks(r.tasks||[]);return true;}catch(e){setStatus(e.message);return false}},[notify,membership?.unitId]);
 const addDailyTask=async e=>{e.preventDefault();if(taskLoading||!plannedRecipe)return;setTaskLoading(true);try{await call('/api/production/manage','dayAdd',{recipeId:plannedRecipe,plannedQuantity:plannedQuantity?Number(plannedQuantity):null});setPlannedRecipe('');setPlannedQuantity('');await loadTasks();notify('Preparação adicionada à lista.','success')}catch(e){notify(e.message,'error')}finally{setTaskLoading(false)}};
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);try{
   const [p,r]=await Promise.all([call('/api/products/manage','list'),call('/api/production/manage','list')]);
   setProducts(p.products||[]);setRecipes(r.recipes||[]);setRuns(r.runs||[]);return true;
  }catch(e){setStatus(e.message);return false}finally{setLoading(false)}
 },[membership?.unitId]);
 useEffect(()=>{setProducts([]);setRecipes([]);setRuns([]);setDailyTasks([]);setRecipeId('');setActiveTaskId(null);},[membership?.unitId]);
 useEffect(()=>{load();loadTasks()},[load,loadTasks]);
 const live=useUnitLive(membership?.unitId,()=>Promise.all([load(true),loadTasks()]));
 useEffect(()=>{const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());let previous=day();const timer=setInterval(()=>{const current=day();if(current!==previous){previous=current;loadTasks();}},30000);return()=>clearInterval(timer)},[loadTasks]);
 const selected=recipes.find(r=>r.id===recipeId);
 const choose=(id,task=null)=>{
  setRecipeId(id);setRequestId(null);setConfirmed(false);setActiveTaskId(null);
  const r=recipes.find(x=>x.id===id);
  const quantity=executionQuantity(task,r);
  setPortions(String(quantity));
  setItems((r?.lines||[]).map(l=>({productId:l.productId,quantity:String(suggestedQuantity(l.quantity,quantity,r.yieldQuantity,{individual:false})??'')})));
  setNotes('');
 };
 const selectProduct=(i,value)=>{setItems(a=>a.map((x,j)=>j===i?{...x,productId:value}:x));setRequestId(null);setConfirmed(false)};
 const recipeOutputConflict=Boolean(outputProductId&&lines.some(l=>l.productId===outputProductId||l.substitutes?.includes(outputProductId)));
 const recipeDuplicateInputs=new Set(lines.map(l=>l.productId).filter(Boolean)).size!==lines.filter(l=>l.productId).length;
 const saveRecipe=async e=>{
  e.preventDefault();if(busy)return;if(recipeOutputConflict||recipeDuplicateInputs){setStatus('Revise a ficha: o produto final não pode ser ingrediente e cada ingrediente principal deve aparecer uma vez.');return;}setBusy(true);setStatus('');
  try{
   await call('/api/production/manage','saveRecipe',{
    id:editRecipeId||idFor(name),expectedVersion:recipeVersion,method,name,yieldQuantity:Number(yieldQuantity),outputProductId:outputProductId||null,
    lines:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity),location:l.location||(outputProductId?'reserva':'giro'),substitutes:l.substitutes}))});
   setEditRecipeId('');setRecipeVersion(null);setStatus('Ficha técnica salva no Firebase.');notify('Ficha técnica salva com sucesso.','success');await load();
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const archiveRecipe=async()=>{
  if(!editRecipeId||!Number.isInteger(recipeVersion))return;
  if(!window.confirm('Arquivar esta ficha? Ela não aparecerá mais para novas produções, mas o histórico será preservado.'))return;
  setBusy(true);setStatus('');
  try{
   await call('/api/production/manage','archiveRecipe',{id:editRecipeId,expectedVersion:recipeVersion});
   setEditRecipeId('');setRecipeVersion(null);setRecipeId('');setName('');setLines([{productId:'',quantity:'',substitutes:[]}]);
   await Promise.all([load(),loadTasks()]);
   notify('Ficha arquivada. O histórico foi preservado.','success');
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const finish=async e=>{
  e.preventDefault();if(busy||!confirmed)return;
  if(!window.confirm(selected?.outputProductId?'Confirmar a transformação? Os ingredientes sairão dos locais definidos na ficha e o produto preparado entrará na reserva.':'Confirmar a produção e descontar agora os ingredientes realmente utilizados do giro?'))return;
  setBusy(true);setStatus('');
  const id=requestId||crypto.randomUUID();setRequestId(id);
  try{
   const data=await call('/api/production/manage','finish',{recipeId,requestId:id,portions:Number(portions),
    items:items.map(i=>({productId:i.productId,quantity:Number(i.quantity)})),notes,outputLot,expiryDate,taskId:activeTaskId});
   setStatus(data.message);notify(data.message,'success');setRequestId(null);setConfirmed(false);setActiveTaskId(null);await Promise.all([load(),loadTasks()]);
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const option=(id)=>products.find(p=>p.id===id);
 const inputUnit=id=>{const p=option(id);return p?.operationalUnitOverride||p?.physicalUnit||p?.unit||'un';};
 const inputStep=id=>['un','pacote','porcao','duzia'].includes(inputUnit(id))?'1':'.001';
 return <section className="inventory-page production-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId.toUpperCase()}</p>
  <h1>Produção da cozinha</h1><LiveStatus state={live}/><p>Planeje o preparo, registre a quantidade produzida e consulte o histórico.</p>
  {status&&<p role="status" className="receiving-notice">{status}</p>}
  <section className="receiving-card ti-v4-daily-tasks"><h2>Lista de produção de hoje</h2><p>Planejamento compartilhado da cozinha. Só a confirmação da quantidade realmente produzida movimenta o estoque.</p>
   {canPlan&&<form className="ti-v4-daily-task-form" onSubmit={addDailyTask}><label>Preparação<select required value={plannedRecipe} onChange={e=>setPlannedRecipe(e.target.value)}><option value="">Escolher preparação</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Meta opcional ({recipes.find(r=>r.id===plannedRecipe)?.outputUnit||'un'})<input type="number" min="0.001" max="10000" step="0.001" value={plannedQuantity} onChange={e=>setPlannedQuantity(e.target.value)}/></label><button type="submit" disabled={!plannedRecipe||taskLoading}>Adicionar à lista</button></form>}
   {dailyTasks.length===0?<p className="ti-v4-production-empty">Nenhuma preparação planejada para hoje.</p>:<ul className="ti-v4-daily-task-list">{dailyTasks.map(task=><li key={task.id}><div><strong>{task.recipeName}</strong><small>{task.status==="completed"?`Concluída: ${task.completedQuantity} ${task.unit||'un'}`:task.status==="partial"?`Parcial: ${task.completedQuantity} de ${task.plannedQuantity} ${task.unit||'un'}`:task.plannedQuantity?`Meta: ${task.plannedQuantity} ${task.unit||'un'}`:"Quantidade a definir"}</small></div>{task.status!=="completed"?<button type="button" onClick={()=>{choose(task.recipeId,task);setActiveTaskId(task.id);document.querySelector(".production-page .ti-v4-production-layout")?.scrollIntoView({behavior:"smooth",block:"start"})}}>Registrar execução</button>:<span className="ti-v4-task-done">Concluída</span>}</li>)}</ul>}
  </section>
  <div className="production-layout ti-v4-production-layout">
   <section className="receiving-card">
    <h2><ClipboardList size={19} aria-hidden="true"/> Registrar produção</h2>
    <form className="stock-action-form" onSubmit={finish}>
     <label>Preparação<select required value={recipeId} onChange={e=>choose(e.target.value)}>
      <option value="">Selecione a preparação</option>
      {recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
     </select></label>
     {selected&&<>
      <label>Quantidade produzida ({selected.outputUnit||'un'})<input type="number" required min={['un','porcao','pacote','duzia'].includes(selected.outputUnit||'un')?'1':'0.001'} step={['un','porcao','pacote','duzia'].includes(selected.outputUnit||'un')?'1':'0.001'} value={portions} onChange={e=>{const n=Number(e.target.value);setPortions(e.target.value);setRequestId(null);setConfirmed(false);
       if(n>0&&selected)setItems(selected.lines.map(line=>({productId:line.productId,
        quantity:String(suggestedQuantity(line.quantity,n,selected.yieldQuantity,{individual:false})??'')})))}}/></label>
      <p>{selected.outputProductId?'Esta ficha transforma os ingredientes dos locais definidos em um produto preparado na reserva. As quantidades precisam respeitar a ficha validada.':'Revise as quantidades reais. Os valores iniciais vêm da ficha técnica e podem ser corrigidos.'}</p>
      {selected.outputProductId&&<div className="ti-v4-conversion-summary"><strong>{selected.name} → {option(selected.outputProductId)?.name||'Preparação final'}</strong><p>Destino: reserva · {portions||'—'} {selected.outputUnit||'un'} preparados.</p><small>Insumos previstos conforme ficha técnica:</small><ul>{items.map((item,i)=><li key={i}>{option(item.productId)?.name||item.productId}: {item.quantity||'—'} {inputUnit(item.productId)} de {selected.lines[i]?.location||'reserva'}</li>)}</ul></div>}
      {!selected.outputProductId&&items.map((item,i)=>{
       const original=selected.lines[i];const allowed=[original.productId,...(original.substitutes||[])];
       return <div className="stock-lot-row" key={i}>
        <label>Ingrediente {i+1}<select value={item.productId} onChange={e=>selectProduct(i,e.target.value)}>
         {allowed.map(id=><option key={id} value={id}>{option(id)?.name||id}</option>)}
        </select></label>
        <label>Quantidade realmente utilizada ({inputUnit(item.productId)})<input type="number" required min={inputStep(item.productId)} step={inputStep(item.productId)} value={item.quantity}
          onChange={e=>{setItems(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x));setRequestId(null);setConfirmed(false)}}/></label>
       </div>})}
      {selected.method&&<details><summary>Consultar modo de preparo</summary><p>{selected.method}</p></details>}
      {selected.outputProductId&&option(selected.outputProductId)?.lotTrackingMode==='per_lot'&&<div className="stock-lot-row"><label>Lote do preparo final<input required maxLength={80} value={outputLot} onChange={e=>{setOutputLot(e.target.value);setRequestId(null);setConfirmed(false)}}/></label><label>Validade do preparo<input type="date" required value={expiryDate} onChange={e=>{setExpiryDate(e.target.value);setRequestId(null);setConfirmed(false)}}/></label></div>}
      <label>Observações<input maxLength={240} value={notes} onChange={e=>{setNotes(e.target.value);setRequestId(null);setConfirmed(false)}}/></label>
      <label className="production-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> {selected.outputProductId?'Confirmo a quantidade produzida e os locais de origem conforme ficha técnica validada.':'Conferi os ingredientes e as quantidades reais utilizadas, não apenas as sugestões da ficha.'}</label>
      <button type="submit" className="stock-action-save" disabled={busy||!items.length||!confirmed}>{busy?'Registrando...':selected?.outputProductId?'Confirmar transformação na reserva':'Finalizar e descontar os ingredientes'}</button>
     </>}
    </form>
   </section>
   {admin&&<details className="receiving-card ti-v4-recipe-details">
    <summary><BookOpen size={20} aria-hidden="true"/><span>Gerenciar fichas técnicas <small>Cadastro e ingredientes das preparações</small></span></summary>
    <h2>{editRecipeId?'Revisar ficha técnica':'Nova ficha técnica'}</h2><label>Ficha para revisar<select value={editRecipeId} onChange={e=>{const r=recipes.find(x=>x.id===e.target.value);setEditRecipeId(r?.id||'');setRecipeVersion(r?.version??null);setName(r?.name||'');setMethod(r?.method||'');setYield(String(r?.yieldQuantity||1));setOutputProductId(r?.outputProductId||'');setLines(r?.lines?.map(l=>({...l,substitutes:l.substitutes||[]}))||[{productId:'',quantity:'',substitutes:[]}])}}><option value="">Criar nova ficha</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name} · v{r.version}</option>)}</select></label>
    <p>Defina uma preparação validada, com quantidades por rendimento. Não invente pesos nem conversões entre kg e peças.</p>
    <form className="stock-action-form" onSubmit={saveRecipe}>
     <label>Nome da preparação<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Rendimento padrão ({inputUnit(outputProductId)})<input type="number" min="0.001" step="0.001" value={yieldQuantity} onChange={e=>setYield(e.target.value)}/></label>
     <label>Produto preparado que entrará na reserva (opcional)<select value={outputProductId} onChange={e=>setOutputProductId(e.target.value)}><option value="">Somente consumo de ingredientes (sem produto final)</option>{products.filter(p=>p.status==="active").map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     {recipeOutputConflict&&<p role="alert" className="v3-error">O produto final também está selecionado como ingrediente ou substituto. Corrija antes de salvar.</p>}
     {recipeDuplicateInputs&&<p role="alert" className="v3-error">Há ingredientes principais repetidos. Consolide a quantidade numa única linha.</p>}
     {outputProductId&&<p>Ficha transformacional: os ingredientes deverão existir nos locais de origem selecionados; ao confirmar produção, o preparado entrará na reserva na mesma transação. Se houver controle de validade, cada produção exigirá lote e validade reais.</p>}

     <label>Modo de preparo<textarea maxLength={2000} value={method} onChange={e=>setMethod(e.target.value)}/></label>
     {lines.map((line,i)=><div className="stock-lot-row" key={i}>
      <p className="v3-info" role="note">Confira a unidade física de cada insumo e o rendimento real da ficha antes de salvar. O sistema não converte kg, peças ou porções por suposição.</p>
     <label>Insumo principal<select required value={line.productId} onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,productId:e.target.value}:x))}>
       <option value="">Selecionar insumo</option>{products.filter(p=>p.status==='active'||p.id===line.productId).map(p=><option key={p.id} value={p.id} disabled={p.status!=='active'||p.id===outputProductId}>{p.name}{p.status!=='active'?' (inativo)':''}</option>)}
      </select></label>
      <label>Quantidade por rendimento ({inputUnit(line.productId)})<input required type="number" min={inputStep(line.productId)} step={inputStep(line.productId)} value={line.quantity}
       onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))}/></label>
      <label>Local de origem<select value={line.location||(outputProductId?'reserva':'giro')} onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,location:e.target.value}:x))}><option value="reserva">Reserva</option><option value="giro">Giro</option></select></label>
      <label>Substituto autorizado<select value={line.substitutes[0]||''}
       onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,substitutes:e.target.value?[e.target.value]:[]}:x))}>
       <option value="">Nenhum</option>{products.filter(p=>(p.status==='active'||p.id===line.substitutes[0])&&p.id!==line.productId).map(p=><option key={p.id} value={p.id} disabled={p.status!=='active'||p.id===outputProductId}>{p.name}{p.status!=='active'?' (inativo)':''}</option>)}
      </select></label>
      {lines.length>1&&<button type="button" onClick={()=>setLines(a=>a.filter((_,j)=>j!==i))}>Excluir ingrediente</button>}
     </div>)}
     <button type="button" disabled={lines.length>=12} onClick={()=>setLines(a=>[...a,{productId:'',quantity:'',substitutes:[]}])}>Adicionar ingrediente</button>
     <button type="submit" className="stock-action-save" disabled={busy||!name.trim()||recipeOutputConflict||recipeDuplicateInputs}>{busy?'Salvando...':'Salvar ficha técnica'}</button>
     {editRecipeId&&<button type="button" disabled={busy} onClick={archiveRecipe}>Arquivar ficha experimental</button>}
    </form>
   </details>}
  </div>
  <section className="receiving-card"><div className="inventory-list-header"><h2><History size={19} aria-hidden="true"/> Produções registradas</h2><button type="button" onClick={load} aria-label="Atualizar produções"><RefreshCw size={16} aria-hidden="true"/> Atualizar</button></div>
   {loading?<p>Consultando Firebase...</p>:runs.length===0?<p className="ti-v4-production-empty">Nenhuma produção registrada nesta consulta. Adicionar uma preparação à lista não movimenta estoque.</p>:
    <div className="production-history">{runs.map(r=><article key={r.id}><strong>{r.recipeName}</strong>
     <span>{r.portions} {r.outputUnit||'un'} · {r.at?new Date(r.at).toLocaleString('pt-BR'):'—'}</span>
     <small>{r.items?.map(i=>i.productName+' '+i.quantity+' '+i.unit).join(' · ')}</small>
     <small>Responsável: {r.actorName||r.actorUid}</small></article>)}</div>}
  </section>

 </section>;
}
