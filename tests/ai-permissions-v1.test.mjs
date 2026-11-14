import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_CAPABILITIES,AI_READS,AI_ANALYSES,AI_DRAFTS,AI_WRITES,aiAllowed,requireAiAccess,aiDraftType} from '../server/ai/permissions-v1.js';
import {classifyAiV1,aiV1Context,rosterDirectory,summarizeScheduleDocs} from '../server/ai/context-v1.js';
import {validateAiDraft} from '../server/ai/drafts-handler.js';
import {draftIntent} from '../server/ai/draft-generation.js';
import {draftDisplayTitle,draftPromptGuidance} from '../src/ai-draft-presentation.js';

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

test('only explicit draft preparation triggers AI draft creation',()=>{
 assert.equal(draftIntent('Quem está logado agora?'),null);
 assert.equal(draftIntent('Quem pode dobrar hoje?'),null);
 assert.equal(draftIntent('Prepare uma notificação para a equipe'),'notificationDraft');
 assert.equal(draftIntent('Crie um rascunho de ficha técnica'),'recipeDraft');
 assert.equal(draftIntent('Monte uma proposta de escala'),'scheduleDraft');
 assert.equal(draftIntent('Faça um rascunho de cobertura'),'coverageDraft');
});

test('draft titles are short, stable and preserve legacy records',()=>{
 assert.equal(draftDisplayTitle('planDraft','Crie um rascunho de planejamento de produção com base na fotografia ...'),'Planejamento de produção');
 assert.equal(draftDisplayTitle('scheduleDraft','Monte uma proposta de escala'),'Proposta de escala');
 assert.equal(draftDisplayTitle('coverageDraft'),'Solicitação de cobertura');
 assert.equal(draftDisplayTitle('unknown','Rascunho livre'),'Rascunho livre');
 assert.ok(draftPromptGuidance('planDraft').includes('## Itens planejados'));
 assert.ok(draftPromptGuidance('planDraft').includes('sem alegar que foi publicado ou executado'));
});

test('AI schedule resolves names from unit registry and never sends internal staff identifiers',()=>{
 const day='2026-11-14',wrap=(id,data)=>({id,data:()=>data});
 const directory=rosterDirectory([
  wrap('staff_123',{name:'Rodolfo',status:'active',jobTitle:'Cozinheiro',sector:'cozinha',shift:'noite',availability:[{day:'sab',start:'14:00',end:'22:20'}]}),
  wrap('staff_456',{name:'Judson',accountUid:'auth-01',status:'active',jobTitle:'Subgerente',shift:'noite',availability:[{day:'sab',start:'14:00',end:'22:20'}]})
 ]);
 const entries=[{uid:'staff_123',date:day,type:'work'}, {uid:'auth-01',date:day,type:'work'},{uid:'staff_999',date:day,type:'off'}];
 const records=summarizeScheduleDocs([wrap('schedule',{status:'published',entries})],directory,day);
 assert.equal(records[0].entries[0].name,'Rodolfo');
 assert.equal(records[0].entries[0].role,'Cozinheiro');
 assert.equal(records[0].entries[0].plannedStart,'14:00');
 assert.equal(records[0].entries[0].timeSource,'disponibilidade habitual');
 assert.equal(records[0].entries[1].name,'Judson');
 assert.equal(records[0].entries[2].name,'Colaborador sem identificação confirmada');
 assert.equal(records[0].entries[2].nameConfirmed,false);
 assert.equal(JSON.stringify(records).includes('staff_123'),false);
 assert.equal(JSON.stringify(records).includes('auth-01'),false);
});
test('AI schedule distinguishes unpublished schedules and explicitly scheduled hours',()=>{
 const wrap=(data)=>({data:()=>data});
 const directory=rosterDirectory([{id:'uid2',data:()=>({name:'Patrícia',availability:[]})}]);
 const items=summarizeScheduleDocs([
  wrap({status:'draft',entries:[{uid:'uid2',date:'2026-11-14',type:'work'}]}),
  wrap({status:'published',entries:[{uid:'uid2',date:'2026-11-14',type:'work',start:'08:00',end:'16:20'}]})
 ],directory,'2026-11-14');
 assert.equal(items.length,1);
 assert.equal(items[0].entries[0].timeSource,'escala');
 assert.equal(items[0].entries[0].plannedEnd,'16:20');
});
