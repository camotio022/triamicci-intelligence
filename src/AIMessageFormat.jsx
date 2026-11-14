import React from 'react';

// Renderiza um subconjunto seguro de Markdown. Nunca interpreta HTML do modelo.
function inline(text){
 const tokens=String(text||'').split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|(?<!\*)\*[^*\n]+\*(?!\*)|\`[^\`\n]+\`)/g);
 return tokens.map((part,i)=>{
  if((part.startsWith('**')&&part.endsWith('**'))||(part.startsWith('__')&&part.endsWith('__')))
   return <strong key={i}>{part.slice(2,-2)}</strong>;
  if(part.startsWith('*')&&part.endsWith('*')&&part.length>2)return <em key={i}>{part.slice(1,-1)}</em>;
  if(part.startsWith('`')&&part.endsWith('`'))return <code key={i}>{part.slice(1,-1)}</code>;
  return part;
 });
}
export default function AIMessageFormat({text}){
 const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
 const blocks=[];
 let i=0;
 while(i<lines.length){
  const line=lines[i].trim();
  if(!line){i++;continue;}
  const h=/^(#{1,4})\s+(.+)$/.exec(line);
  if(h){const depth=h[1].length;blocks.push(React.createElement(depth<=2?'h3':'h4',{key:i},inline(h[2])));i++;continue;}
  if(/^---+$/.test(line)){blocks.push(<hr key={i}/>);i++;continue;}
  const ordered=/^\d+[.)]\s+/.test(line),bullet=/^[-*•]\s+/.test(line);
  if(ordered||bullet){
   const items=[],start=i;
   while(i<lines.length){
    const candidate=lines[i].trim();
    const m=(ordered?/^\d+[.)]\s+(.+)$/:/^[-*•]\s+(.+)$/).exec(candidate);
    if(!m)break;
    items.push(<li key={i}>{inline(m[1])}</li>);i++;
   }
   blocks.push(ordered?<ol key={start}>{items}</ol>:<ul key={start}>{items}</ul>);
   continue;
  }
  const paragraph=[],start=i;
  while(i<lines.length){
   const t=lines[i].trim();
   if(!t||/^#{1,4}\s+|^---+$|^\d+[.)]\s+|^[-*•]\s+/.test(t))break;
   paragraph.push(t);i++;
  }
  if(paragraph.length)blocks.push(<p key={start}>{inline(paragraph.join(' '))}</p>);
  else i++;
 }
 return <div className="ti-ai-rich-text">{blocks}</div>;
}
