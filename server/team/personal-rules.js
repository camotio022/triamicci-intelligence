export const personalFields=['displayName','bio','developmentGoal','preferredShift'];
export function validatePersonalProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const normalized={};
 for(const [key,max] of [['displayName',60],['bio',220],['developmentGoal',180]]){
  if(typeof value[key]!=='string'||value[key].length>max)return null;
  normalized[key]=value[key].trim();
 }
 if(!['','manha','noite','intermediario','variavel'].includes(value.preferredShift))return null;
 normalized.preferredShift=value.preferredShift;
 return normalized;
}
export function earnedRecognition(profile){
 const confirmed=Array.isArray(profile?.certifications)?profile.certifications.length:0;
 const assigned=Array.isArray(profile?.skills)?profile.skills.length:0;
 // Reconhecimento ilustrativo: apenas atribuições efetivamente registradas.
 return {confirmed,assigned,points:confirmed*100,level:confirmed>=5?'Referência em habilidades':confirmed>=3?'Em destaque':confirmed>=1?'Em evolução':'Primeiros passos'};
}
