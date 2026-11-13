import React,{useEffect,useRef,useState} from 'react';
import {Camera,ImagePlus,ScanText,ClipboardCheck,Trash2,Plus,X,AlertTriangle,CheckCircle2} from 'lucide-react';
import {parseProductionNote,validImportRows,reviewPhotoLines} from './production-photo-parse.js';
import ProductionPhotoFrame from './ProductionPhotoFrame.jsx';
import {initialPhotoFrame,photoJpeg} from './production-photo-image.js';
import './ProductionPhotoImport.css';

export default function ProductionPhotoImport({recipes=[],onRecognize,onImport,onClose}){
 const inputRef=useRef(null),galleryRef=useRef(null),idRef=useRef(null),fileUrl=useRef(null),scanRef=useRef(null);
 const [image,setImage]=useState(null),[frame,setFrame]=useState(initialPhotoFrame),[preview,setPreview]=useState(''),[text,setText]=useState(''),[rows,setRows]=useState([]);
 const [stage,setStage]=useState('photo'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[allowDay,setAllowDay]=useState(false);
 const [showManual,setShowManual]=useState(false); const [saved,setSaved]=useState([]),[failed,setFailed]=useState(false),[uncertain,setUncertain]=useState(false);
 const fileInput=async e=>{
  const f=e.target.files?.[0];e.target.value='';if(!f)return;
  if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type)&&!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name)){setError('Escolha uma foto JPG, PNG ou HEIC.');return;}
  if(f.size>12*1024*1024){setError('Foto acima de 12 MB. Escolha uma imagem menor.');return;}
  if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);
  const url=URL.createObjectURL(f);
  fileUrl.current=url;setPreview(url);setImage(null);setFrame(initialPhotoFrame);setText('');setRows([]);setReviewed(false);setAllowDay(false);setStage('photo');setError('');setSaved([]);setShowManual(false);setUncertain(false);idRef.current=null;
  try{
   const decoded=new Image();
   decoded.src=url;
   await decoded.decode();
   if(fileUrl.current===url)setImage(decoded);
  }catch{
   if(fileUrl.current===url)setError('Não foi possível abrir esta foto. Tente uma imagem JPG ou PNG.');
  }
 };
 useEffect(()=>()=>{
  scanRef.current?.abort();
  if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);
  fileUrl.current=null;
 },[]);
 const scan=async()=>{
  if(!image||scanRef.current)return;
  const controller=new AbortController();
  scanRef.current=controller;
  setBusy(true);setError('');setReviewed(false);setAllowDay(false);
  try{
   const jpeg=await photoJpeg(image,frame);
   const result=await onRecognize(jpeg,controller.signal);
   if(controller.signal.aborted)return;
   const suggestions=reviewPhotoLines(result.lines,recipes);
   setText('');setRows(suggestions);setUncertain(!suggestions.length);
   setShowManual(false);setStage('review');
  }catch(error){
   if(controller.signal.aborted)return;
   setError(error.message||'Falha ao reconhecer a foto.');
  }finally{
   scanRef.current=null;
   if(!controller.signal.aborted)setBusy(false);
  }
 };
 const rebuild=()=>{setRows(parseProductionNote(text,recipes).slice(0,12));setUncertain(false);setReviewed(false);setAllowDay(false);setError('');};
 const change=(id,patch)=>{setRows(old=>old.map(row=>row.id===id?{...row,...patch}:row));setReviewed(false);};
 const selected=rows.filter(r=>r.selected);
 const hasDateNotes=selected.some(r=>r.dateNote);
 const duplicates=selected.some((r,i)=>r.recipeId&&selected.findIndex(t=>t.recipeId===r.recipeId)!==i);
 const valid=validImportRows(selected,recipes)&&!duplicates&&reviewed&&(!hasDateNotes||allowDay)&&!busy&&!saved.length;
 const importNow=async()=>{
  if(!valid)return;
  setBusy(true);setError('');setFailed(false);
  if(!idRef.current)idRef.current=crypto.randomUUID();
  try{
   const items=selected.map(r=>({recipeId:r.recipeId,plannedQuantity:r.quantity.trim()?Number(r.quantity):null}));
   const result=await onImport({requestId:idRef.current,items});
   setSaved(result?.taskIds||[]);setStage('done');
  }catch(e){setFailed(true);setError(e.message||'Falha ao adicionar. Você pode tentar novamente com segurança.');}
  finally{setBusy(false);}
 };
 return <div className="photo-import" role="region" aria-label="Importar planejamento por foto">
  <div className="photo-import-header"><div><small>PLANEJAMENTO INTELIGENTE</small><h3>Importar por foto</h3><p>Fotografe a anotação, revise o reconhecimento e crie as tarefas de hoje.</p></div><button type="button" aria-label="Fechar importação" disabled={busy} onClick={onClose}><X size={19}/></button></div>
  <div className="photo-import-steps"><span className={stage==='photo'?'active':''}>1 · Foto</span><span className={stage==='review'?'active':''}>2 · Revisar</span><span className={stage==='done'?'active':''}>3 · Concluir</span></div>
  {stage==='photo'&&<div className="photo-import-photo">
   <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={fileInput} aria-label="Tirar foto da lista" hidden/>
   <input ref={galleryRef} type="file" accept="image/*" onChange={fileInput} aria-label="Selecionar foto existente" hidden/>
   {image?<ProductionPhotoFrame image={image} frame={frame} onChange={setFrame} busy={busy}/>:<div className="photo-import-empty"><Camera size={30}/><strong>Fotografe a lista da cozinha</strong><span>JPG, PNG ou HEIC · até 12 MB</span></div>}
   <div className="photo-import-image-actions"><button type="button" className="photo-import-outline" disabled={busy} onClick={()=>inputRef.current?.click()}><Camera size={17}/> Tirar foto agora</button><button type="button" className="photo-import-outline" disabled={busy} onClick={()=>galleryRef.current?.click()}><ImagePlus size={17}/> Escolher da galeria</button></div>
   <button type="button" className="photo-import-primary" disabled={!image||busy} onClick={scan}><ScanText size={17}/>{busy?'Reconhecendo…':'Reconhecer escrita'}</button>
   {busy&&<progress aria-label="Reconhecimento em andamento"/>}
   <button type="button" className="photo-import-textlink" disabled={busy} onClick={()=>{setStage('review');setShowManual(true);setError('');}}>Digitar lista manualmente</button>
   <p className="photo-import-footnote">O recorte será enviado ao Gemini. Use fotos sem dados pessoais, sensíveis ou confidenciais.</p>
  </div>}
  {stage==='review'&&<div className="photo-import-review">
   {preview&&<details open={uncertain?true:undefined}><summary>Consultar foto original</summary><img className="photo-import-preview" src={preview} alt="Lista para conferência"/></details>}
   {uncertain&&<div className="photo-import-quality" role="status"><AlertTriangle size={19}/><div><strong>Nenhuma sugestão segura no catálogo</strong><p>Ajuste o recorte ou escolha as preparações que você consegue conferir na foto.</p></div></div>}
   {preview&&<button type="button" className="photo-import-outline" disabled={busy} onClick={()=>{setStage('photo');setError('');}}> <Camera size={17}/> Ajustar enquadramento ou trocar foto</button>}
   <div className="photo-import-quick"><strong>Adicionar do catálogo</strong><p>Selecione as preparações que você consegue confirmar na foto. Nada é incluído automaticamente.</p><select aria-label="Adicionar preparação do catálogo" disabled={busy||rows.length>=12} value="" onChange={e=>{const recipe=recipes.find(r=>String(r.id)===e.target.value);if(!recipe)return;setRows(old=>old.length>=12||old.some(r=>r.recipeId===recipe.id)?old:[...old,{id:'row-manual-'+crypto.randomUUID(),label:recipe.name,recipeId:recipe.id,quantity:'',selected:true,dateNote:''}]);setReviewed(false);}}><option value="">Selecionar preparação…</option>{recipes.filter(r=>!rows.some(row=>row.recipeId===r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
   {!showManual&&<button type="button" className="photo-import-textlink" disabled={busy} onClick={()=>setShowManual(true)}>Digitar lista manualmente</button>}
   {showManual&&<>
    <label className="photo-import-transcript">Texto da lista<textarea rows={4} maxLength={1600} value={text} onChange={e=>setText(e.target.value)} placeholder={'Batata purê\nBatata palha\n30 alcatra\n40 frango'}/></label>
    <button type="button" className="photo-import-outline" disabled={busy||!text.trim()} onClick={rebuild}><ScanText size={16}/> Interpretar texto revisado</button>
   </>}
   <div className="photo-import-rows-heading"><strong>Preparações encontradas</strong><small>{selected.length} selecionada(s)</small></div>
   {!rows.length&&<p className="photo-import-footnote">Nenhuma preparação selecionada. Escolha no catálogo ou interprete o texto revisado.</p>}
   <fieldset className="photo-import-edit" disabled={busy}>
   {rows.map(r=><div className="photo-import-item" key={r.id}>
    <div className="photo-import-item-title"><label><input type="checkbox" checked={r.selected} onChange={e=>change(r.id,{selected:e.target.checked})}/> Incluir</label><button type="button" aria-label={'Remover linha '+r.label} onClick={()=>{setRows(old=>old.filter(x=>x.id!==r.id));setReviewed(false)}}><Trash2 size={16}/></button></div>
    <label>Nome lido<input type="text" maxLength={100} value={r.label} onChange={e=>change(r.id,{label:e.target.value,recipeId:''})}/></label>
    {!r.recipeId&&r.label&&<small className="photo-import-date">Confira o nome e vincule a preparação no catálogo.</small>}
    <label>Preparação cadastrada<select aria-label={'Preparação do catálogo para '+r.label} value={r.recipeId} onChange={e=>change(r.id,{recipeId:e.target.value})}><option value="">Escolher no catálogo · obrigatório</option>{recipes.map(recipe=><option key={recipe.id} value={recipe.id}>{recipe.name} · {recipe.outputUnit||'un'}</option>)}</select></label>
    <label>Meta para hoje ({recipes.find(x=>x.id===r.recipeId)?.outputUnit||'un'})<input type="number" min="0.001" max="10000" step="0.001" value={r.quantity} placeholder="Opcional" onChange={e=>change(r.id,{quantity:e.target.value,quantityUnclear:false,quantityHint:''})}/></label>
    {r.quantityUnclear&&<small className="photo-import-date">{r.quantityHint?'Quantidade lida: '+r.quantityHint+'. Confira a unidade antes de preencher.':'Quantidade incerta. Confira na foto.'}</small>}
    {r.dateNote&&<small className="photo-import-date"><AlertTriangle size={14}/> Anotação de data/período: {r.dateNote}</small>}
   </div>)}
   <button type="button" className="photo-import-outline" disabled={rows.length>=12} onClick={()=>{setRows(old=>[...old,{id:'row-manual-'+crypto.randomUUID(),label:'',recipeId:'',quantity:'',selected:true,dateNote:''}]);setReviewed(false)}}><Plus size={16}/> Adicionar linha</button>
   </fieldset>
   {duplicates&&<p className="photo-import-warning">A mesma preparação foi selecionada duas vezes. Una as quantidades em uma linha antes de continuar.</p>}
   {hasDateNotes&&<label className="photo-import-consent"><input type="checkbox" checked={allowDay} disabled={busy} onChange={e=>setAllowDay(e.target.checked)}/> Entendi que as datas da folha não serão aplicadas: esta importação cria tarefas somente para hoje.</label>}
   {!!selected.length&&<label className="photo-import-consent"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/> Conferi cada nome, quantidade e unidade. Confirmo que todos os itens selecionados são para hoje.</label>}
   {!!selected.length&&<button type="button" className="photo-import-primary" disabled={!valid} onClick={importNow}><ClipboardCheck size={17}/>{busy?'Adicionando…':'Adicionar '+selected.length+' tarefa(s) de hoje'}</button>}
   {!!selected.length&&<p className="photo-import-footnote">Nada será lançado no estoque. Apenas tarefas de planejamento serão criadas após sua confirmação.</p>}
  </div>}
  {stage==='done'&&<div className="photo-import-done"><CheckCircle2 size={34}/><h4>{saved.length} tarefa(s) adicionada(s)</h4><p>As preparações foram enviadas à lista de produção de hoje. O estoque permanece inalterado.</p><button type="button" className="photo-import-primary" onClick={onClose}>Voltar à produção do dia</button></div>}
  {error&&<div className="photo-import-warning" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {failed&&<p className="photo-import-footnote">A tentativa pode ter sido processada. Ao tentar novamente, o mesmo identificador impedirá tarefas duplicadas.</p>}
 </div>;
}
