import test from 'node:test';
import assert from 'node:assert/strict';
import {availableReceiptQuantity} from '../server/storage/production.js';
import {newUnifiedBalance,applyStorageEntry,applyStorageConsumption,applyStorageCount,applyStorageTransfer} from '../server/storage/balance-engine.js';
test('separa apenas parte da entrega pendente para a cozinha',()=>{
 assert.deepEqual(availableReceiptQuantity({total:20,used:0,quantity:12}),{ok:true,remaining:8});
 assert.deepEqual(availableReceiptQuantity({total:20,used:12,quantity:8}),{ok:true,remaining:0});
 assert.equal(availableReceiptQuantity({total:20,used:12,quantity:9}).ok,false);
 assert.equal(availableReceiptQuantity({total:20,used:20,quantity:1}).ok,false);
 assert.equal(availableReceiptQuantity({total:20,used:0,quantity:0}).ok,false);
});
test('porções e pacotes não exigem conversão fictícia',()=>{
 for(const unit of ['porcao','pacote']){
  const base=newUnifiedBalance(unit);
  const received=applyStorageEntry(base,{storageId:'carnes',quantity:8,unit,origin:'production'});
  assert.equal(received.ok,true);
  assert.equal(received.balance.total,8);
  const consumed=applyStorageConsumption(received.balance,{storageId:'carnes',quantity:3,unit});
  assert.equal(consumed.ok,true);
  assert.equal(consumed.balance.total,5);
 }
});
test('um saldo único permanece consistente em várias conferências e transferências',()=>{
 const counted=applyStorageCount(newUnifiedBalance('un'),{storageId:'reserva_carnes',quantity:36,unit:'un'});
 const moved=applyStorageTransfer(counted.balance,{from:'reserva_carnes',to:'giro',quantity:6,unit:'un'});
 assert.equal(moved.ok,true);assert.equal(moved.balance.total,36);
 assert.equal(moved.balance.byStorage.reserva_carnes,30);
 assert.equal(moved.balance.byStorage.giro,6);
 assert.equal(applyStorageTransfer(moved.balance,{from:'reserva_carnes',to:'giro',quantity:31,unit:'un'}).ok,false);
});
