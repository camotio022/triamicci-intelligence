// Pure validation/extraction helpers. The image is never stored by this module.
export const MAX_PHOTO_BYTES=1800000;
export function decodePhotoDataUrl(input){
 if(typeof input!=='string')throw Error('INVALID_IMAGE');
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
 if(!match||match[2].length>Math.ceil(MAX_PHOTO_BYTES*4/3)+8)throw Error('INVALID_IMAGE');
 const buffer=Buffer.from(match[2],'base64');
 if(!buffer.length||buffer.length>MAX_PHOTO_BYTES||buffer.toString('base64')!==match[2])throw Error('INVALID_IMAGE');
 const signature=match[1]==='png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
  match[1]==='webp'?buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP':
  buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
 if(!signature)throw Error('INVALID_IMAGE');
 return {mime:'image/'+match[1],content:match[2]};
}
export function extractVisionText(response){
 const first=response?.responses?.[0];
 if(first?.error)throw Error('VISION_PROVIDER_FAILED');
 const full=first?.fullTextAnnotation;
 const text=String(full?.text||first?.textAnnotations?.[0]?.description||'').slice(0,2000).trim();
 const scores=[];
 for(const page of full?.pages||[])for(const block of page.blocks||[])for(const paragraph of block.paragraphs||[])
  for(const word of paragraph.words||[])if(Number.isFinite(word.confidence))scores.push(word.confidence);
 const confidence=scores.length?Math.round(100*scores.reduce((a,b)=>a+b,0)/scores.length):null;
 return {text,confidence};
}
