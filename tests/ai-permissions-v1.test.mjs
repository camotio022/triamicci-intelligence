import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_CAPABILITIES,AI_READS,AI_ANALYSES,AI_DRAFTS,AI_WRITES,aiAllowed,requireAiAccess,aiDraftType} from '../server/ai/permissions-v1.js';
import {classifyAiV1,aiV1Context} from '../server/ai/context-v1.js';
import {validateAiDraft} from '../server/ai/drafts-handler.js';

test('contract is closed to all roles outside management and unknown capabilities',()=>{
 for(const role of ['cook','auxiliar',undefined,null,'guest']){
  for(const capability of Object.keys(AI_CAPABILITIES))assert.equal(aiAllowed(role,capability),false);
 }
 for(const role of ['admin','manager','submanager']){
  for(const capability of Object.keys(AI_CAPABILITIES))assert.equal(aiAllowed(role,capability),true);
  assert.equal(aiAllowed(role,'inventory.commit'),false);
 }
 assert.equal(requireAiAccess({unitId:'barigui',status:'inactive',role:'manager'},'stock'),false);
 assert.equal(requireAiAccess({unitId:'barigui',status:'active',role:'manager'},'stock'),true);
 assert.deepEqual(AI_WRITES,[]);
 assert.equal(AI_READS.length,9);
 assert.equal(AI_ANALYSES.length,7);
 assert.equal(AI_DRAFTS.length,6);
});
test('classifies current attendance, shifts and connected-session queries',()=>{
 assert.equal(classifyAiV1('Quem está logado agora?').sessions,true);
 assert.equal(classifyAiV1('Quem pode dobrar hoje no turno da noite?').schedules,true);
 assert.equal(classifyAiV1('Quem pode dobrar hoje no turno da noite?').team,true);
 assert.equal(classifyAiV1('Como está o recebimento?').receiving,true);
});
test('status connected is not inferred from schedule or presence, and no false data is fetched',async()=>{
 let requested=0;
 const db={collection:()=>{requested++;return {doc:()=>({collection:()=>({})})}}};
 const result=await aiV1Context(db,{unitId:'barigui',role:'manager'},'Quem está logado?');
 assert.equal(requested,1);
 assert.equal(result.sections.length,0);
 assert.match(result.unavailable.join(' '),/sem fonte/);
});
test('draft contract refuses operational verbs and invalid content',()=>{
 for(const type of ['approve','publish','finish','inventoryCommit','scheduleApply'])assert.equal(aiDraftType(type),false);
 assert.equal(validateAiDraft({type:'recipeDraft',title:'Molho',body:'Proposta sem execução'}).type,'recipeDraft');
 assert.equal(validateAiDraft({type:'productionDraft',title:'Produção',body:'Proposta de registro'}).type,'productionDraft');
 assert.equal(validateAiDraft({type:'finish',title:'Produção',body:'Alterar saldo agora'}),null);
 assert.equal(validateAiDraft({type:'recipeDraft',title:'x',body:'y'}),null);
});
