import test from 'node:test';
import assert from 'node:assert/strict';
import {saveConversation} from '../server/ai/history-handler.js';

test('conversation is saved under current unit and current user only, preserving order',async()=>{
 let path='',stored=null;
 const db={collection:(v)=>{path=v;return {doc:unitId=>({collection:kind=>({doc:uid=>({collection:leaf=>({doc:id=>({id,path:[unitId,kind,uid,leaf,id].join('/')})})})})})}}};
 db.runTransaction=async cb=>cb({
  get:async()=>({exists:!!stored,data:()=>stored}),
  set:(ref,value)=>{path=ref.path;stored=value;}
 });
 const id='12345678-1234-4234-8234-123456789abc';
 assert.equal(await saveConversation(db,'unit-a','user-a',id,'Como está a produção?','Há três tarefas.'),true);
 assert.equal(path,'unit-a/aiConversations/user-a/threads/'+id);
 assert.deepEqual(stored.messages.map(x=>x.role),['user','assistant']);
 assert.equal(stored.messages[0].hasPhoto,false);
 assert.equal(await saveConversation(db,'unit-a','user-a',id,'Outra pergunta','Outra resposta',true),true);
 assert.deepEqual(stored.messages.map(x=>x.role),['user','assistant','user','assistant']);
 assert.equal(stored.messages[2].hasPhoto,true);
 assert.equal(stored.messages[2].text,'Outra pergunta');
});
test('invalid thread id cannot persist history',async()=>{
 assert.equal(await saveConversation({collection(){throw Error('must not access database')}},'u','a','not-an-id','x','y'),false);
});
