import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,Image as ImageIcon,Maximize2,Minus,Plus,X,RotateCcw} from 'lucide-react';

// Evidence stays private: only the authenticated photoRead API can return the bytes.
// Mount thumbnails on demand, rather than downloading every image in the list.
export default function ChecklistEvidence({id,call,compact=false,preview='',label='Evidência anexada'}){
 const host=useRef(null),[visible,setVisible]=useState(Boolean(preview)),[image,setImage]=useState(preview),[loading,setLoading]=useState(false),[error,setError]=useState(''),[opened,setOpened]=useState(false),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const pointers=useRef(new Map()),pinch=useRef(null);
 useEffect(()=>{setImage(preview);setVisible(Boolean(preview));setError('');},[id,preview]);
 useEffect(()=>{if(visible||!id||!host.current)return;const node=host.current;if(!('IntersectionObserver' in window)){setVisible(true);return;}const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);io.disconnect();}},{rootMargin:'180px'});io.observe(node);return()=>io.disconnect();},[visible,id]);
 useEffect(()=>{if(!visible||!id||preview)return;let live=true;setLoading(true);call('photoRead',{photoId:id}).then(r=>{if(live)setImage(r.dataUrl);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[id,call,visible,preview]);
 useEffect(()=>{if(!opened)return;const prev=document.body.style.overflow;document.body.style.overflow='hidden';const key=e=>{if(e.key==='Escape')setOpened(false);if(e.key==='+')setZoom(z=>Math.min(4,z+.25));if(e.key==='-')setZoom(z=>Math.max(1,z-.25));};window.addEventListener('keydown',key);return()=>{document.body.style.overflow=prev;window.removeEventListener('keydown',key);};},[opened]);
 const onPointerDown=e=>{e.currentTarget.setPointerCapture?.(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};}};
 const onPointerMove=e=>{const prior=pointers.current.get(e.pointerId);if(!prior)return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===1&&zoom>1){setPan(p=>({x:p.x+e.clientX-prior.x,y:p.y+e.clientY-prior.y}));}else if(pointers.current.size===2&&pinch.current){const [a,b]=[...pointers.current.values()];setZoom(Math.max(1,Math.min(4,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.current.distance))));}};
 const onPointerUp=e=>{pointers.current.delete(e.pointerId);if(pointers.current.size<2)pinch.current=null;};
 return <div className={'ti-check-evidence-inline'+(compact?' compact':'')} ref={host}>
  {image?<button type="button" className="ti-check-photo-preview" onClick={()=>{setZoom(1);setPan({x:0,y:0});setOpened(true);}} aria-label="Ampliar evidência da conferência"><img src={image} alt="Miniatura da evidência privada"/><span className="ti-check-evidence-copy"><strong>{label}</strong><small>Foto vinculada · tocar para ampliar</small></span><Maximize2 size={19}/></button>:<div className="ti-check-photo-wait"><ImageIcon size={18}/><span>{loading?'Carregando evidência…':error||'Evidência privada'}</span>{error&&<button type="button" className="secondary" onClick={()=>{setVisible(false);setImage('');}}>Tentar novamente</button>}</div>}
  {opened&&image&&createPortal(<div className="ti-check-viewer" role="dialog" aria-modal="true" aria-label="Visualizar evidência">
    <header className="ti-check-viewer-head"><span><ImageIcon size={20}/> Visualizar evidência</span><button type="button" aria-label="Fechar imagem" onClick={()=>setOpened(false)}><X size={22}/></button></header>
    <div className="ti-check-viewer-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={()=>{setZoom(z=>z===1?2:1);setPan({x:0,y:0});}} onWheel={e=>{if(e.ctrlKey){e.preventDefault();setZoom(z=>Math.max(1,Math.min(4,z-e.deltaY*.005)));}}}>
      <img src={image} draggable={false} alt="Evidência da conferência ampliada" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}/>
    </div>
    <footer className="ti-check-viewer-controls"><button type="button" aria-label="Diminuir zoom" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.25))}><Minus size={20}/></button><strong>{Math.round(zoom*100)}%</strong><button type="button" aria-label="Aumentar zoom" disabled={zoom>=4} onClick={()=>setZoom(z=>Math.min(4,z+.25))}><Plus size={20}/></button><button type="button" aria-label="Redefinir zoom" onClick={()=>{setZoom(1);setPan({x:0,y:0});}}><RotateCcw size={19}/></button><small>Use dois dedos para ampliar e arraste para inspecionar · Resolução original preservada</small></footer>
  </div>,document.body)}
 </div>;
}
