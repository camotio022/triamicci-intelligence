import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPhysical,convertPackage,packageState,unitInfo,isPresentation} from '../server/operations/unit-engine.js';
test('conversões físicas da mesma dimensão',()=>{
 assert.deepEqual(convertPhysical({quantity:1500,from:'g',to:'kg'}),{ok:true,quantity:1.5,unit:'kg',method:'EXACT_UNIT'});
 assert.deepEqual(convertPhysical({quantity:2,from:'L',to:'mL'}),{ok:true,quantity:2000,unit:'mL',method:'EXACT_UNIT'});
 assert.equal(convertPhysical({quantity:2,from:'duzia',to:'un'}).quantity,24);
});
test('não presume relações entre dimensão ou peso por peça',()=>{
 assert.equal(convertPhysical({quantity:1,from:'kg',to:'un'}).reason,'DIFFERENT_DIMENSIONS');
 assert.equal(convertPhysical({quantity:1,from:'L',to:'kg'}).reason,'DIFFERENT_DIMENSIONS');
 assert.equal(convertPhysical({quantity:1,from:'pacote',to:'kg'}).ok,false);
 assert.equal(convertPhysical({quantity:1,from:'un',to:'duzia'}).reason,'FRACTIONAL_COUNT');
});
test('embalagem somente com conteúdo fixo e homologado',()=>{
 const rule={presentation:'caixa',contentQuantity:12,contentUnit:'un',validated:true,fixed:true,version:'v1'};
 assert.equal(convertPackage({quantity:2,presentation:'caixa',packageRule:rule,to:'un'}).quantity,24);
 assert.equal(convertPackage({quantity:2,presentation:'caixa',packageRule:rule,to:'un'}).ruleVersion,'v1');
 assert.equal(convertPackage({quantity:2,presentation:'caixa',packageRule:{...rule,validated:false},to:'un'}).reason,'UNVERIFIED_OR_VARIABLE_PACKAGE');
 assert.equal(convertPackage({quantity:1,presentation:'pacote',packageRule:{...rule,presentation:'pacote',fixed:false},to:'kg'}).reason,'UNVERIFIED_OR_VARIABLE_PACKAGE');
 assert.equal(convertPackage({quantity:1,presentation:'bandeja',packageRule:null,to:'un'}).ok,false);
});
test('pacotes abertos com saldo desconhecido não viram zero',()=>{
 const p=packageState({sealed:5,opened:1});
 assert.equal(p.ok,true);assert.equal(p.remaining.status,'UNKNOWN');assert.equal(p.remaining.quantity,null);
 assert.equal(packageState({sealed:5,opened:1,knownRemaining:0.7,remainingUnit:'kg'}).remaining.quantity,0.7);
 assert.equal(packageState({sealed:5.5,opened:0}).ok,false);
 assert.equal(packageState({sealed:1,opened:1,knownRemaining:0.5,remainingUnit:'un'}).reason,'FRACTIONAL_COUNT');
});
test('unidades e quantidades inválidas recusadas',()=>{
 assert.equal(unitInfo('pacote'),null);
 assert.equal(isPresentation('pacote'),true);
 for(const quantity of [0,-1,NaN,Infinity])assert.equal(convertPhysical({quantity,from:'kg',to:'g'}).ok,false);
});
