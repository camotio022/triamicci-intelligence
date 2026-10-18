// Dados profissionais independentes de permissões de login.
export const sectors=['cozinha','frente','caixa','apoio','gestao'];
export const skillCatalog=['preparo','montagem','chapa','vitrine','vendas','ifood','caixa','recebimento','estoque','lideranca','etiquetagem'];
export const skillsBySector={
 cozinha:['preparo','montagem','chapa','recebimento','estoque','etiquetagem'],
 frente:['vitrine','vendas','ifood'],
 caixa:['caixa','vendas','ifood'],
 apoio:['recebimento','estoque','etiquetagem','montagem'],
 gestao:['lideranca','recebimento','estoque','etiquetagem']
};
export const eligibleSkills=sector=>skillsBySector[sector]||[];
export function invalidNewSectorSkills(previous,next){
 const allowedSet=new Set([...eligibleSkills(next.sector),...(next.sectorExceptions||[])]);
 const existing=new Set([...(previous?.skills||[]),...(previous?.certifications||[])]);
 return next.skills.filter(k=>!allowedSet.has(k)&&!existing.has(k));
}
export const days=['seg','ter','qua','qui','sex','sab','dom'];
export const shifts=['manha','noite','intermediario','variavel'];
const allowed=(x,values)=>typeof x==='string'&&values.includes(x);
const clock=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export function canManageProfessionalProfile(actor,target){
 return actor?.status==='active' && ['admin','manager'].includes(actor.role) &&
   !!actor.unitId && actor.unitId===target?.unitId &&
   (actor.role==='admin'||['cook','auxiliar'].includes(target.role));
}
export function validateProfessionalProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const {sector,jobTitle,skills,certifications,shift,availability,notes}=value;
 const sectorExceptions=value.sectorExceptions||[];
 if(!allowed(sector,sectors)||typeof jobTitle!=='string'||jobTitle.trim().length<2||jobTitle.trim().length>80||
   !Array.isArray(sectorExceptions)||sectorExceptions.length>skillCatalog.length||!sectorExceptions.every(x=>allowed(x,skillCatalog))||new Set(sectorExceptions).size!==sectorExceptions.length||
   !Array.isArray(skills)||skills.length>skillCatalog.length||!skills.every(x=>allowed(x,skillCatalog))||new Set(skills).size!==skills.length||
   !Array.isArray(certifications)||certifications.length>skillCatalog.length||
   !certifications.every(x=>allowed(x,skillCatalog))||new Set(certifications).size!==certifications.length||
   !certifications.every(x=>skills.includes(x))||!allowed(shift,shifts)||
   !Array.isArray(availability)||availability.length>7||availability.some(x=>!x||typeof x!=='object')||new Set(availability.map(x=>x.day)).size!==availability.length||
   typeof notes!=='string'||notes.length>240)return null;
 for(const item of availability){
   if(!item||!allowed(item.day,days)||!clock(item.start)||!clock(item.end)||!clock(item.breakStart)||!clock(item.breakEnd)||
      item.start>=item.end||item.breakStart<item.start||item.breakEnd>item.end||item.breakStart>=item.breakEnd)return null;
 }
 return {sector,jobTitle:jobTitle.trim(),skills:[...skills],certifications:[...certifications],
  shift,sectorExceptions:[...sectorExceptions],availability:availability.map(({day,start,end,breakStart,breakEnd})=>({day,start,end,breakStart,breakEnd})),notes:notes.trim()};
}
