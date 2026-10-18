import test from 'node:test';import assert from 'node:assert/strict';
import {validatePersonalProfile,earnedRecognition} from '../server/team/personal-rules.js';
test('somente campos pessoais estritos e turnos válidos',()=>{
 const p={displayName:' Jo ',bio:'Gosto de aprender',developmentGoal:'Montagem',preferredShift:'manha'};
 assert.equal(validatePersonalProfile(p).displayName,'Jo');
 assert.equal(validatePersonalProfile({...p,preferredShift:'admin'}),null);
 assert.equal(validatePersonalProfile({...p,bio:'x'.repeat(221)}),null);
 assert.equal(validatePersonalProfile({...p,displayName:42}),null);
});
test('pontos só refletem habilidades confirmadas',()=>{
 assert.deepEqual(earnedRecognition(null),{confirmed:0,assigned:0,points:0,level:'Primeiros passos'});
 const r=earnedRecognition({skills:['montagem','preparo'],certifications:['preparo']});
 assert.equal(r.points,100);assert.equal(r.confirmed,1);assert.equal(r.assigned,2);
});
