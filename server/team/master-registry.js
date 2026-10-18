// Prévia determinística: nunca vincular contas somente pelo nome.
export const staffSeed=[
 ['Patrícia','Auxiliar de cozinha','cozinha','manha',1],
 ['Judson','Subgerente','gestao','noite',1],
 ['Suberlânio','Cozinheiro','cozinha','manha',1],
 ['Emilly','Atendente','frente','manha',1],
 ['Edileuza','Auxiliar de cozinha','cozinha','noite',1],
 ['Caroline','Atendente','frente','noite',2],
 ['Temotio','Cozinheiro','cozinha','manha',2],
 ['Ananda','Atendente','frente','manha',2],
 ['Rodolfo','Cozinheiro','cozinha','noite',3],
 ['Jucimara','Caixa','caixa','noite',3],
 ['Edielson','Gerente','gestao','manha',3],
 ['Francisco','Auxiliar de cozinha','cozinha','manha',4]
].map(([name,jobTitle,sector,shift,fixedWeekday])=>({name,jobTitle,sector,shift,fixedWeekday}));
export const normalizeStaffName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
export function samePossiblePerson(a,b){const x=normalizeStaffName(a),y=normalizeStaffName(b);return !!x&&!!y&&(x===y||x.startsWith(y+' ')||y.startsWith(x+' '));}
export function reconcileStaff(seed,registry,accounts){
 return seed.map(person=>{
  const namedRegistry=registry.filter(x=>normalizeStaffName(x.name)===normalizeStaffName(person.name));
  const namedAccounts=accounts.filter(x=>samePossiblePerson(x.name,person.name));
  return {...person,registryId:namedRegistry.length===1?namedRegistry[0].id:null,
   matches:namedRegistry.length,accountMatches:namedAccounts.length,
   state:namedRegistry.length>1?'ambiguous':namedRegistry.length===1?'existing':namedAccounts.length?'needs_review':'new'};
 });
}
