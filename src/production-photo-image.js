export const initialPhotoFrame={rotation:0,zoom:1,horizontal:0,vertical:0};

export function drawPhoto(canvas,image,{rotation,zoom,horizontal,vertical},maxSide){
 const sideways=rotation%180!==0;
 const width=sideways?image.naturalHeight:image.naturalWidth;
 const height=sideways?image.naturalWidth:image.naturalHeight;
 const cropWidth=width/zoom,cropHeight=height/zoom;
 const scale=Math.min(1,maxSide/Math.max(cropWidth,cropHeight));
 canvas.width=Math.max(1,Math.round(cropWidth*scale));
 canvas.height=Math.max(1,Math.round(cropHeight*scale));
 const context=canvas.getContext('2d');
 if(!context)throw Error('Não foi possível preparar a imagem.');
 const left=(width-cropWidth)*(horizontal+100)/200;
 const top=(height-cropHeight)*(vertical+100)/200;
 context.fillStyle='#fff';
 context.fillRect(0,0,canvas.width,canvas.height);
 context.scale(canvas.width/cropWidth,canvas.height/cropHeight);
 context.translate(width/2-left,height/2-top);
 context.rotate(rotation*Math.PI/180);
 context.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
}

export async function photoJpeg(image,frame){
 const canvas=document.createElement('canvas');
 drawPhoto(canvas,image,frame,2200);
 for(const quality of [.9,.75,.6]){
  const jpeg=canvas.toDataURL('image/jpeg',quality);
  const prefix='data:image/jpeg;base64,';
  if(jpeg.startsWith(prefix)&&jpeg.length-prefix.length<=1800000)return jpeg.slice(prefix.length);
 }
 throw Error('Não foi possível compactar a foto. Recorte a anotação ou escolha outra imagem.');
}
