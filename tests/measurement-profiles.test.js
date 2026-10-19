import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackageConfiguration} from '../api/products/measurements.js';
const good={presentation:'caixa',fixed:true,validated:true,contentQuantity:12,contentUnit:'un',evidence:'Etiqueta do fornecedor: 12 unidades'};
test('salva somente embalagens com dados comprovados',()=>{
 const result=validatePackageConfiguration({packages:[good]});
 assert.equal(result.ok,true);assert.equal(result.packages[0].contentQuantity,12);
});
test('recusa conversões não homologadas e conteúdo incompleto',()=>{
 for(const value of [
  {...good,validated:false},
  {...good,evidence:''},
  {...good,contentQuantity:0},
  {...good,contentUnit:'pacote'},
  {...good,contentQuantity:NaN},
  {...good,contentUnit:'kg',fixed:false}
 ])assert.equal(validatePackageConfiguration({packages:[value]}).ok,false);
});
test('peso variável permanece sem valor presumido',()=>{
 const r=validatePackageConfiguration({packages:[{presentation:'pacote',fixed:false,validated:false,contentQuantity:null,contentUnit:null,evidence:null}]});
 assert.equal(r.ok,true);assert.equal(r.packages[0].contentQuantity,null);
});
test('não aceita apresentação duplicada',()=>{
 assert.equal(validatePackageConfiguration({packages:[good,good]}).ok,false);
});
