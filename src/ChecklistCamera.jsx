import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,CheckCircle2,RotateCcw,X,Check,Image as ImageIcon} from 'lucide-react';
import ChecklistEvidence from './ChecklistEvidence.jsx';
export default function ChecklistCamera({runId,itemId,call,onUploaded,disabled}){
 const video=useRef(null),stream=useRef(null),alive=useRef(true),session=useRef(null),attempt=useRef(0),trigger=useRef(null),modalClose=useRef(null);
 const [phase,setPhase]=useState('idle'),[preview,setPreview]=useState(''),[uploaded,setUploaded]=useState(''),[error,setError]=useState('');
 const stop=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;attempt.current+=1;stop();};},[]);
 useEffect(()=>{if(!['starting','camera','review','uploading'].includes(phase))return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const esc=e=>{if(e.key==='Escape'&&phase!=='uploading')close();};document.addEventListener('keydown',esc);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',esc);};},[phase]);
 useEffect(()=>{if(phase!=='starting')return;const frame=requestAnimationFrame(()=>modalClose.current?.focus());return()=>cancelAnimationFrame(frame);},[phase]);
 const close=()=>{attempt.current+=1;stop();setPhase('idle');requestAnimationFrame(()=>trigger.current?.focus());};
 const start=async()=>{
  if(disabled)return;
  const currentAttempt=++attempt.current;
  setError('');setPhase('starting');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Câmera indisponível. Abra o app por HTTPS e permita o acesso.');
   const captureSession=await call('captureStart',{runId,itemId,requestId:crypto.randomUUID()});
   if(!alive.current||attempt.current!==currentAttempt)return;
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}},audio:false});
   if(!alive.current||attempt.current!==currentAttempt){media.getTracks().forEach(t=>t.stop());return;}
   session.current=captureSession;stream.current=media;setPreview('');setPhase('camera');
  }catch(e){if(alive.current&&attempt.current===currentAttempt){setError(e.name==='NotAllowedError'?'Permita o acesso à câmera para continuar.':e.message);close();}}
 };
 useEffect(()=>{if(phase==='camera'&&video.current){video.current.srcObject=stream.current;video.current.play().catch(()=>{setError('Não foi possível iniciar a câmera.');close();});}},[phase]);
 const capture=()=>{
  if(!video.current?.videoWidth)return;
  const canvas=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(video.current.videoWidth,video.current.videoHeight));
  canvas.width=Math.round(video.current.videoWidth*ratio);canvas.height=Math.round(video.current.videoHeight*ratio);
  canvas.getContext('2d').drawImage(video.current,0,0,canvas.width,canvas.height);
  let quality=.88,data=canvas.toDataURL('image/jpeg',quality);
  while(data.length>430000&&quality>.35){quality-=.08;data=canvas.toDataURL('image/jpeg',quality);}
  if(data.length>819200){setError('Foto muito grande. Tente um enquadramento mais simples.');return;}
  stop();setPreview(data);setPhase('review');
 };
 const upload=async()=>{
  setError('');setPhase('uploading');
  const currentAttempt=attempt.current;
  try{const result=await call('photoUpload',{photoId:session.current.photoId,base64:preview.split(',')[1]});if(alive.current&&attempt.current===currentAttempt){onUploaded(result.photoId);setUploaded(result.photoId);setPhase('ready');requestAnimationFrame(()=>trigger.current?.focus());}}
  catch(e){if(alive.current&&attempt.current===currentAttempt){setError(e.message);setPhase('review');}}
 };
 const modal=['starting','camera','review','uploading'].includes(phase);
 return <div className="ti-check-camera">
  {uploaded&&preview?<div className="ti-check-camera-ready"><ChecklistEvidence id={uploaded} call={call} preview={preview} label="Evidência anexada"/><p className="ti-check-success"><CheckCircle2 size={17}/> Foto enviada e vinculada a este item.</p></div>:<button ref={trigger} type="button" className="ti-check-camera-open" disabled={disabled||modal} onClick={start}><Camera size={20}/> {modal?'Câmera aberta…':'Adicionar foto'}</button>}
  {uploaded&&<button ref={trigger} type="button" className="secondary ti-check-retake-inline" disabled={disabled} onClick={start}><RotateCcw size={17}/> Tirar novamente</button>}
  {error&&phase==='idle'&&<p role="alert" className="ti-check-alert">{error}</p>}
  {modal&&createPortal(<div className="ti-check-camera-backdrop" role="presentation">
   <section className="ti-check-camera-modal" role="dialog" aria-modal="true" aria-label="Capturar evidência">
    <header className="ti-check-camera-modal-head"><h3><Camera size={21}/> Capturar evidência</h3><button type="button" ref={modalClose} className="secondary" aria-label="Fechar câmera" disabled={phase==='uploading'} onClick={close}><X size={22}/></button></header>
    <div className="ti-check-camera-stage">
     {phase==='starting'&&<div className="ti-check-camera-wait" role="status"><Camera size={34}/><p>Abrindo câmera…</p></div>}
     {phase==='camera'&&<><video ref={video} autoPlay playsInline muted aria-label="Visualização da câmera ao vivo"/><div className="ti-check-camera-corners" aria-hidden="true"/></>}
     {(phase==='review'||phase==='uploading')&&<img src={preview} alt="Prévia da foto capturada"/>}
    </div>
    {error&&<p role="alert" className="ti-check-alert">{error}</p>}
    {phase==='camera'&&<div className="ti-check-shutter-bar"><span className="ti-check-shutter-hint">Enquadre o item solicitado</span><button type="button" className="ti-check-shutter" aria-label="Tirar foto" onClick={capture}><Camera size={28}/></button><span className="ti-check-shutter-hint">Sem galeria</span></div>}
    {phase==='review'&&<div className="ti-check-camera-actions"><button type="button" onClick={upload}><Check size={19}/> Usar foto</button><button type="button" className="secondary" onClick={start}><RotateCcw size={18}/> Tirar novamente</button></div>}
    {phase==='uploading'&&<p role="status" className="ti-check-camera-uploading"><ImageIcon size={20}/> Enviando foto privada…</p>}
    <small>Foto capturada no aplicativo. O envio mantém a evidência privada e vinculada ao item.</small>
   </section>
  </div>,document.body)}
 </div>;
}
