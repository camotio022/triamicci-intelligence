import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConference} from '../server/operations/package-conference.js';
const packages=[{presentation:'pacote',validated:false,fixed:false}];
const method={kind:'packages',presentation:'pacote',trackOpen:true};
test('aceita fechados e abertos sem estimar peso',()=>{
 assert.deepEqual(validateConference({method,packages,presentation:'pacote',closed:5,opened:1}),{ok:true,presentation:'pacote',closed:5,opened:1});
});
test('rejeita método divergente, fracionado ou aberto não autorizado',()=>{
 for(const params of [
 {method:{kind:'base'},packages,presentation:'pacote',closed:5,opened:0},
 {method,packages,presentation:'caixa',closed:5,opened:0},
 {method,packages,presentation:'pacote',closed:1.5,opened:0},
 {method,packages,presentation:'pacote',closed:-1,opened:0},
 {method:{...method,trackOpen:false},packages,presentation:'pacote',closed:5,opened:1}
 ])assert.equal(validateConference(params).ok,false);
});
