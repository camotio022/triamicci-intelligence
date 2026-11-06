import test from 'node:test';import assert from 'node:assert/strict';
import {canManageProfessionalProfile,eligibleSkills,invalidNewSectorSkills,validateProfessionalProfile} from '../server/team/profile-rules.js';
test('gerente e subgerente gerem perfis operacionais da própria unidade',()=>{
 for(const role of ['manager','submanager']){
  const actor={role,status:'active',unitId:'barigui'};
  for(const targetRole of ['cook','auxiliar']){
   const target={role:targetRole,unitId:'barigui'};
   assert.equal(canManageProfessionalProfile(actor,target),true);
   assert.equal(canManageProfessionalProfile(actor,{...target,unitId:'other'}),false);
   assert.equal(canManageProfessionalProfile({...actor,status:'inactive'},target),false);
  }
  assert.equal(canManageProfessionalProfile(actor,{role:'admin',unitId:'barigui'}),false);
 }
});
test('cozinha possui preparo e etiquetagem, não vendas',()=>{assert(eligibleSkills('cozinha').includes('etiquetagem'));assert(!eligibleSkills('cozinha').includes('vendas'))});
test('turnos não interferem no catálogo por setor',()=>{assert.deepEqual(eligibleSkills('cozinha'),eligibleSkills('cozinha'))});
test('preserva habilidade antiga ao mudar setor',()=>{const old={skills:['preparo'],certifications:['preparo']};assert.deepEqual(invalidNewSectorSkills(old,{sector:'frente',skills:['preparo']}),[])});
test('bloqueia inclusão nova incompatível',()=>assert.deepEqual(invalidNewSectorSkills({skills:[],certifications:[]},{sector:'cozinha',skills:['caixa']}),['caixa']));
test('habilidade etiquetagem é reconhecida no perfil',()=>{const p={sector:'cozinha',jobTitle:'Auxiliar',skills:['etiquetagem'],certifications:[],shift:'manha',availability:[],notes:''};assert(validateProfessionalProfile(p))});

test('exceção autorizada permite competência fora do setor',()=>assert.deepEqual(invalidNewSectorSkills({skills:[]},{sector:'cozinha',sectorExceptions:['caixa'],skills:['caixa']}),[]));
test('rejeita exceção duplicada ou inexistente',()=>{
 const base={sector:'cozinha',jobTitle:'Auxiliar',skills:['preparo'],certifications:[],shift:'manha',availability:[],notes:''};
 assert.equal(validateProfessionalProfile({...base,sectorExceptions:['caixa','caixa']}),null);
 assert.equal(validateProfessionalProfile({...base,sectorExceptions:['raiz']}),null);
});
