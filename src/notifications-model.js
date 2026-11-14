const zone='America/Sao_Paulo';
const time=new Intl.DateTimeFormat('pt-BR',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const label=new Intl.DateTimeFormat('pt-BR',{timeZone:zone,day:'numeric',month:'long'});
const stamp=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?date:null};
export const notificationTime=value=>{const date=stamp(value);return date?time.format(date):'Sem horário'};
export function notificationGroups(items,now=new Date()){
 const today=day.format(now),yesterday=day.format(new Date(now.getTime()-86400000)),groups=new Map();
 for(const item of [...items].sort((a,b)=>(stamp(b.at)?.getTime()||0)-(stamp(a.at)?.getTime()||0))){
  const date=stamp(item.at),key=date?day.format(date):'unknown';
  if(!groups.has(key))groups.set(key,{key,label:key===today?'Hoje':key===yesterday?'Ontem':date?label.format(date)+(key.slice(0,4)!==today.slice(0,4)?' de '+key.slice(0,4):''):'Sem data',items:[]});
  groups.get(key).items.push(item);
 }
 return [...groups.values()];
}
export function notificationCategory(item){
 const title=String(item.title||'').toLocaleLowerCase('pt-BR');
 if(title.includes('acesso'))return 'Acesso';
 if(title.includes('escala')||title.includes('folga')||title.includes('cobertura')||title.includes('dobra'))return 'Escala';
 if(title.includes('recebimento')||title.includes('estoque'))return 'Cozinha';
 return 'Equipe';
}
const destinations=new Set(['my-profile','leave-requests','people','kitchen-v3','mural','receiving']);
export function notificationDestination(item){

 const title=String(item.title||'').toLocaleLowerCase('pt-BR');
 if(title==='recebimento aguardando aprovação')return 'receiving';
 if(destinations.has(item.page))return item.page;
 if(title.includes('folga'))return 'leave-requests';
 if(title.includes('escala publicada'))return 'mural';
 return 'my-profile';
}

export function notificationMessage(item){
 const message=item.message?.trim();
 return message==='Abra o aplicativo para consultar os detalhes.'?'':message||'';
}
