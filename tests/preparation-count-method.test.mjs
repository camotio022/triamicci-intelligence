import test from 'node:test';
import assert from 'node:assert/strict';
import {countFromPortions} from '../server/production/count-method.js';
const convert=(portions,loose,unit='kg',portionSize=.5)=>countFromPortions({portions,loose,unit,portionSize});
test('porções e peso avulso produzem um único saldo físico',()=>{assert.equal(convert('16','4'),12);assert.equal(convert('0','0'),0);assert.equal(convert('4','0'),2);assert.equal(convert('10','250','g',500),5250);});
test('contagem não presume peso, não arredonda quantidade fictícia e recusa valores inválidos',()=>{for(const value of ['','-1','1.5','1,5','abc','NaN'])assert.equal(convert(value,'0'),null);assert.equal(convert('2',''),null);assert.equal(convert('2','0','un'),null);assert.equal(convert('2','0','kg',0),null);assert.equal(convert('2','0','kg',1/3),null);});
