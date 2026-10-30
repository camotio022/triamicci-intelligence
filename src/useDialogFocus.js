import {useEffect,useRef} from 'react';
export function useDialogFocus(ref,open,close){
 const latest=useRef(close);latest.current=close;
 useEffect(()=>{
  if(!open||!ref.current)return;
  const previous=document.activeElement,old=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>[...ref.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')];
  controls()[0]?.focus();
  const key=e=>{if(e.key==='Escape'){e.preventDefault();latest.current();return;}if(e.key==='Tab'){const list=controls(),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
  document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);previous?.focus?.()};
 },[open]);
}
