import test from 'node:test';import assert from 'node:assert/strict';import {preparationPlan,validatePreparation} from '../server/production/preparation-config.js';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40),products=[{id:a,status:'active',unit:'kg'},{id:b,status:'active',unit:'porcao'},{id:c,status:'active',unit:'L'}];
const base={type:'portion',name:'Cubos de alcatra',sourceProductId:a,outputProductId:b,portionWeight:250,weightUnit:'g',resultUnit:'porcao',batchYield:1,method:'',location:'reserva',outputPerBatch:null,ingredients:[]};
test('porcionamento converte 250 g para 0,25 kg sem presumir peças',()=>{const p=preparationPlan(base,products);assert.equal(p.ready,true);assert.equal(p.lines[0].quantity,.25);assert.equal(p.yieldQuantity,1);assert.equal(preparationPlan(base,[{...products[0],unit:'un'},products[1]]).ready,false)});
test('iscas preservam resultado sem inventar consumo por porção',()=>{const p=preparationPlan({...base,type:'transform',name:'Iscas de tilápia',portionWeight:330},products);assert.equal(p.ready,true);assert.equal(p.measured,true);assert.equal(p.lines[0].productId,a);assert.equal(p.lines[0].quantity,null);assert.equal(p.lines[0].location,'reserva')});
test('molho exige rendimento medido por balde e não baixa pitada',()=>{const recipe={...base,type:'recipe',outputProductId:c,resultUnit:'balde',ingredients:[{name:'Sal',amount:'100',unit:'g',tracked:true,productId:a},{name:'Alho',amount:'Uma pitada',unit:'orientacao',tracked:false,productId:''}]};assert.equal(preparationPlan(recipe,products).ready,false);const p=preparationPlan({...recipe,outputPerBatch:4},products);assert.equal(p.ready,true);assert.equal(p.yieldQuantity,4);assert.equal(p.lines.length,1);assert.equal(p.lines[0].quantity,.1)});
test('configuração recusa payload inválido e ingrediente que se consome',()=>{assert.ok(validatePreparation({...base,ingredients:[null]}));assert.ok(validatePreparation({...base,portionWeight:-1}));assert.ok(validatePreparation({...base,batchYield:2}));assert.equal(preparationPlan({...base,sourceProductId:b},products).ready,false)});

test('frango recebido cortado é porcionado no mesmo insumo, sem baixa ou crédito',()=>{const p=preparationPlan({...base,name:'Frango a passarinho',sourceProductId:a,outputProductId:a,portionWeight:500},products);assert.equal(p.ready,true);assert.equal(p.sameProduct,true);assert.deepEqual(p.lines,[]);assert.equal(p.portionSize,.5);assert.equal(p.stockUnit,'kg');assert.equal(p.outputUnit,'porcao')});

test('transformação do próprio insumo registra porções sem dar baixa e crédito no mesmo estoque',()=>{const p=preparationPlan({...base,type:'transform',name:'Frango a passarinho',sourceProductId:a,outputProductId:a,portionWeight:500},products);assert.equal(p.ready,true,p.errors.join('; '));assert.equal(p.sameProduct,true);assert.equal(p.measured,false);assert.equal(p.portionSize,.5);assert.deepEqual(p.lines,[]);assert.equal(p.outputUnit,'porcao');});
test('receita com próprio produto como ingrediente controlado impede duplicação de saldo',()=>{const p=preparationPlan({...base,type:'recipe',outputProductId:c,resultUnit:'L',ingredients:[{name:'Próprio molho',amount:'1',unit:'L',tracked:true,productId:c}]},products);assert.equal(p.ready,false);assert.match(p.errors.join(' '),/próprio produto preparado/);});

test('método de contagem é opcional, validado e não muda o efeito no estoque',()=>{
 const same={...base,sourceProductId:a,outputProductId:a,portionWeight:500,countMode:'both'};
 const plan=preparationPlan(same,products);
 assert.equal(plan.ready,true,plan.errors.join('; '));assert.equal(plan.sameProduct,true);assert.deepEqual(plan.lines,[]);
 assert.equal(validatePreparation({...same,countMode:'arbitrary'}),'Escolha um método de contagem válido.');
 assert.equal(validatePreparation({...same,countMode:'portions'}),null);
});
