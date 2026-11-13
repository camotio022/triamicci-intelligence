import React,{useEffect,useRef} from 'react';
import {drawPhoto,initialPhotoFrame} from './production-photo-image.js';

export default function ProductionPhotoFrame({image,frame,onChange,busy}){
 const canvasRef=useRef(null);
 useEffect(()=>{
  if(image&&canvasRef.current)drawPhoto(canvasRef.current,image,frame,640);
 },[image,frame]);
 return <div className="photo-import-frame">
  <canvas ref={canvasRef} className="photo-import-preview" role="img" aria-label="Prévia da área para leitura"/>
  <div className="photo-import-image-actions">
   <button type="button" className="photo-import-outline" disabled={busy} onClick={()=>onChange({...frame,rotation:(frame.rotation+90)%360,horizontal:0,vertical:0})}>Girar 90°</button>
   <button type="button" className="photo-import-outline" disabled={busy} onClick={()=>onChange(initialPhotoFrame)}>Restaurar enquadramento</button>
  </div>
  <label>Zoom do recorte<input type="range" min="1" max="6" step=".1" value={frame.zoom} disabled={busy} onChange={e=>onChange({...frame,zoom:Number(e.target.value)})}/></label>
  {frame.zoom>1&&<>
   <label>Posição horizontal<input type="range" min="-100" max="100" value={frame.horizontal} disabled={busy} onChange={e=>onChange({...frame,horizontal:Number(e.target.value)})}/></label>
   <label>Posição vertical<input type="range" min="-100" max="100" value={frame.vertical} disabled={busy} onChange={e=>onChange({...frame,vertical:Number(e.target.value)})}/></label>
  </>}
 </div>;
}
