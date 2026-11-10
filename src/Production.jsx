import SameProductPortioning from './SameProductPortioning.jsx';
import PreparationSetup from './PreparationSetup.jsx';
import {apiFetch} from './api-fetch.js';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {CheckCircle2,ClipboardList,Clock3} from 'lucide-react';
import TriamicciHistory from './TriamicciHistory.jsx';
import './production-v4.css';
import {useUnitLive} from './useUnitLive.js';
import LiveStatus from './LiveStatus.jsx';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import {executionQuantity} from '../server/production/daily-task.js';
import {suggestedQuantity} from '../server/production/logic.js';
async function call(path,action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login.');
 const token=await user.getIdToken();
 const res=await apiFetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...payload})});
 const data=await res.json();if(!res.ok)throw Object.assign(Error(data.message||'Erro na operação.'),{data});return data;
}
export default function Production({membership,initialTaskId}){
 const {notify}=useFeedback();
 const openedTaskRef=useRef(null);
 const [view,setView]=useState('today'),[setupRecipe,setSetupRecipe]=useState(null),[setupDirty,setSetupDirty]=useState(false);
 const switchView=next=>{if(next!==view&&setupDirty&&!window.confirm('Sair e descartar as alterações não salvas desta preparação?'))return;setSetupDirty(false);setView(next);};
 const [blockedRecipes,setBlockedRecipes]=useState([]),[reviewRecipes,setReviewRecipes]=useState([]);
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
 const canPlan=['admin','manager','submanager','cook','auxiliar'].includes(membership.role);
 const loadTasks=useCallback(async()=>{try{const r=await call('/api/production/manage','dayList');setDailyTasks(r.tasks||[]);return true;}catch(e){setStatus(e.message);return false}},[notify,membership?.unitId]);
 const addDailyTask=async e=>{e.preventDefault();if(taskLoading||!plannedRecipe)return;setTaskLoading(true);try{await call('/api/production/manage','dayAdd',{recipeId:plannedRecipe,plannedQuantity:plannedQuantity?Number(plannedQuantity):null});setPlannedRecipe('');setPlannedQuantity('');await loadTasks();notify('Preparação adicionada à lista.','success')}catch(e){notify(e.message,'error')}finally{setTaskLoading(false)}};
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);try{
   const r=await call('/api/production/manage','list',{includeProducts:true});
   const p=Array.isArray(r.products)?r:await call('/api/products/manage','list');
   setProducts(p.products||[]);setRecipes(r.recipes||[]);setBlockedRecipes(r.blockedRecipes||[]);setReviewRecipes(r.reviewRecipes||[]);setRuns(r.runs||[]);return true;
  }catch(e){setStatus(e.message);return false}finally{setLoading(false)}
 },[membership?.unitId]);
 useEffect(()=>{setProducts([]);setRecipes([]);setBlockedRecipes([]);setReviewRecipes([]);setRuns([]);setDailyTasks([]);setRecipeId('');setActiveTaskId(null);setView('today');setSetupRecipe(null);setEditRecipeId('');setStatus('');setPlannedRecipe('');setPlannedQuantity('');},[membership?.unitId]);

 const live=useUnitLive(membership?.unitId,(initial,changes)=>Promise.all([!changes||changes.some(domain=>['stock','catalog','production'].includes(domain))?load(!initial):true,!changes||changes.includes('production')?loadTasks():true]),{domains:['stock','catalog','production']});
 useEffect(()=>{const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());let previous=day();const timer=setInterval(()=>{const current=day();if(current!==previous){previous=current;loadTasks();}},30000);return()=>clearInterval(timer)},[loadTasks]);
 const openExecution=(task)=>{choose(task.recipeId,task);setActiveTaskId(task.id);requestAnimationFrame(()=>document.querySelector('.production-page .ti-v4-production-layout')?.scrollIntoView({behavior:'smooth',block:'start'}));};
 useEffect(()=>{
  if(!initialTaskId||openedTaskRef.current===initialTaskId||!dailyTasks.length||!recipes.length)return;
  const task=dailyTasks.find(t=>t.id===initialTaskId);
  if(!task||task.status==='completed'||!recipes.some(r=>r.id===task.recipeId))return;
  openedTaskRef.current=initialTaskId;
  openExecution(task);
 },[initialTaskId,dailyTasks,recipes]);
 const selected=recipes.find(r=>r.id===recipeId);
 const choose=(id,task=null)=>{
  setOutputLot('');setExpiryDate('');setRecipeId(id);setRequestId(null);setConfirmed(false);setActiveTaskId(null);
  const r=recipes.find(x=>x.id===id);
  const quantity=executionQuantity(task,r);
  setPortions(String(quantity));
  setItems((r?.lines||[]).map(l=>({productId:l.productId,quantity:r.stockEffect==='measured_transformation'?'':String(suggestedQuantity(l.quantity,quantity,r.yieldQuantity,{individual:false})??'')})));
  setNotes('');
 };
 const selectProduct=(i,value)=>{setItems(a=>a.map((x,j)=>j===i?{...x,productId:value}:x));setRequestId(null);setConfirmed(false)};
 const recipeOutputConflict=Boolean(outputProductId&&lines.some(l=>l.productId===outputProductId||l.substitutes?.includes(outputProductId)));
 const recipeDuplicateInputs=new Set(lines.map(l=>l.productId).filter(Boolean)).size!==lines.filter(l=>l.productId).length;
 const saveRecipe=async e=>{
  e.preventDefault();if(busy||!editRecipeId)return;if(recipeOutputConflict||recipeDuplicateInputs){setStatus('Revise a ficha: o produto final não pode ser ingrediente e cada ingrediente principal deve aparecer uma vez.');return;}setBusy(true);setStatus('');
  try{
   await call('/api/production/manage','saveRecipe',{
    id:editRecipeId,expectedVersion:recipeVersion,method,name,yieldQuantity:Number(yieldQuantity),outputProductId:outputProductId||null,
    lines:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity),location:l.location||(outputProductId?'reserva':'giro'),substitutes:l.substitutes}))});
   setEditRecipeId('');setRecipeVersion(null);setName('');setMethod('');setYield('1');setOutputProductId('');setLines([{productId:'',quantity:'',substitutes:[]}]);setStatus('Ficha técnica salva no Firebase.');notify('Ficha técnica salva com sucesso.','success');await load();
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const archiveRecipe=async()=>{
  if(!editRecipeId||!Number.isInteger(recipeVersion))return;
  if(!window.confirm('Arquivar esta ficha? Ela não aparecerá mais para novas produções, mas o histórico será preservado.'))return;
  setBusy(true);setStatus('');
  try{
   await call('/api/production/manage','archiveRecipe',{id:editRecipeId,expectedVersion:recipeVersion});
   setEditRecipeId('');setRecipeVersion(null);setRecipeId('');setName('');setMethod('');setYield('1');setOutputProductId('');setLines([{productId:'',quantity:'',substitutes:[]}]);
   await Promise.all([load(),loadTasks()]);
   notify('Ficha arquivada. O histórico foi preservado.','success');
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const finish=async e=>{
  e.preventDefault();if(busy||!confirmed||!selected)return;
  if(!window.confirm(selected?.outputProductId?'Confirmar a transformação? Os ingredientes sairão dos locais definidos na ficha e o produto preparado entrará na reserva.':'Confirmar a produção e descontar agora os ingredientes realmente utilizados do giro?'))return;
  setBusy(true);setStatus('');
  const id=requestId||crypto.randomUUID();setRequestId(id);
  try{
   const data=await call('/api/production/manage','finish',{recipeId,requestId:id,portions:Number(portions),
    items:items.map(i=>({productId:i.productId,quantity:Number(i.quantity)})),notes,outputLot,expiryDate,taskId:activeTaskId});
   setStatus(data.message);notify(data.message,'success');choose('');await Promise.all([load(),loadTasks()]);
  }catch(e){setStatus(e.message);notify(e.message,'error')}finally{setBusy(false)}
 };
 const option=(id)=>products.find(p=>p.id===id);
 const inputUnit=id=>{const p=option(id);return p?.operationalUnitOverride||p?.physicalUnit||p?.unit||'un';};
 const inputStep=id=>['un','pacote','porcao','duzia'].includes(inputUnit(id))?'1':'.001';
 return <section className="inventory-page production-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId.toUpperCase()}</p>
  <h1>Produção da cozinha</h1><LiveStatus state={live}/><p>Planeje o preparo, registre a quantidade produzida e consulte o histórico.</p>
  <nav className="production-tabs" aria-label="Seções da produção">{[['today','Hoje'],...(admin?[['preparations','Preparações']]:[]),['history','Histórico']].map(([key,label])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>switchView(key)}>{label}</button>)}</nav>
  {view==='today'&&blockedRecipes.length>0&&<aside className="production-attention"><div><strong>{blockedRecipes.length} {blockedRecipes.length===1?'preparação precisa':'preparações precisam'} de revisão</strong><p>Vínculos ou unidades pendentes impedem novas produções.</p></div>{admin?<button type="button" onClick={()=>setView('preparations')}>Revisar</button>:<span>Solicite à gestão</span>}</aside>}
  {admin&&view==='preparations'&&<section className="receiving-card production-catalog"><h2>Preparações da unidade</h2><p>Configure uma vez. Depois, use a preparação na rotina de hoje.</p><div className="production-recipe-list">{reviewRecipes.filter(r=>!r.archivedAt&&(r.preparationConfig||r.configurationDraft)).map(r=><article key={r.id}><div><strong>{r.name}</strong><span className={r.available&&r.preparationConfig?'recipe-ready':'recipe-pending'}>{r.available&&r.preparationConfig?'Disponível':!r.preparationConfig?'Concluir novo cadastro':r.active?'Revisar vínculos':'Em revisão'}</span>{!r.available&&r.errors?.map((error,i)=><p key={i}>{error}</p>)}</div><button type="button" onClick={()=>{setSetupRecipe({id:r.id,nonce:Date.now()});requestAnimationFrame(()=>document.querySelector('.prep-setup')?.scrollIntoView({behavior:'smooth',block:'start'}));}}>Revisar</button></article>)}</div><button type="button" className="production-new" onClick={()=>{setSetupRecipe({id:'',nonce:Date.now()});requestAnimationFrame(()=>document.querySelector('.prep-setup')?.scrollIntoView({behavior:'smooth',block:'start'}));}}>+ Nova preparação</button></section>}
  {status&&<p role="status" className="receiving-notice">{status}</p>}
  {view==='today'&&<section className="receiving-card ti-v4-daily-tasks"><h2>Lista de produção de hoje</h2><p>Planejamento compartilhado da cozinha. Só a confirmação da quantidade realmente produzida movimenta o estoque.</p>
   {!loading&&recipes.length===0&&<p className="production-empty">Ainda não há preparações disponíveis. {admin?'Abra Preparações para revisar e ativar o cadastro.':'A gestão precisa revisar e ativar as preparações.'}</p>}
   {canPlan&&recipes.length>0&&<form className="ti-v4-daily-task-form" onSubmit={addDailyTask}><label>Preparação<select required value={plannedRecipe} onChange={e=>setPlannedRecipe(e.target.value)}><option value="">Escolher preparação</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Meta opcional ({recipes.find(r=>r.id===plannedRecipe)?.outputUnit||'un'})<input type="number" min="0.001" max="10000" step="0.001" value={plannedQuantity} onChange={e=>setPlannedQuantity(e.target.value)}/></label><button type="submit" disabled={!plannedRecipe||taskLoading||loading}>Adicionar à lista</button></form>}
   <div className="ti-production-today-heading"><span>{dailyTasks.filter(t=>t.status==='completed').length} de {dailyTasks.length} concluídas</span><small>Marcação automática depois do registro confirmado</small></div>
   {dailyTasks.length===0?<p className="ti-v4-production-empty">Nenhuma preparação planejada para hoje.</p>:<ul className="ti-v4-daily-task-list ti-production-checklist">{dailyTasks.map(task=>{
    const done=task.status==='completed',partial=task.status==='partial',available=recipes.some(r=>r.id===task.recipeId);
    const progress=task.plannedQuantity?Math.min(100,Math.round(100*(Number(task.completedQuantity)||0)/task.plannedQuantity)):null;
    return <li key={task.id} className={'ti-production-check-card'+(done?' is-complete':'')}>
     <span className={'ti-production-check-icon'+(done?' is-complete':'')} aria-hidden="true">{done?<CheckCircle2 size={22}/>:<Clock3 size={20}/>}</span>
     <div className="ti-production-check-info"><strong>{task.recipeName}</strong><small>{done?'Concluída':partial?'Parcial · continuar':task.plannedQuantity?'Pendente':'Sem meta definida'} · {task.plannedQuantity?task.plannedQuantity+' '+(task.unit||'un')+' planejadas':'Quantidade livre'}</small>
      {(partial||done)&&<small>{task.completedQuantity||0} {task.unit||'un'} registradas</small>}
      {progress!==null&&<div className="ti-production-progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label={'Progresso de '+task.recipeName}><span style={{width:progress+'%'}}/></div>}
     </div>
     {done?<span className="ti-v4-task-done"><CheckCircle2 size={14}/> Feito</span>:<button type="button" disabled={!available} title={!available?'Preparação indisponível; solicite revisão à gestão':undefined} onClick={()=>openExecution(task)}>{available?(partial?'Continuar':'Registrar execução'):'Indisponível'}</button>}
    </li>})}</ul>}
  </section>}
  <div className="production-layout ti-v4-production-layout">
   {view==='today'&&<section className="receiving-card">
    <h2><ClipboardList size={19} aria-hidden="true"/> Registrar produção</h2><p>Terminou um preparo? Informe o resultado aqui. Não é obrigatório planejar antes.</p>
    {selected?.stockEffect==='portion_same_product'?<><label>Preparação<select aria-label="Preparação para registrar produção" value={recipeId} onChange={e=>choose(e.target.value)}><option value="">Selecione a preparação</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><SameProductPortioning key={membership.unitId+recipeId+(activeTaskId||'')} taskId={activeTaskId} recipe={selected} call={call} management={admin} onSaved={async message=>{setStatus(message);notify(message,'success');await Promise.all([load(true),loadTasks()])}}/></>:<form className="stock-action-form" onSubmit={finish}>
     <label>Preparação<select aria-label="Preparação para registrar produção" required value={recipeId} onChange={e=>choose(e.target.value)}>
      <option value="">Selecione a preparação</option>
      {recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
     </select></label>
     {selected&&<>
      <label>Quantidade produzida ({selected.outputUnit||'un'})<input type="number" required min={['un','porcao','pacote','duzia'].includes(selected.outputUnit||'un')?'1':'0.001'} step={['un','porcao','pacote','duzia'].includes(selected.outputUnit||'un')?'1':'0.001'} value={portions} onChange={e=>{const n=Number(e.target.value);setPortions(e.target.value);setRequestId(null);setConfirmed(false);
       if(n>0&&selected&&selected.stockEffect!=='measured_transformation')setItems(selected.lines.map(line=>({productId:line.productId,
        quantity:String(suggestedQuantity(line.quantity,n,selected.yieldQuantity,{individual:false})??'')})))}}/></label>
      <p>{selected.stockEffect==='measured_transformation'?'Informe quanto da matéria-prima foi realmente separado para esta transformação e quantas porções ficaram prontas. Não inclua a parte destinada a grelhar ou empanar. A confirmação desconta somente o que foi separado e adiciona o rendimento final.':selected.outputProductId?'Esta ficha transforma os ingredientes dos locais definidos em um produto preparado na reserva. As quantidades precisam respeitar a ficha validada.':'Revise as quantidades reais. Os valores iniciais vêm da ficha técnica e podem ser corrigidos.'}</p>
      {selected.outputProductId&&<div className="ti-v4-conversion-summary"><strong>{selected.name} → {option(selected.outputProductId)?.name||'Preparação final'}</strong><p>Destino: reserva · {portions||'—'} {selected.outputUnit||'un'} preparados.</p><small>{selected.stockEffect==='measured_transformation'?'Matéria-prima realmente separada (sem consumo presumido por porção):':'Insumos previstos conforme ficha técnica:'}</small><ul>{items.map((item,i)=><li key={i}>{option(item.productId)?.name||item.productId}: {item.quantity||'—'} {inputUnit(item.productId)} de {selected.lines[i]?.location||'reserva'}</li>)}</ul></div>}
      {(!selected.outputProductId||selected.stockEffect==='measured_transformation')&&items.map((item,i)=>{
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
    </form>}
   </section>}
   {admin&&view==='preparations'&&<PreparationSetup key={membership.unitId} unitId={membership.unitId} products={products} requestedRecipe={setupRecipe} onDirtyChange={setSetupDirty} call={call} onSaved={async saved=>{const updated=await load(true);if(saved?.available&&updated){setSetupDirty(false);setPlannedRecipe(saved.id);setPlannedQuantity('');setView('today');notify('Preparação salva. Você já pode adicioná-la à produção de hoje.','success');}return updated;}}/>}

  </div>
  {view==='history'&&<section className="receiving-card"><TriamicciHistory title="Histórico de produção" records={runs} loading={loading}
   getTitle={r=>r.recipeName||'Produção'} getDate={r=>r.at} getQuantity={r=>r.portions+' '+(r.outputUnit||'un')}
   getDescription={r=>r.stockEffect==='portion_same_product'?`Porcionado: ${r.portionedWeight} ${r.stockUnit} · saldo total preservado`:(r.items||[]).map(i=>i.productName+' · '+i.quantity+' '+i.unit).join(' · ')}
   getPerson={r=>r.actorName||r.actorUid}
   renderDetails={r=><>{r.notes&&<div>Observação: {r.notes}</div>}<div>Registro: {r.id}</div></>}
   empty="Nenhuma produção registrada para o período. A lista planejada não movimenta estoque."/></section>}

 </section>;
}
