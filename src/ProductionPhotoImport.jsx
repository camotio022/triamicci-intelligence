import React,{useEffect,useRef,useState} from 'react';
import {Camera,ImagePlus,ScanText,ClipboardCheck,Trash2,Plus,X,AlertTriangle,CheckCircle2} from 'lucide-react';
import {parseProductionNote,validImportRows,evaluatePhotoRecognition} from './production-photo-parse.js';
import './ProductionPhotoImport.css';

// Client-side cropping is for framing only. Handwriting recognition runs on the server.
async function prepareVisionImage(file,{zoom=1,rotation=0,offsetX=0,offsetY=0}={},maxDimension=1500){
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{
   img.onload=resolve;img.onerror=()=>reject(Error('Não foi possível abrir esta foto. Tente JPG ou PNG.'));
   img.src=url;
  });
  const width=img.naturalWidth,height=img.naturalHeight;
  if(!width||!height)throw Error('Foto sem dimensões válidas.');
  const sw=width/zoom,sh=height/zoom;
  const sx=Math.max(0,Math.min(width-sw,(width-sw)/2+(offsetX/100)*(width-sw)/2));
  const sy=Math.max(0,Math.min(height-sh,(height-sh)/2+(offsetY/100)*(height-sh)/2));
  const quarter=rotation%180!==0;
  const w=quarter?sh:sw,h=quarter?sw:sh;
  const scale=Math.min(1,maxDimension/Math.max(w,h));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Não foi possível preparar a imagem.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.translate(canvas.width/2,canvas.height/2);
  ctx.rotate(rotation*Math.PI/180);
  ctx.drawImage(img,sx,sy,sw,sh,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);
  const encoded=canvas.toDataURL('image/jpeg',0.78);
  if(encoded.length>2400000)throw Error('Imagem muito grande. Aproxime a anotação e tente novamente.');
  return encoded;
 }finally{URL.revokeObjectURL(url)}
}

export default function ProductionPhotoImport({recipes=[],onImport,onRecognize,onClose}){
 const inputRef=useRef(null),galleryRef=useRef(null),idRef=useRef(null),fileUrl=useRef(null);
 const [file,setFile]=useState(null),[preview,setPreview]=useState(''),[text,setText]=useState(''),[rows,setRows]=useState([]);
 const [stage,setStage]=useState('photo'),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[allowDay,setAllowDay]=useState(false);
 const [showManual,setShowManual]=useState(false); const [saved,setSaved]=useState([]),[failed,setFailed]=useState(false),[uncertain,setUncertain]=useState(false);
 const [zoom,setZoom]=useState(1),[rotation,setRotation]=useState(0),[offsetX,setOffsetX]=useState(0),[offsetY,setOffsetY]=useState(0);
 const [adjustedPreview,setAdjustedPreview]=useState(''),[consent,setConsent]=useState(false);
 const fileInput=e=>{
  const f=e.target.files?.[0];if(!f)return;
  if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type)&&!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name)){setError('Escolha uma foto JPG, PNG ou HEIC.');return;}
  if(f.size>12*1024*1024){setError('Foto acima de 12 MB. Escolha uma imagem menor.');return;}
  if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);
  fileUrl.current=URL.createObjectURL(f);setPreview(fileUrl.current);setFile(f);setText('');setRows([]);setReviewed(false);setStage('photo');setError('');setProgress(0);setSaved([]);setShowManual(false);setUncertain(false);setZoom(1);setRotation(0);setOffsetX(0);setOffsetY(0);setConsent(false);idRef.current=null;
 };
 useEffect(()=>()=>{if(fileUrl.current)URL.revokeObjectURL(fileUrl.current)},[]);
 useEffect(()=>{
  if(!file){setAdjustedPreview('');return;}
  let cancelled=false;
  const timer=setTimeout(()=>{
   prepareVisionImage(file,{zoom,rotation,offsetX,offsetY},600)
    .then(image=>{if(!cancelled)setAdjustedPreview(image)})
    .catch(()=>{if(!cancelled)setAdjustedPreview('')});
  },100);
  return()=>{cancelled=true;clearTimeout(timer)};
 },[file,zoom,rotation,offsetX,offsetY]);
 const scan=async()=>{
  if(!file||!consent||busy)return;
  setBusy(true);setError('');setProgress(10);setReviewed(false);
  try{
   const image=await prepareVisionImage(file,{zoom,rotation,offsetX,offsetY});
   setProgress(35);
   const result=await onRecognize({image,consent:true});
   setProgress(90);
   const value=String(result?.text||'').trim().slice(0,1600);
   const assessment=evaluatePhotoRecognition(value,recipes,result?.confidence);
   setText(value);setRows(assessment.rows);setUncertain(!assessment.reliable);
   setShowManual(true);setStage('review');
  }catch(e){
   setRows([]);setUncertain(true);setShowManual(true);setStage('review');
   setError(e.message||'Falha ao reconhecer a foto. Tente novamente ou escolha itens manualmente.');
  }finally{setBusy(false);setProgress(100);}
 };

 const rebuild=()=>{setRows(parseProductionNote(text,recipes).slice(0,12));setUncertain(false);setReviewed(false);setError('');};
 const change=(id,patch)=>{setRows(old=>old.map(row=>row.id===id?{...row,...patch}:row));setReviewed(false);};
 const selected=rows.filter(r=>r.selected);
 const hasDateNotes=selected.some(r=>r.dateNote);
 const duplicates=selected.some((r,i)=>selected.findIndex(t=>t.recipeId&&t.recipeId===r.recipeId)!==i);
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
  <div className="photo-import-header"><div><small>PLANEJAMENTO INTELIGENTE</small><h3>Importar por foto</h3><p>Fotografe a anotação, revise o reconhecimento e crie as tarefas de hoje.</p></div><button type="button" aria-label="Fechar importação" onClick={onClose}><X size={19}/></button></div>
  <div className="photo-import-steps"><span className={stage==='photo'?'active':''}>1 · Foto</span><span className={stage==='review'?'active':''}>2 · Revisar</span><span className={stage==='done'?'active':''}>3 · Concluir</span></div>
  {stage==='photo'&&<div className="photo-import-photo">
   <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={fileInput} aria-label="Tirar foto da lista" hidden/>
   <input ref={galleryRef} type="file" accept="image/*" onChange={fileInput} aria-label="Selecionar foto existente" hidden/>
   {preview?<img className="photo-import-preview" src={adjustedPreview||preview} alt="Prévia do recorte e rotação para reconhecimento"/>:<div className="photo-import-empty"><Camera size={30}/><strong>Fotografe a lista da cozinha</strong><span>JPG, PNG ou HEIC · até 12 MB</span></div>}
   <div className="photo-import-image-actions"><button type="button" className="photo-import-outline" disabled={busy} onClick={()=>inputRef.current?.click()}><Camera size={17}/> Tirar foto agora</button><button type="button" className="photo-import-outline" disabled={busy} onClick={()=>galleryRef.current?.click()}><ImagePlus size={17}/> Escolher da galeria</button></div>
   <div className="photo-import-crop-controls" aria-label="Ajustar enquadramento">
    <div className="photo-import-crop-heading"><strong>Enquadrar anotação</strong><button type="button" className="photo-import-outline" onClick={()=>setRotation(x=>(x+90)%360)}>Girar 90°</button></div>
    <label>Ampliar recorte <input aria-label="Ampliar recorte" type="range" min="1" max="3" step=".1" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
    <label>Posição horizontal <input aria-label="Posição horizontal do recorte" type="range" min="-100" max="100" value={offsetX} onChange={e=>setOffsetX(Number(e.target.value))}/></label>
    <label>Posição vertical <input aria-label="Posição vertical do recorte" type="range" min="-100" max="100" value={offsetY} onChange={e=>setOffsetY(Number(e.target.value))}/></label>
    <small>A prévia mostra o recorte que será enviado. Mantenha apenas a anotação dentro da imagem.</small>
   </div>
   <label className="photo-import-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Autorizo enviar esta foto ao Google Cloud Vision para reconhecimento. A foto não será salva pelo Triamicci; revise os resultados antes de criar tarefas.</label>
   <button type="button" className="photo-import-primary" disabled={!file||busy||!consent} onClick={scan}><ScanText size={17}/>{busy?'Reconhecendo…':'Reconhecer escrita'}</button>
   {busy&&<progress aria-label="Progresso do reconhecimento" max="100" value={progress}/>}
   <button type="button" className="photo-import-textlink" disabled={busy} onClick={()=>{setStage('review');setShowManual(true);setError('');}}>Digitar lista manualmente</button>
   <p className="photo-import-footnote">Reconhecimento de manuscrito online. Pode haver custos de serviço para a operação; nenhuma tarefa é criada sem sua confirmação.</p>
  </div>}
  {stage==='review'&&<div className="photo-import-review">
   {preview&&<details open={uncertain?true:undefined}><summary>Consultar foto original</summary><img className="photo-import-preview" src={preview} alt="Lista para conferência"/></details>}
   {uncertain&&<div className="photo-import-quality" role="status"><AlertTriangle size={19}/><div><strong>Não encontramos preparações verificáveis</strong><p>A leitura não produziu correspondências seguras no catálogo. Confira o texto abaixo, ajuste a foto ou selecione preparações manualmente.</p></div></div>}
   {uncertain&&<button type="button" className="photo-import-outline" onClick={()=>{setStage('photo');setRows([]);setError('');}}> <Camera size={17}/> Ajustar recorte ou escolher outra foto</button>}
   {(uncertain||showManual)&&<div className="photo-import-quick"><strong>Adicionar do catálogo</strong><p>Selecione as preparações que você consegue confirmar na foto. Nada é incluído automaticamente.</p><select aria-label="Adicionar preparação do catálogo" value="" onChange={e=>{const recipe=recipes.find(r=>String(r.id)===e.target.value);if(!recipe)return;setRows(old=>old.length>=12||old.some(r=>r.recipeId===recipe.id)?old:[...old,{id:'row-manual-'+crypto.randomUUID(),label:recipe.name,recipeId:recipe.id,quantity:'',selected:true,dateNote:''}]);setReviewed(false);}}><option value="">Selecionar preparação…</option>{recipes.filter(r=>!rows.some(row=>row.recipeId===r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
   <label className="photo-import-transcript">{uncertain?'Transcreva apenas os itens legíveis':'Texto identificado (pode corrigir)'}<textarea aria-label="Texto da lista" rows={4} maxLength={1600} value={text} onChange={e=>setText(e.target.value)} placeholder={'Batata purê\nBatata palha\n30 alcatra\n40 frango'}/></label>
   {uncertain&&<p className="photo-import-footnote">Confira os itens da foto. Linhas incertas não são selecionadas automaticamente.</p>}
   <button type="button" className="photo-import-outline" disabled={busy||!text.trim()} onClick={rebuild}><ScanText size={16}/> Interpretar texto revisado</button>
   <div className="photo-import-rows-heading"><strong>Preparações encontradas</strong><small>{selected.length} selecionada(s)</small></div>
   {!rows.length&&<p className="photo-import-footnote">Nenhuma preparação selecionada. Escolha no catálogo ou interprete o texto revisado.</p>}
   {rows.map(r=><div className="photo-import-item" key={r.id}>
    <div className="photo-import-item-title"><label><input type="checkbox" checked={r.selected} onChange={e=>change(r.id,{selected:e.target.checked})}/> Incluir</label><button type="button" aria-label={'Remover linha '+r.label} onClick={()=>{setRows(old=>old.filter(x=>x.id!==r.id));setReviewed(false)}}><Trash2 size={16}/></button></div>
    <label>Nome lido<input type="text" maxLength={100} value={r.label} onChange={e=>change(r.id,{label:e.target.value,recipeId:''})}/></label>
    <label>Preparação cadastrada<select aria-label={'Preparação do catálogo para '+r.label} value={r.recipeId} onChange={e=>change(r.id,{recipeId:e.target.value})}><option value="">Escolher no catálogo · obrigatório</option>{recipes.map(recipe=><option key={recipe.id} value={recipe.id}>{recipe.name} · {recipe.outputUnit||'un'}</option>)}</select></label>
    <label>Meta para hoje ({recipes.find(x=>x.id===r.recipeId)?.outputUnit||'un'})<input type="number" min="0.001" max="10000" step="0.001" value={r.quantity} placeholder="Opcional" onChange={e=>change(r.id,{quantity:e.target.value})}/></label>
    {r.dateNote&&<small className="photo-import-date"><AlertTriangle size={14}/> Anotação de data/período: {r.dateNote}</small>}
   </div>)}
   <button type="button" className="photo-import-outline" disabled={rows.length>=12} onClick={()=>{setRows(old=>[...old,{id:'row-manual-'+crypto.randomUUID(),label:'',recipeId:'',quantity:'',selected:true,dateNote:''}]);setReviewed(false)}}><Plus size={16}/> Adicionar linha</button>
   {rows.length>12&&<p className="photo-import-warning">Selecione até 12 itens por importação.</p>}
   {duplicates&&<p className="photo-import-warning">A mesma preparação foi selecionada duas vezes. Una as quantidades em uma linha antes de continuar.</p>}
   {hasDateNotes&&<label className="photo-import-consent"><input type="checkbox" checked={allowDay} onChange={e=>setAllowDay(e.target.checked)}/> Entendi que as datas da folha não serão aplicadas: esta importação cria tarefas somente para hoje.</label>}
   {!!selected.length&&<label className="photo-import-consent"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> Conferi cada nome, quantidade e unidade. Confirmo que todos os itens selecionados são para hoje.</label>}
   {!!selected.length&&<button type="button" className="photo-import-primary" disabled={!valid} onClick={importNow}><ClipboardCheck size={17}/>{busy?'Adicionando…':'Adicionar '+selected.length+' tarefa(s) de hoje'}</button>}
   {!!selected.length&&<p className="photo-import-footnote">Nada será lançado no estoque. Apenas tarefas de planejamento serão criadas após sua confirmação.</p>}
  </div>}
  {stage==='done'&&<div className="photo-import-done"><CheckCircle2 size={34}/><h4>{saved.length} tarefa(s) adicionada(s)</h4><p>As preparações foram enviadas à lista de produção de hoje. O estoque permanece inalterado.</p><button type="button" className="photo-import-primary" onClick={onClose}>Voltar à produção do dia</button></div>}
  {error&&<div className="photo-import-warning" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {failed&&<p className="photo-import-footnote">A tentativa pode ter sido processada. Ao tentar novamente, o mesmo identificador impedirá tarefas duplicadas.</p>}
 </div>;
}
