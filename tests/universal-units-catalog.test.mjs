import test from 'node:test';
import assert from 'node:assert/strict';
import {MASS_UNITS,VOLUME_UNITS,COUNT_UNITS,STOCK_UNITS,RECEIVING_UNITS,CATALOG_56_UNITS,PREPARED_OUTPUT_UNITS,RECIPE_RESULT_UNITS,INGREDIENT_UNITS,UNIT_LABELS,normalizeUnit,convertPhysical,convertPackage} from '../server/operations/unit-engine.js';
import {RECEIVING_UNITS as receivingUnits,STOCK_UNITS as stockUnits,inUnit,previewStock} from '../server/operations/receiving-model.js';
import {countUnit,validQuantity} from '../server/operations/logic.js';
import {validateOperationalProfile} from '../server/operations/v3-catalog-policy.js';

test('cadastro central define códigos únicos para o projeto e preserva alias legado ml',()=>{
 assert.equal(new Set(STOCK_UNITS).size,STOCK_UNITS.length);
 assert.equal(new Set(RECEIVING_UNITS).size,RECEIVING_UNITS.length);
 assert.deepEqual([...receivingUnits],RECEIVING_UNITS);
 assert.deepEqual([...stockUnits],STOCK_UNITS);
 for(const unit of [...MASS_UNITS,...VOLUME_UNITS,...COUNT_UNITS])assert.ok(UNIT_LABELS[unit]);
 assert.equal(normalizeUnit('ml'),'mL');
 assert.equal(normalizeUnit('kg'),'kg');
 assert.ok(RECEIVING_UNITS.includes('fardo'));
 for(const u of CATALOG_56_UNITS)assert.ok(STOCK_UNITS.includes(u));
 assert.deepEqual(CATALOG_56_UNITS,['kg','L','un']);
 for(const unit of PREPARED_OUTPUT_UNITS)assert.ok(STOCK_UNITS.includes(unit));
 for(const unit of INGREDIENT_UNITS)assert.ok(STOCK_UNITS.includes(unit));
 for(const unit of RECIPE_RESULT_UNITS)assert.ok(STOCK_UNITS.includes(unit)||unit==='balde');
 assert.ok(!STOCK_UNITS.includes('fardo'),'fardo requer regra específica de embalagem');
});
test('conversões universais preservam precisão e não inferem peso por unidade',()=>{
 assert.equal(convertPhysical({quantity:1,from:'kg',to:'g'}).quantity,1000);
 assert.equal(convertPhysical({quantity:1,from:'L',to:'ml'}).quantity,1000);
 assert.equal(inUnit(500,'ml','L'),0.5);
 assert.equal(inUnit(2,'L','mL'),2000);
 assert.equal(convertPhysical({quantity:2,from:'kg',to:'un'}).ok,false);
 assert.equal(previewStock(18,'kg',null,'un'),null);
 assert.equal(convertPackage({quantity:2,presentation:'fardo',to:'un'}).ok,false);
});
test('unidades são validadas igualmente entre catálogo operacional e contagem',()=>{
 const base={displayName:'Alcatra',controlMode:'quantitative',origin:'supplier',locations:['reserva','giro'],countUnit:'kg'};
 for(const unit of STOCK_UNITS){
   const p={...base,countUnit:unit};
   assert.equal(validateOperationalProfile(p).ok,true,unit);
   assert.equal(countUnit({unit:'kg',operationalUnitOverride:unit}),unit);
   assert.equal(validQuantity(1,{unit}),true);
 }
 assert.equal(validateOperationalProfile({...base,countUnit:'quilos'}).ok,false);
 assert.equal(validQuantity(1.5,{unit:'un'}),false);
 assert.equal(validQuantity(1.5,{unit:'porcao'}),false);
});
