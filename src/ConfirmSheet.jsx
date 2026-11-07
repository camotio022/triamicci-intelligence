import React,{useEffect,useRef} from 'react';
import {AlertTriangle,X} from 'lucide-react';
import './confirm-sheet.css';

/** Shared accessible confirmation sheet. No API calls: caller owns asynchronous action. */
export default function ConfirmSheet({open,title,description,confirmLabel='Confirmar',cancelLabel='Cancelar',tone='primary',busy=false,error='',onConfirm,onCancel}){
 const dialogRef=useRef(null),confirmRef=useRef(null),previousFocus=useRef(null);
 useEffect(()=>{
  if(!open)return;
  previousFocus.current=document.activeElement;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const frame=requestAnimationFrame(()=>confirmRef.current?.focus());
  const keydown=e=>{
   if(e.key==='Escape'){e.preventDefault();if(!busy)onCancel?.();return;}
   if(e.key!=='Tab')return;
   const buttons=[...dialogRef.current?.querySelectorAll('button:not(:disabled)')||[]];
   if(!buttons.length)return;
   const first=buttons[0],last=buttons[buttons.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keydown);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',keydown);document.body.style.overflow=previousOverflow;previousFocus.current?.focus?.();};
 },[open,busy,onCancel]);
 if(!open)return null;
 return <div className="ti-confirm-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onCancel?.()}}>
  <section className="ti-confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="ti-confirm-title" aria-describedby="ti-confirm-description" ref={dialogRef}>
   <header className="ti-confirm-header"><span className="ti-confirm-symbol"><AlertTriangle size={19} aria-hidden="true"/></span><button type="button" aria-label="Fechar confirmação" onClick={onCancel} disabled={busy}><X size={19}/></button></header>
   <h2 id="ti-confirm-title">{title}</h2>
   <p id="ti-confirm-description">{description}</p>
   {error&&<p role="alert" className="ti-confirm-error">{error}</p>}
   <div className="ti-confirm-actions"><button type="button" onClick={onCancel} disabled={busy}>{cancelLabel}</button><button ref={confirmRef} type="button" className={tone==='danger'?'ti-confirm-danger':'ti-confirm-primary'} onClick={onConfirm} disabled={busy} aria-busy={busy}>{busy?'Processando…':confirmLabel}</button></div>
  </section>
 </div>;
}
