import React,{useEffect,useRef,useState} from 'react';
import {Camera,RotateCcw} from 'lucide-react';
export default function ChecklistCamera({runId,itemId,call,onUploaded,disabled}){
 const video=useRef(null),stream=useRef(null),alive=useRef(true),session=useRef(null);
 const [phase,setPhase]=useState('idle'),[preview,setPreview]=useState(''),[error,setError]=useState('');
 const stop=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop();}},[]);
 const start=async()=>{
  setError('');setPreview('');onUploaded(null);setPhase('starting');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Câmera indisponível neste navegador. Abra o app em HTTPS e permita o acesso à câmera.');
   session.current=await call('captureStart',{runId,itemId,requestId:crypto.randomUUID()});
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});
   if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}
   stream.current=media;setPhase('camera');
  }catch(e){if(alive.current){setError(e.name==='NotAllowedError'?'A câmera não foi autorizada. Permita o acesso para fotografar este item.':e.message);setPhase('idle');}stop();}
 };
 useEffect(()=>{if(phase==='camera'&&video.current){video.current.srcObject=stream.current;video.current.play().catch(()=>{setError('Não foi possível abrir a câmera. Tente novamente.');stop();setPhase('idle');});}},[phase]);
 const capture=()=>{
  if(!video.current?.videoWidth)return;
  const canvas=document.createElement('canvas'),ratio=Math.min(1,1280/Math.max(video.current.videoWidth,video.current.videoHeight));
  canvas.width=Math.round(video.current.videoWidth*ratio);canvas.height=Math.round(video.current.videoHeight*ratio);canvas.getContext('2d').drawImage(video.current,0,0,canvas.width,canvas.height);
  let quality=.78,data=canvas.toDataURL('image/jpeg',quality);
  while(data.length>430000&&quality>.35){quality-=.1;data=canvas.toDataURL('image/jpeg',quality);}
  if(data.length>819200){setError('A foto ficou muito grande. Tente um enquadramento mais simples.');return;}
  stop();setPreview(data);setPhase('review');
 };
 const upload=async()=>{
  setError('');setPhase('uploading');
  try{const result=await call('photoUpload',{photoId:session.current.photoId,base64:preview.split(',')[1]});if(alive.current){onUploaded(result.photoId);setPhase('ready');}}
  catch(e){if(alive.current){setError(e.message);setPhase('review');}}
 };
 return <div className="ti-check-camera">
  {phase==='camera'&&<video ref={video} autoPlay playsInline muted aria-label="Câmera ao vivo para conferir o item"/>}
  {preview&&<img src={preview} alt="Foto capturada nesta conferência"/>}
  {error&&<p role="alert" className="ti-check-alert">{error}</p>}
  {phase==='idle'&&<button type="button" disabled={disabled} onClick={start}><Camera size={20}/> Fotografar conferência</button>}
  {phase==='starting'&&<p role="status">Abrindo câmera…</p>}
  {phase==='camera'&&<div className="ti-check-actions"><button type="button" onClick={capture}><Camera size={20}/> Tirar foto</button><button type="button" className="secondary" onClick={()=>{stop();setPhase('idle');}}>Cancelar câmera</button></div>}
  {phase==='review'&&<div className="ti-check-actions"><button type="button" onClick={upload}>Enviar foto</button><button type="button" className="secondary" onClick={start}><RotateCcw size={17}/> Refazer foto</button></div>}
  {phase==='uploading'&&<p role="status">Enviando foto… Aguarde a confirmação.</p>}
  {phase==='ready'&&<><p role="status" className="ti-check-success">Foto enviada para esta conferência.</p><button type="button" className="secondary" disabled={disabled} onClick={start}>Refazer foto</button></>}
  <small>Captura pela câmera do app. Sem seleção da galeria. Retenção de 90 dias; ocorrências abertas preservam a evidência.</small>
 </div>;
}
