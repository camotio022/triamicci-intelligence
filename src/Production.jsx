import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
const idFor=s=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
async function call(path,action,payload={}){
 const user=auth.currentUser;if(!user)throw Error('Faça login.');
 const token=await user.getIdToken();
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...payload})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Erro na operação.');return data;
}
export default function Production({membership}){
 const [recipes,setRecipes]=useState([]),[runs,setRuns]=useState([]),[products,setProducts]=useState([]);
 const [recipeId,setRecipeId]=useState(''),[name,setName]=useState(''),[yieldQuantity,setYield]=useState('1');
 const [lines,setLines]=useState([{productId:'',quantity:'',substitutes:[]}]);
 const [portions,setPortions]=useState('1'),[items,setItems]=useState([]),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[status,setStatus]=useState('');
 const [requestId,setRequestId]=useState(null);
 const admin=['admin','manager'].includes(membership.role);
 const load=useCallback(async()=>{
  setLoading(true);try{
   const [p,r]=await Promise.all([call('/api/products/manage','list'),call('/api/production/manage','list')]);
   setProducts(p.products||[]);setRecipes(r.recipes||[]);setRuns(r.runs||[]);
  }catch(e){setStatus(e.message)}finally{setLoading(false)}
 },[]);
 useEffect(()=>{load()},[load]);
 const selected=recipes.find(r=>r.id===recipeId);
 const choose=id=>{
  setRecipeId(id);setRequestId(null);
  const r=recipes.find(x=>x.id===id);
  setPortions(String(r?.yieldQuantity||1));
  setItems((r?.lines||[]).map(l=>({productId:l.productId,quantity:String(l.quantity)})));
 };
 const selectProduct=(i,value)=>{setItems(a=>a.map((x,j)=>j===i?{...x,productId:value}:x));setRequestId(null)};
 const saveRecipe=async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setStatus('');
  try{
   await call('/api/production/manage','saveRecipe',{
    id:idFor(name),name,yieldQuantity:Number(yieldQuantity),
    lines:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity),substitutes:l.substitutes}))});
   setStatus('Ficha técnica salva no Firebase.');await load();
  }catch(e){setStatus(e.message)}finally{setBusy(false)}
 };
 const finish=async e=>{
  e.preventDefault();if(busy)return;
  if(!window.confirm('Confirmar a produção e descontar agora os ingredientes realmente utilizados do giro?'))return;
  setBusy(true);setStatus('');
  const id=requestId||crypto.randomUUID();setRequestId(id);
  try{
   const data=await call('/api/production/manage','finish',{recipeId,requestId:id,portions:Number(portions),
    items:items.map(i=>({productId:i.productId,quantity:Number(i.quantity)})),notes});
   setStatus(data.message);setRequestId(null);await load();
  }catch(e){setStatus(e.message)}finally{setBusy(false)}
 };
 const option=(id)=>products.find(p=>p.id===id);
 return <section className="inventory-page production-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId.toUpperCase()}</p>
  <h1>Produção da cozinha</h1><p>Registre as quantidades realmente utilizadas. O estoque de giro só é debitado depois da confirmação final.</p>
  {status&&<p role="status" className="receiving-notice">{status}</p>}
  <div className="production-layout">
   <section className="receiving-card">
    <h2>Finalizar produção</h2>
    <form className="stock-action-form" onSubmit={finish}>
     <label>Preparação<select required value={recipeId} onChange={e=>choose(e.target.value)}>
      <option value="">Selecione a preparação</option>
      {recipes.map(r=><option key={r.id} value={r.id}>{r.name} · versão {r.version}</option>)}
     </select></label>
     {selected&&<>
      <label>Porções produzidas<input type="number" required min="1" step="1" value={portions} onChange={e=>{setPortions(e.target.value);setRequestId(null)}}/></label>
      <p>Revise as quantidades reais. Os valores iniciais vêm da ficha técnica e podem ser corrigidos.</p>
      {items.map((item,i)=>{
       const original=selected.lines[i];const allowed=[original.productId,...(original.substitutes||[])];
       return <div className="stock-lot-row" key={i}>
        <label>Ingrediente {i+1}<select value={item.productId} onChange={e=>selectProduct(i,e.target.value)}>
         {allowed.map(id=><option key={id} value={id}>{option(id)?.name||id}</option>)}
        </select></label>
        <label>Quantidade utilizada<input type="number" required min={option(item.productId)?.physicalUnit==='un'?'1':'.001'} step={option(item.productId)?.operationalUnitOverride==='un'||option(item.productId)?.unit==='un'?'1':'.001'} value={item.quantity}
          onChange={e=>{setItems(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x));setRequestId(null)}}/></label>
       </div>})}
      <label>Observações<input maxLength={240} value={notes} onChange={e=>{setNotes(e.target.value);setRequestId(null)}}/></label>
      <button type="submit" className="stock-action-save" disabled={busy||!items.length}>{busy?'Registrando...':'Finalizar e descontar do giro'}</button>
     </>}
    </form>
   </section>
   {admin&&<section className="receiving-card">
    <h2>Nova ficha técnica</h2>
    <p>Defina uma preparação validada, com quantidades por rendimento. Não invente pesos nem conversões entre kg e peças.</p>
    <form className="stock-action-form" onSubmit={saveRecipe}>
     <label>Nome da preparação<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Rendimento padrão (porções)<input type="number" min="1" step="1" value={yieldQuantity} onChange={e=>setYield(e.target.value)}/></label>
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
   </section>}
  </div>
  <section className="receiving-card"><div className="inventory-list-header"><h2>Produções registradas</h2><button type="button" onClick={load}>Atualizar</button></div>
   {loading?<p>Consultando Firebase...</p>:runs.length===0?<p>Nenhuma produção finalizada.</p>:
    <div className="production-history">{runs.map(r=><article key={r.id}><strong>{r.recipeName}</strong>
     <span>{r.portions} porções · {r.at?new Date(r.at).toLocaleString('pt-BR'):'—'}</span>
     <small>{r.items?.map(i=>i.productName+' '+i.quantity+' '+i.unit).join(' · ')}</small>
     <small>Responsável: {r.actorUid}</small></article>)}</div>}
  </section>
 </section>;
}
