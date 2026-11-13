// Normalização e associação conservadora: o OCR nunca pode criar produto ou tarefa sozinho.
export function normalizePreparation(value=''){
 return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
const dayWords=/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|hoje|semana|dia|para|turno)\b/i;
const STOP=new Set(['preparacao','producao','cozinha','produto','quantidade','lista','fazer','feito','molho','ingrediente']);
function score(a,b){
 if(!a||!b)return 0;
 if(a===b)return 1;
 if(a.length>=5&&(b.includes(a)||a.includes(b)))return .91;
 const x=a.split(' ').filter(w=>w.length>2),y=b.split(' ').filter(w=>w.length>2);
 if(!x.length||!y.length)return 0;
 let overlap=0;
 for(const word of x)if(y.includes(word))overlap++;
 return overlap/Math.max(x.length,y.length);
}
export function suggestRecipe(label,recipes=[]){
 const a=normalizePreparation(label);
 const candidates=recipes.map(r=>({id:r.id,score:score(a,normalizePreparation(r.name))})).sort((x,y)=>y.score-x.score);
 const [best,next]=candidates;
 // Empates e nomes genéricos como "frango" não devem selecionar produto por conta própria.
 return best?.score>=.92&&best.score-(next?.score||0)>.12?best.id:'';
}
export function parseProductionNote(text,recipes=[]){
 const rows=[];let dateNote='';
 for(const source of String(text||'').split(/\r?\n/).slice(0,80)){
  const line=source.replace(/[•*]/g,' ').replace(/\s+/g,' ').trim();
  if(!line||line.length<2||line.length>130)continue;
  const simple=normalizePreparation(line);
  if(!simple)continue;
  // Nunca tentar converter cabeçalhos ou dias em uma preparação automaticamente.
  if(dayWords.test(simple)&&simple.split(' ').length<=4){dateNote=line;continue;}
  let label=line,quantity='';
  let match=line.match(/^\s*(\d+(?:[.,]\d{1,3})?)\s*(?:x|un|und|unidades|porcoes|porc)?\s+(.+)$/i);
  if(match){quantity=match[1].replace(',','.');label=match[2];}
  else{
   match=line.match(/^(.+?)\s*[-:=x]\s*(\d+(?:[.,]\d{1,3})?)\s*(?:un|und|porcoes|porc)?\s*$/i)||
     line.match(/^(.+?)\s+(\d+(?:[.,]\d{1,3})?)\s*(?:un|und|porcoes|porc)?\s*$/i);
   if(match){label=match[1];quantity=match[2].replace(',','.');}
  }
  label=label.replace(/^[-:]+|[-:]+$/g,'').trim();
  if(label.length<3||STOP.has(normalizePreparation(label))||/^\d+$/.test(label))continue;
  rows.push({id:'row-'+rows.length,label,recipeId:suggestRecipe(label,recipes),quantity,selected:true,dateNote});
  if(rows.length>=20)break;
 }
 return rows;
}
export function validImportRows(rows,recipes){
 if(!Array.isArray(rows)||!rows.length||rows.length>12)return false;
 const active=new Map(recipes.map(r=>[r.id,r]));
 return rows.every(r=>{
  const item=active.get(r.recipeId);
  const value=String(r.quantity??'').trim();
  if(!item||!value)return Boolean(item); // meta opcional
  if(!/^\d+(?:\.\d{1,3})?$/.test(value))return false;
  const n=Number(value);
  return n>0&&n<=10000&&(!['un','porcao','pacote','duzia'].includes(item.outputUnit||'un')||Number.isInteger(n));
 });
}

/** OCR de manuscritos: só ofereça automaticamente itens cuja identidade seja verificável.
 * Leituras ruins permanecem no texto editável, nunca geram dezenas de cards falsos.
 */
export function evaluatePhotoRecognition(text,recipes=[],confidence=null){
 const raw=parseProductionNote(text,recipes);
 const matched=raw.filter(row=>Boolean(row.recipeId));
 const average=typeof confidence==='number'&&Number.isFinite(confidence)?confidence:null;
 // Keep useful verified lines even when another handwritten line is unreadable.
 // A single accidental catalog hit in a long noisy transcript is not reliable.
 const reliable=matched.length>0&&raw.length<=20&&(matched.length>=2||raw.length<=5)&&
  (average===null||average>=45);
 const rows=reliable?raw.filter(row=>{
  if(row.recipeId)return true;
  // Unlinked candidates are displayed for human review, never selected automatically.
  return /[a-zA-ZÀ-ÿ]{3}/.test(row.label)&&row.label.length<=60;
 }).slice(0,12).map(row=>({...row,selected:Boolean(row.recipeId)})):[];
 return {reliable,rows,recognized:matched.length,total:raw.length,confidence:average};
}
