import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOperationalProfile,stockVisibility,countGroupedPackages,transitionOrder,reportShortage} from '../server/operations/v3-catalog-policy.js';
test('disponibilidade nao exige contagem nem cria saldo',()=>{
 const p={displayName:'Rúcula',controlMode:'availability',origin:'supplier',locations:['reserva']};
 assert.equal(validateOperationalProfile(p).ok,true);
 const s=stockVisibility({mode:'availability',signal:'low'});
 assert.equal(s.quantity,null);assert.equal(s.status,'low');
});
test('controle exige unidade e proibe relacao de peso inventada',()=>{
 assert.equal(validateOperationalProfile({displayName:'Tilápia',controlMode:'quantitative',origin:'supplier',locations:['reserva']}).ok,false);
 assert.equal(validateOperationalProfile({displayName:'Tilápia',controlMode:'quantitative',origin:'supplier',locations:['reserva'],countUnit:'kg',unitConversion:{fixed:false}}).ok,false);
});
test('contagem so soma duas areas com referencia compativel',()=>{
 const b={mode:'quantitative',reserve:{quantity:20,unit:'un'},giro:{quantity:10,unit:'un'}};
 assert.equal(stockVisibility({...b,reserveAt:'2026-10-20T12:00:00Z',giroAt:'2026-10-20T12:03:00Z',reserveSessionId:'s1',giroSessionId:'s1'}).quantity,30);
 assert.equal(stockVisibility({...b,reserveAt:'2026-10-19T12:00:00Z',giroAt:'2026-10-20T12:00:00Z',reserveSessionId:'s1',giroSessionId:'s2'}).quantity,null);
});
test('sacos e porcoes nao sao duplicados',()=>{
 assert.equal(countGroupedPackages({complete:2,perGroup:5,loose:3}).quantity,13);
 assert.equal(countGroupedPackages({complete:1,perGroup:10,loose:0}).quantity,10);
});
test('pedido possui agenda e transicoes validadas',()=>{
 assert.equal(transitionOrder({status:'requested',etaDate:'2026-10-23'},'confirmed').ok,true);
 assert.equal(transitionOrder({status:'received',etaDate:'2026-10-23'},'requested').ok,false);
 assert.equal(transitionOrder({status:'requested'},'confirmed').ok,false);
});
test('aviso de falta nao mexe em quantidade',()=>{
 const r=reportShortage({productId:'tomate',location:'reserva',reporterUid:'u'});
 assert.equal(r.ok,true);assert.equal(r.changesBalance,false);
});

test('status recebido e parcial dependem de conferencia fisica, nao de selecao manual',()=>{
 for(const status of ['requested','confirmed','overdue','partially_received']){
  for(const next of ['received','partially_received']){
   assert.equal(transitionOrder({status,etaDate:'2026-10-23'},next).ok,false,`${status} -> ${next}`);
  }
 }
});
