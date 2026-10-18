import test from 'node:test';
import assert from 'node:assert/strict';
import {staffSeed,reconcileStaff,normalizeStaffName} from '../server/team/master-registry.js';
test('levantamento contém doze colaboradores e exclui desligados',()=>{
 assert.equal(staffSeed.length,12);
 assert.equal(staffSeed.some(x=>['Daniel','Geraldo'].includes(x.name)),false);
 assert.equal(staffSeed.find(x=>x.name==='Judson').jobTitle,'Subgerente');
 assert.equal(staffSeed.find(x=>x.name==='Edielson').jobTitle,'Gerente');
});
test('acentos e espaços são normalizados para sinalização, não para vínculo',()=>{
 assert.equal(normalizeStaffName('  SUBERLÂNIO '),'suberlanio');
 const results=reconcileStaff(staffSeed,[],[{uid:'u123',name:'Temotio'}]);
 assert.equal(results.find(x=>x.name==='Temotio').state,'needs_review');
 assert.equal(results.find(x=>x.name==='Temotio').accountMatches,1);
 assert.equal(results.find(x=>x.name==='Temotio').registryId,null);
});
test('fichas existentes e ambiguidades bloqueiam nova importação',()=>{
 const one=reconcileStaff(staffSeed,[{id:'abc',name:'Patricia'}],[]);
 assert.equal(one.find(x=>x.name==='Patrícia').state,'existing');
 const multiple=reconcileStaff(staffSeed,[{id:'a',name:'Francisco'},{id:'b',name:'Francisco'}],[]);
 assert.equal(multiple.find(x=>x.name==='Francisco').state,'ambiguous');
});
