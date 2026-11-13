import React,{useEffect,useRef,useState} from 'react';
import {Camera,ImagePlus,ScanText,ClipboardCheck,Trash2,Plus,X,AlertTriangle,CheckCircle2} from 'lucide-react';
import {parseProductionNote,validImportRows,evaluatePhotoRecognition} from './production-photo-parse.js';
import './ProductionPhotoImport.css';

let ocrScriptPromise=null;
function loadOcr(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(!ocrScriptPromise)ocrScriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  script.async=true;script.crossOrigin='anonymous';
  script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('OCR não disponível.'));
  script.onerror=()=>reject(Error('Não foi possível carregar o reconhecimento de texto. Verifique a conexão.'));
  document.head.appendChild(script);
 }).catch(e=>{ocrScriptPromise=null;throw e});
 return ocrScriptPromise;
}

async function prepareOcrImage(file,mode='center',enhance=false){
 const objectUrl=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=objectUrl;await img.decode();
  const bounds=mode==='center'?{x:.18,y:.17,w:.64,h:.80}:{x:0,y:0,w:1,h:1};
  const sx=Math.round(img.naturalWidth*bounds.x),sy=Math.round(img.naturalHeight*bounds.y);
  const sw=Math.min(img.naturalWidth-sx,Math.round(img.naturalWidth*bounds.w));
  const sh=Math.min(img.naturalHeight-sy,Math.round(img.naturalHeight*bounds.h));
  const scale=Math.min(2,Math.max(1,1550/Math.max(sw,sh)));
  const canvas=document.createElement('canvas');
  canvas.width=Math.min(2800,Math.round(sw*scale));canvas.height=Math.min(2800,Math.round(sh*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Imagem indisponível neste aparelho.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  if(enhance){
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   const data=pixels.data;
   // Aumenta contraste de tinta azul/preta sobre papel amarelado sem binarizar letras finas.
   for(let i=0;i<data.length;i+=4){
    const gray=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
    const adjusted=Math.max(0,Math.min(255,(gray-128)*1.65+151));
    data[i]=data[i+1]=data[i+2]=adjusted;
   }
   ctx.putImageData(pixels,0,0);
  }
  return canvas.toDataURL('image/png');
 }finally{URL.revokeObjectURL(objectUrl)}
}

export default function ProductionPhotoImport({recipes=[],onImport,onClose}){
 const inputRef=useRef(null),galleryRef=useRef(null),idRef=useRef(null),fileUrl=useRef(null);
 const [file,setFile]=useState(null),[preview,setPreview]=useState(''),[text,setText]=useState(''),[rows,setRows]=useState([]);
 const [stage,setStage]=useState('photo'),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[allowDay,setAllowDay]=useState(false);
 const [showManual,setShowManual]=useState(false); const [saved,setSaved]=useState([]),[failed,setFailed]=useState(false),[uncertain,setUncertain]=useState(false),[scanArea,setScanArea]=useState('center');
 const fileInput=e=>{
  const f=e.target.files?.[0];if(!f)return;
  if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type)&&!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name)){setError('Escolha uma foto JPG, PNG ou HEIC.');return;}
  if(f.size>12*1024*1024){setError('Foto acima de 12 MB. Escolha uma imagem menor.');return;}
  if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);
  fileUrl.current=URL.createObjectURL(f);setPreview(fileUrl.current);setFile(f);setText('');setRows([]);setReviewed(false);setStage('photo');setError('');setProgress(0);setSaved([]);setShowManual(false);setUncertain(false);setScanArea('center');idRef.current=null;
 };
 useEffect(()=>()=>{if(fileUrl.current)URL.revokeObjectURL(fileUrl.current)},[]);
 const scan=async()=>{
  if(!file)return;
  setBusy(true);setError('');setProgress(0);
  let worker;
  try{
   const engine=await loadOcr();
   worker=await engine.createWorker('por',1,{logger:m=>{if(m?.status==='recognizing text')setProgress(Math.round((m.progress||0)*100));}});
   // Primeiro tenta a foto recortada; em caso de baixa confiança, repete
   // com contraste ampliado e, por último, com a foto inteira.
   // Nunca converte OCR em tarefa sem revisão explícita do usuário.
   const attempts=[
    {mode:scanArea,enhance:false},
    {mode:scanArea,enhance:true},
    ...(scanArea==='center'?[{mode:'full',enhance:true}]:[])
   ];
   let best=null;
   for(const attempt of attempts){
    const scanImage=await prepareOcrImage(file,attempt.mode,attempt.enhance).catch(()=>file);
    const result=await worker.recognize(scanImage);
    const value=(result.data?.text||'').trim();
    const assessment=evaluatePhotoRecognition(value,recipes,result.data?.confidence);
    const rank=assessment.recognized*100+(assessment.reliable?50:0)+(assessment.confidence||0)/10;
    if(!best||rank>best.rank)best={value,assessment,rank};
    if(assessment.reliable&&assessment.recognized>=3)break;
   }
   const assessment=best?.assessment||{reliable:false,rows:[]};
   setText(assessment.reliable?best.value.slice(0,1600):'');
   setRows(assessment.rows);
   setUncertain(!assessment.reliable);
   setShowManual(false);setStage('review');
   if(!assessment.reliable)setError('');
  }catch(e){setRows([]);setUncertain(true);setStage('review');setError('');}
  finally{try{await worker?.terminate()}catch{}setBusy(false);}
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
   {preview?<img className="photo-import-preview" src={preview} alt="Foto selecionada da lista manuscrita"/>:<div className="photo-import-empty"><Camera size={30}/><strong>Fotografe a lista da cozinha</strong><span>JPG, PNG ou HEIC · até 12 MB</span></div>}
   <div className="photo-import-image-actions"><button type="button" className="photo-import-outline" disabled={busy} onClick={()=>inputRef.current?.click()}><Camera size={17}/> Tirar foto agora</button><button type="button" className="photo-import-outline" disabled={busy} onClick={()=>galleryRef.current?.click()}><ImagePlus size={17}/> Escolher da galeria</button></div>
   <label className="photo-import-scan-area">Região para leitura<select aria-label="Região para leitura" value={scanArea} onChange={e=>setScanArea(e.target.value)}><option value="center">Área central · folha no centro da foto</option><option value="full">Foto inteira · folha ocupando toda a imagem</option></select><small>O recorte é feito no seu aparelho. Para resultados melhores, fotografe a folha de frente e mais perto.</small></label>
   <button type="button" className="photo-import-primary" disabled={!file||busy} onClick={scan}><ScanText size={17}/>{busy?'Reconhecendo '+progress+'%':'Reconhecer escrita'}</button>
   {busy&&<progress aria-label="Progresso do reconhecimento" max="100" value={progress}/>}
   <button type="button" className="photo-import-textlink" disabled={busy} onClick={()=>{setStage('review');setShowManual(true);setError('');}}>Digitar lista manualmente</button>
   <p className="photo-import-footnote">Reconhecimento gratuito no celular, com até três tentativas de leitura e sem cobrança por imagem. Requer internet para carregar o motor de OCR; manuscritos podem não ser reconhecidos corretamente.</p>
  </div>}
  {stage==='review'&&<div className="photo-import-review">
   {preview&&<details open={uncertain?true:undefined}><summary>Consultar foto original</summary><img className="photo-import-preview" src={preview} alt="Lista para conferência"/></details>}
   {uncertain&&<div className="photo-import-quality" role="status"><AlertTriangle size={19}/><div><strong>Não conseguimos ler a lista com segurança</strong><p>Nenhuma tarefa foi sugerida. Recorte a anotação mais de perto ou confirme os itens manualmente.</p></div></div>}
   {uncertain&&<button type="button" className="photo-import-outline" onClick={()=>{setStage('photo');setRows([]);setError('');}}> <Camera size={17}/> Recortar melhor ou escolher outra foto</button>}
   {(uncertain||showManual)&&<div className="photo-import-quick"><strong>Adicionar do catálogo</strong><p>Selecione as preparações que você consegue confirmar na foto. Nada é incluído automaticamente.</p><select aria-label="Adicionar preparação do catálogo" value="" onChange={e=>{const recipe=recipes.find(r=>String(r.id)===e.target.value);if(!recipe)return;setRows(old=>old.length>=12||old.some(r=>r.recipeId===recipe.id)?old:[...old,{id:'row-manual-'+crypto.randomUUID(),label:recipe.name,recipeId:recipe.id,quantity:'',selected:true,dateNote:''}]);setReviewed(false);}}><option value="">Selecionar preparação…</option>{recipes.filter(r=>!rows.some(row=>row.recipeId===r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
   <label className="photo-import-transcript">{uncertain?'Transcreva apenas os itens legíveis':'Texto identificado (pode corrigir)'}<textarea aria-label="Texto da lista" rows={4} maxLength={1600} value={text} onChange={e=>setText(e.target.value)} placeholder={'Batata purê\nBatata palha\n30 alcatra\n40 frango'}/></label>
   {uncertain&&<p className="photo-import-footnote">A leitura manuscrita automática é limitada. Você pode selecionar os itens acima ou transcrever as linhas abaixo.</p>}
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
