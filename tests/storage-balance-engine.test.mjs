import test from 'node:test';
import assert from 'node:assert/strict';
import {newUnifiedBalance,applyStorageCount,applyStorageTransfer,applyStorageEntry,applyStorageConsumption,validateUnifiedBalance,receiptStage} from '../server/storage/balance-engine.js';
test('insumo tem um saldo único composto pelas localizações',()=>{
 let b=newUnifiedBalance('un');
 b=applyStorageCount(b,{storageId:'carne',quantity:60,unit:'un'}).balance;
 b=applyStorageCount(b,{storageId:'giro',quantity:20,unit:'un'}).balance;
 assert.equal(b.total,80);assert.deepEqual(b.byStorage,{carne:60,giro:20});assert.equal(validateUnifiedBalance(b),true);
});
test('transferência conserva total e não permite saldo negativo',()=>{
 const b={unit:'un',total:80,byStorage:{carne:60,giro:20}};
 const moved=applyStorageTransfer(b,{from:'carne',to:'giro',quantity:10,unit:'un'});
 assert.equal(moved.ok,true);assert.equal(moved.balance.total,80);assert.deepEqual(moved.balance.byStorage,{carne:50,giro:30});
 assert.equal(applyStorageTransfer(b,{from:'carne',to:'giro',quantity:61,unit:'un'}).ok,false);
 assert.equal(applyStorageTransfer(b,{from:'carne',to:'carne',quantity:10,unit:'un'}).ok,false);
});
test('recebimento, preparação e consumo não multiplicam saldos',()=>{
 const start=newUnifiedBalance('kg');
 const got=applyStorageEntry(start,{storageId:'frio',quantity:18000,unit:'g',origin:'supplier'});
 assert.equal(got.balance.total,18);
 const used=applyStorageConsumption(got.balance,{storageId:'frio',quantity:3,unit:'kg'});
 assert.equal(used.balance.total,15);
 assert.equal(applyStorageEntry(start,{storageId:'frio',quantity:18,unit:'un',origin:'supplier'}).ok,false);
 assert.equal(applyStorageConsumption(start,{storageId:'frio',quantity:1,unit:'kg'}).ok,false);
});
test('pré-recebimento é rastreável sem movimentar o saldo oficial',()=>{
 assert.deepEqual(receiptStage({receiptId:'r1',productId:'p1',quantity:20,unit:'kg',alreadyAllocated:12}),{ok:true,receiptId:'r1',productId:'p1',quantity:20,unit:'kg',remaining:8,status:'pending_manager_approval',affectsOfficialBalance:false});
 assert.equal(receiptStage({receiptId:'r1',productId:'p1',quantity:10,unit:'kg',alreadyAllocated:12}).ok,false);
});
