import test from 'node:test';import assert from 'node:assert/strict';
import {validateProfessionalProfile,canManageProfessionalProfile} from '../server/team/profile-rules.js';
const sample={sector:'cozinha',jobTitle:'Cozinheiro',skills:['preparo','montagem'],certifications:['preparo'],shift:'manha',availability:[{day:'seg',start:'08:00',end:'17:00',breakStart:'12:00',breakEnd:'13:00'}],notes:''};
test('perfil válido e separado de permissões',()=>{const x=validateProfessionalProfile(sample);assert.ok(x);assert.equal(x.jobTitle,'Cozinheiro');assert.equal('role' in x,false)});
test('não permite habilitação fora das habilidades informadas',()=>assert.equal(validateProfessionalProfile({...sample,certifications:['caixa']}),null));
test('impede horário inválido ou pausa fora da jornada',()=>assert.equal(validateProfessionalProfile({...sample,availability:[{...sample.availability[0],breakStart:'07:00'}]}),null));
test('impede dias e habilidades duplicadas',()=>{assert.equal(validateProfessionalProfile({...sample,skills:['preparo','preparo']}),null);assert.equal(validateProfessionalProfile({...sample,availability:[sample.availability[0],sample.availability[0]]}),null)});
test('não aceita setores arbitrários ou cargo vazio',()=>{assert.equal(validateProfessionalProfile({...sample,sector:'root'}),null);assert.equal(validateProfessionalProfile({...sample,jobTitle:''}),null)});

test('payload malformado falha com validação, sem erro inesperado',()=>{
 assert.equal(validateProfessionalProfile({...sample,availability:[null]}),null);
 assert.equal(validateProfessionalProfile({...sample,availability:[undefined]}),null);
});
test('gerente edita cozinheiro na mesma unidade, não administrador ou outra unidade',()=>{
 const manager={status:'active',role:'manager',unitId:'barigui'};
 assert.equal(canManageProfessionalProfile(manager,{role:'cook',unitId:'barigui'}),true);
 assert.equal(canManageProfessionalProfile(manager,{role:'admin',unitId:'barigui'}),false);
 assert.equal(canManageProfessionalProfile(manager,{role:'cook',unitId:'outra'}),false);
 assert.equal(canManageProfessionalProfile({...manager,status:'inactive'},{role:'cook',unitId:'barigui'}),false);
});
test('administrador só altera perfis vinculados à mesma unidade',()=>{
 const actor={status:'active',role:'admin',unitId:'barigui'};
 assert.equal(canManageProfessionalProfile(actor,{role:'admin',unitId:'barigui'}),true);
 assert.equal(canManageProfessionalProfile(actor,{role:'admin',unitId:'outra'}),false);
 assert.equal(canManageProfessionalProfile({...actor,role:'auxiliar'},{role:'cook',unitId:'barigui'}),false);
});
