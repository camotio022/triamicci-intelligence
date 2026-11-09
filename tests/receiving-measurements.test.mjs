import test from 'node:test';
import assert from 'node:assert/strict';
import {inUnit,previewStock,previewYields,validUnitModel} from '../server/operations/receiving-model.js';
import {validateOperationalProfile} from '../server/operations/v3-catalog-policy.js';
import {receivingConflict} from '../server/operations/receiving-policy.js';
import {receivingUnit,receivingLineError} from '../server/operations/receiving-input.js';
const base={displayName:'Alcatra',controlMode:'quantitative',origin:'supplier',countUnit:'kg',locations:['reserva']};
const model={receivingUnit:'kg',conversion:null,yields:[
 {label:'Bife 120 g',sourceUnit:'g',sourceQuantity:120,resultUnit:'porcao',resultQuantity:1},
 {label:'Cubos 150 g',sourceUnit:'g',sourceQuantity:150,resultUnit:'porcao',resultQuantity:1}
]};
test('18 kg rendem 150 porcoes de 120g ou 120 de 150g, sem arredondar para cima',()=>{
 const result=previewYields(18,'kg',model);
 assert.deepEqual(result.map(v=>v.quantity),[150,120]);
 assert.equal(previewStock(18,'kg',model,'kg').quantity,18);
 assert.equal(previewYields(18.05,'kg',model)[0].quantity,150,'Porções inteiras não podem virar fração de estoque');
 assert.equal(inUnit(1200,'g','kg'),1.2);
 assert.equal(inUnit(1.5,'L','ml'),1500);
 assert.equal(inUnit(12,'un','kg'),null);
});
test('embalagem somente com fator fixo; nenhuma contagem presumida para kg -> unidades',()=>{
 const fixed={receivingUnit:'caixa',conversion:{fixed:true,fromUnit:'caixa',toUnit:'un',factor:12},yields:[]};
 assert.equal(validUnitModel(fixed,'un'),true);
 assert.deepEqual(previewStock(2,'caixa',fixed,'un'),{quantity:24,unit:'un',kind:'configured'});
 assert.equal(previewStock(18,'kg',model,'un'),null);
 assert.equal(validUnitModel({...fixed,conversion:{...fixed.conversion,fixed:false}},'un'),false);
});
test('configuracao individual preserva validacao e quantidade fisica aferida',()=>{
 const profile={...base,receivingModel:model};
 assert.equal(validateOperationalProfile(profile).ok,true);
 assert.equal(receivingUnit(profile,{}),'kg');
 const line={commercialUnit:'kg',commercialQuantity:18,stockQuantity:18,location:'reserva'};
 assert.equal(receivingConflict({},profile,line),null);
 assert.equal(receivingLineError(line,profile,{}),null);
 assert.equal(receivingConflict({},profile,{...line,stockQuantity:150}),'RECEIVING_QUANTITY');
});
test('modelo sem rendimento e sem conversao continua valido; erro de unidade bloqueia',()=>{
 assert.equal(validUnitModel({receivingUnit:'fardo',yields:[]},'kg'),true);
 assert.equal(validUnitModel({receivingUnit:'banana',yields:[]},'kg'),false);
 assert.equal(validUnitModel({...model,yields:[{label:'teste',sourceUnit:'kg',sourceQuantity:0,resultUnit:'un',resultQuantity:1}]},'kg'),false);
 assert.equal(previewYields(1,'caixa',model).length,0);
});
