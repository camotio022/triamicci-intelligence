import React,{useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';

export default function PhotoCropDialog({file,busy,onCancel,onSave}){
 const canvasRef=useRef(null),bitmapRef=useRef(null);
 const [zoom,setZoom]=useState(1),[horizontal,setHorizontal]=useState(0),[vertical,setVertical]=useState(0);
 const [error,setError]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;setReady(false);setError('');
  createImageBitmap(file).then(bitmap=>{if(!active){bitmap.close();return;}bitmapRef.current=bitmap;setReady(true)})
   .catch(()=>{if(active)setError('Não foi possível abrir essa imagem. Tente JPG, PNG ou WebP.')});
  return()=>{active=false;bitmapRef.current?.close();bitmapRef.current=null};
 },[file]);
 useEffect(()=>{if(!ready||!bitmapRef.current||!canvasRef.current)return;
  const bitmap=bitmapRef.current,canvas=canvasRef.current,ctx=canvas.getContext('2d');if(!ctx)return;
  const side=Math.min(bitmap.width,bitmap.height)/zoom;
  const maxX=(bitmap.width-side)/2,maxY=(bitmap.height-side)/2;
  const sx=Math.max(0,Math.min(bitmap.width-side,maxX+horizontal/100*maxX));
  const sy=Math.max(0,Math.min(bitmap.height-side,maxY+vertical/100*maxY));
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,sx,sy,side,side,0,0,canvas.width,canvas.height);
 },[ready,zoom,horizontal,vertical]);
 const save=async()=>{
  if(!ready||busy||!canvasRef.current)return;
  setError('');
  try{
   const canvas=canvasRef.current;
   let encoded='';
   for(const quality of [0.82,0.72,0.6,0.48]){
    encoded=canvas.toDataURL('image/webp',quality);
    if(encoded.length<=180000)break;
   }
   if(encoded.length>180000)throw Error('Não foi possível otimizar a imagem. Escolha outra foto.');
   await onSave(encoded);
  }catch(e){setError(e.message||'Não foi possível preparar a foto.')}
 };
 return <div className="ti-photo-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onCancel()}}>
  <section className="ti-photo-dialog" role="dialog" aria-modal="true" aria-labelledby="ti-photo-title">
   <div className="ti-photo-title"><div><h2 id="ti-photo-title">Ajustar foto profissional</h2><p>Enquadre seu rosto antes de salvar. A imagem será comprimida automaticamente.</p></div><button type="button" aria-label="Fechar editor de foto" disabled={busy} onClick={onCancel}><X size={20}/></button></div>
   <div className="ti-photo-preview"><canvas ref={canvasRef} width="320" height="320" role="img" aria-label="Prévia do recorte quadrado que será mostrado como foto circular"/></div>
   <div className="ti-photo-controls">
    <label>Zoom <input aria-label="Aproximar foto" type="range" min="1" max="3" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
    <label>Posição horizontal <input aria-label="Mover foto horizontalmente" type="range" min="-100" max="100" value={horizontal} onChange={e=>setHorizontal(Number(e.target.value))}/></label>
    <label>Posição vertical <input aria-label="Mover foto verticalmente" type="range" min="-100" max="100" value={vertical} onChange={e=>setVertical(Number(e.target.value))}/></label>
   </div>
   {error&&<p className="team-error" role="alert">{error}</p>}
   <div className="ti-photo-actions"><button type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button type="button" onClick={save} disabled={!ready||busy}>{busy?'Salvando...':'Salvar foto'}</button></div>
  </section>
 </div>;
}
