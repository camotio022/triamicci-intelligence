import test from 'node:test';import assert from 'node:assert/strict';
import {validateRosterEntry} from '../server/team/roster-rules.js';
const x={name:' Pessoa Teste ',email:'PESSOA@EXAMPLE.COM',jobTitle:'Auxiliar de cozinha',sector:'cozinha',role:'auxiliar'};
test('gerente pode pré-cadastrar auxiliar e normaliza identidade',()=>{const d=validateRosterEntry(x,'manager');assert.equal(d.name,'Pessoa Teste');assert.equal(d.email,'pessoa@example.com')});
test('gerente não concede perfil administrativo em pré-cadastro',()=>assert.equal(validateRosterEntry({...x,role:'admin'},'manager'),null));
test('admin pode preparar vínculo gerencial',()=>assert.equal(validateRosterEntry({...x,role:'manager'},'admin').role,'manager'));
test('bloqueia e-mail inválido e cargo desconhecido',()=>{assert.equal(validateRosterEntry({...x,email:'inválido'},'admin'),null);assert.equal(validateRosterEntry({...x,role:'owner'},'admin'),null)});
