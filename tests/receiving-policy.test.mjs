import test from 'node:test';
import assert from 'node:assert/strict';
import {receivingConflict} from '../server/operations/receiving-policy.js';
const product={unit:'kg',receivingUnitOverride:'kg'},profile={controlMode:'quantitative',countUnit:'un',receivingPresentation:'kg'};
test('recebimento respeita unidade comercial revisada sem converter kg em peças',()=>{assert.equal(receivingConflict(product,profile,{commercialUnit:'kg',commercialQuantity:2,stockQuantity:4}),null);assert.equal(receivingConflict(product,profile,{commercialUnit:'L',commercialQuantity:2,stockQuantity:4}),'RECEIVING_UNIT')});
test('mesma unidade exige igualdade entre quantidade recebida e física',()=>{const cfg={...profile,countUnit:'kg'};assert.equal(receivingConflict(product,cfg,{commercialUnit:'kg',commercialQuantity:2,stockQuantity:20}),'RECEIVING_QUANTITY');assert.equal(receivingConflict(product,cfg,{commercialUnit:'kg',commercialQuantity:2.125,stockQuantity:2.125}),null)});
test('unidade revisada prevalece sobre apresentação antiga e aceita a grafia mL',()=>{assert.equal(receivingConflict({...product,receivingUnitOverride:'mL'},{...profile,countUnit:'ml'},{commercialUnit:'ml',commercialQuantity:10,stockQuantity:10}),null);assert.equal(receivingConflict(product,profile,{commercialUnit:'kg',commercialQuantity:2,stockQuantity:1.5}),'QUANTITY')});

import {receivingLineError,receivingUnit} from '../server/operations/receiving-input.js';
test('formulário aplica a unidade revisada e impede quantidade física inflada',()=>{const cfg={...profile,countUnit:'kg',locations:['reserva']};assert.equal(receivingUnit({...cfg,receivingPresentation:'un'},product),'kg');assert.match(receivingLineError({commercialUnit:'L',commercialQuantity:'2',stockQuantity:'2',location:'reserva'},cfg,product),/unidade/);assert.match(receivingLineError({commercialUnit:'kg',commercialQuantity:'2',stockQuantity:'20',location:'reserva'},cfg,product),/igual/)});
