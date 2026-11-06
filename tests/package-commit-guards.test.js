import test from 'node:test';
import assert from 'node:assert/strict';
import {canCommitPackageAdjustment} from '../server/operations/package-commit-guards.js';
const t={toMillis:()=>1234};
const base={conference:{id:'abc',productId:'p',unitId:'u',area:'giro',profileVersion:2,presentation:'pacote'},profile:{version:2,countingMethod:{kind:'packages',presentation:'pacote'}},balance:{unit:'kg',reserve:2,rotation:3,total:5,countId:'c',lastMovementAt:t},expected:{unitId:'u',productId:'p',conferenceId:'abc',area:'giro',profileVersion:2,unit:'kg',quantity:3,balanceCountId:'c',balanceMovementMillis:1234},actor:{role:'manager',status:'active',unitId:'u'},lotStatus:'BALANCED',lotAllocationsValid:true};
test('only matching immutable references can pass commit guards',()=>{
 assert.equal(canCommitPackageAdjustment(base).ok,true);
 assert.ok(canCommitPackageAdjustment({...base,expected:{...base.expected,balanceMovementMillis:1235}}).reasons.includes('STALE_BALANCE'));
 assert.ok(canCommitPackageAdjustment({...base,profile:{...base.profile,version:3}}).reasons.includes('PROFILE_CHANGED'));
 assert.ok(canCommitPackageAdjustment({...base,lotAllocationsValid:false}).reasons.includes('LOTS_NOT_READY'));
 assert.ok(canCommitPackageAdjustment({...base,actor:{...base.actor,role:'cook'}}).reasons.includes('FORBIDDEN'));
});
test('gerência e subgerência conciliam somente na própria unidade com vínculo ativo',()=>{
 for(const role of ['admin','manager','submanager']){
  const actor={...base.actor,role};
  assert.equal(canCommitPackageAdjustment({...base,actor}).ok,true);
  for(const invalid of [{...actor,unitId:'other'},{...actor,status:'inactive'}])
   assert.ok(canCommitPackageAdjustment({...base,actor:invalid}).reasons.includes('FORBIDDEN'));
 }
 for(const role of ['cook','auxiliar','unknown'])
  assert.ok(canCommitPackageAdjustment({...base,actor:{...base.actor,role}}).reasons.includes('FORBIDDEN'));
});
