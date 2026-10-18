export const rosterSectors=['cozinha','frente','caixa','apoio','gestao'];
export const rosterRoles=['auxiliar','cook','manager','admin'];
export function validateRosterEntry(value,actorRole){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const name=typeof value.name==='string'?value.name.trim():'';
 const email=typeof value.email==='string'?value.email.trim().toLowerCase():'';
 const jobTitle=typeof value.jobTitle==='string'?value.jobTitle.trim():'';
 const sector=value.sector,role=value.role;
 if(name.length<2||name.length>80||jobTitle.length<2||jobTitle.length>80||!rosterSectors.includes(sector)||!rosterRoles.includes(role))return null;
 if(actorRole!=='admin'&&!['auxiliar','cook'].includes(role))return null;
 if(email && (email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return null;
 return {name,email,jobTitle,sector,role};
}
