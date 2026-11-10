import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessPage,isManagement} from '../server/permissions/v31-policy.js';
import {validateStorage} from '../server/storage/storage-model.js';
test('equipe pode conferir, apenas gestão altera configurações',()=>{
 for(const role of ['admin','manager','submanager','cook','auxiliar'])assert.equal(canAccessPage(role,'storages'),true);
 assert.equal(isManagement('cook'),false);
 assert.equal(isManagement('auxiliar'),false);
 for(const role of ['admin','manager','submanager'])assert.equal(isManagement(role),true);
});
test('tipos de conferência e controle de validade são configuráveis',()=>{
 const base={name:'Carnes e congelados',icon:'snowflake',area:'reserva',frequency:'daily',weekdays:[]};
 for(const mode of ['by_product','quantitative','availability'])assert.equal(validateStorage({...base,countMode:mode}),null);
 assert.equal(validateStorage({...base,expiryPolicy:'none',expiryDays:null}),null);
 assert.equal(validateStorage({...base,expiryPolicy:'days',expiryDays:10}),null);
 assert.ok(validateStorage({...base,expiryPolicy:'days',expiryDays:null}));
 assert.ok(validateStorage({...base,countMode:'invented'}));
 assert.ok(validateStorage({...base,expiryPolicy:'invented'}));
});
