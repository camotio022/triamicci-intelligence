const endpoint='https://vision.googleapis.com/v1/images:annotate';
const lineBreaks=new Set(['EOL_SURE_SPACE','LINE_BREAK','HYPHEN']);

export function photoLines(annotation){
 const lines=[];
 for(const page of annotation?.pages||[]){
  for(const block of page.blocks||[]){
   for(const paragraph of block.paragraphs||[]){
    let words=[];
    const flush=()=>{
     if(words.length&&lines.length<80)lines.push(words);
     words=[];
    };
    for(const word of paragraph.words||[]){
     const symbols=word.symbols||[];
     const firstBreak=symbols[0]?.property?.detectedBreak;
     if(firstBreak?.isPrefix&&lineBreaks.has(firstBreak.type))flush();
     const text=symbols.map(symbol=>symbol.text||'').join('').trim();
     if(text&&text.length<=130){
      const scores=symbols.map(symbol=>symbol.confidence);
      // Digits require character-level evidence whenever the provider returns it.
      const confidence=/\d/.test(text)&&scores.every(Number.isFinite)
       ?Math.min(...scores):word.confidence;
      words.push({text,confidence:Number.isFinite(confidence)&&confidence>=0&&confidence<=1?confidence:0});
     }
     const lastBreak=symbols.at(-1)?.property?.detectedBreak;
     if(lastBreak&&!lastBreak.isPrefix&&lineBreaks.has(lastBreak.type))flush();
    }
    flush();
   }
  }
 }
 return lines;
}

export async function readPhoto(base64,{key,fetcher=fetch}){
 const response=await fetcher(endpoint,{
  method:'POST',
  headers:{'Content-Type':'application/json','x-goog-api-key':key},
  body:JSON.stringify({requests:[{
   image:{content:base64},features:[{type:'DOCUMENT_TEXT_DETECTION'}],
   imageContext:{languageHints:['pt']}
  }]}),
  signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw Error('VISION_HTTP_'+response.status);
 const [result]=((await response.json()).responses||[]);
 if(!result||result.error)throw Error('VISION_RESPONSE_FAILED');
 return photoLines(result.fullTextAnnotation);
}
