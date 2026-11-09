import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationPlan,validatePreparation} from '../server/production/preparation-config.js';
import {recipeAvailability} from '../server/production/readiness.js';

const id=letter=>letter.repeat(40);
const rawProducts=[
 {id:id('a'),name:'Frango a passarinho',status:'active',physicalUnit:'kg'},
 {id:id('b'),name:'File de tilapia (materia-prima)',status:'active',physicalUnit:'kg'},
 {id:id('c'),name:'Porcao de tilapia preparada',status:'active',physicalUnit:'porcao'},
 {id:id('d'),name:'Legumes variados',status:'active',physicalUnit:'kg'},
 {id:id('e'),name:'Tempero',status:'active',physicalUnit:'kg'},
 {id:id('f'),name:'Legumes preparados',status:'active',physicalUnit:'balde'}
];
const products=rawProducts.map(product=>({...product,operationalCatalogVersion:'56-v1'}));
const base={name:'Preparacao valida',sourceProductId:'',outputProductId:id('c'),portionMode:'separate',
 resultUnit:'porcao',batchYield:1,portionWeight:120,weightUnit:'g',method:'',location:'reserva',outputPerBatch:null,ingredients:[]};

test('mesmo insumo: frango 300 g, porcionamento sem movimentar saldo no cadastro',()=>{
 const configuration={...base,type:'portion',name:'Frango a passarinho',sourceProductId:id('a'),
  outputProductId:id('a'),portionMode:'same',portionWeight:300};
 assert.equal(validatePreparation(configuration),null);
 const plan=preparationPlan(configuration,products);
 assert.equal(plan.ready,true,plan.errors.join('; '));
 assert.equal(plan.sameProduct,true);
 assert.equal(plan.stockUnit,'kg');
 assert.equal(plan.portionSize,0.3);
 assert.deepEqual(plan.lines,[]);
});
test('transformacao: tilapia sem rendimento fixo antes da execucao',()=>{
 const configuration={...base,type:'transform',name:'Tilapia preparada',sourceProductId:id('b'),
  outputProductId:id('c'),portionWeight:120};
 assert.equal(validatePreparation(configuration),null);
 const plan=preparationPlan(configuration,products);
 assert.equal(plan.ready,true,plan.errors.join('; '));
 assert.equal(plan.measured,true);
 assert.equal(plan.lines.length,1);
 assert.equal(plan.lines[0].productId,id('b'));
 assert.equal(plan.lines[0].quantity,null);
});
test('receita: varios ingredientes vinculados, rendimento de um balde',()=>{
 const configuration={...base,type:'recipe',name:'Legumes preparados',sourceProductId:'',outputProductId:id('f'),
  resultUnit:'balde',batchYield:1,ingredients:[
   {name:'Legumes',amount:'2',unit:'kg',tracked:true,productId:id('d')},
   {name:'Tempero',amount:'0.1',unit:'kg',tracked:true,productId:id('e')}
  ]};
 assert.equal(validatePreparation(configuration),null);
 const plan=preparationPlan(configuration,products);
 assert.equal(plan.ready,true,plan.errors.join('; '));
 assert.equal(plan.sameProduct,false);
 assert.equal(plan.lines.length,2);
 assert.deepEqual(plan.lines.map(x=>x.quantity),[2,0.1]);
});
test('ficha ativa nao exige saldo fisico inicial para aparecer no planejamento',()=>{
 const recipe={active:true,stockEffect:'measured_transformation',lines:[{productId:id('b'),quantity:null}],
  outputProductId:id('c'),outputUnit:'porcao'};
 const availability=recipeAvailability(recipe,products);
 assert.equal(availability.available,true,availability.errors.join('; '));
});
