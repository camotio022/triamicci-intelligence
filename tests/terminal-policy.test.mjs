import test from 'node:test';import assert from 'node:assert/strict';
import {sessionValid,digest,matches,verifyTerminalCredential,IDLE_MS} from '../server/terminals/policy.js';
const now=1000000,secret='s'.repeat(43);
const session={id:'a'.repeat(43),terminalId:'b'.repeat(43),uid:'person',unitId:'unit',role:'auxiliar',state:'active',idleUntil:new Date(now+IDLE_MS),expiresAt:new Date(now+3600000)};
const terminal={id:session.terminalId,unitId:'unit',state:'active',activeSessionId:session.id},member={unitId:'unit',role:'auxiliar',status:'active'};
test('terminal session requires current membership, same unit/role and active device pointer',()=>{
 assert.equal(sessionValid(session,terminal,member,now),true);
 for(const [s,t,m] of [[{...session,state:'ended'},terminal,member],[session,{...terminal,state:'revoked'},member],[session,{...terminal,activeSessionId:'other'},member],[session,terminal,{...member,status:'inactive'}],[session,terminal,{...member,role:'manager'}],[session,terminal,{...member,unitId:'other'}],[session,{...terminal,unitId:'other'},member]])assert.equal(sessionValid(s,t,m,now),false);
});
test('idle and absolute expiry are enforced independently of browser timers',()=>{
 assert.equal(sessionValid(session,terminal,member,now+IDLE_MS),false);assert.equal(sessionValid({...session,expiresAt:new Date(now)},terminal,member,now),false);assert.equal(sessionValid(null,terminal,member,now),false);
});
test('high entropy secrets are hashed and verified without accepting malformed credentials',async()=>{
 assert.equal(matches(secret,digest(secret)),true);assert.equal(matches('x'.repeat(43),digest(secret)),false);assert.equal(matches('bad',digest(secret)),false);
 const docs={['terminalSessions/'+session.id]:{...session,secretHash:digest(secret)},['terminals/'+terminal.id]:terminal,'memberships/person':member};
 const db={doc:path=>({get:async()=>({id:path.split('/').at(-1),exists:path in docs,data:()=>docs[path]}),update:async patch=>{docs[path]={...docs[path],...patch}}})};
 assert.equal((await verifyTerminalCredential('ts1.'+session.id+'.'+secret,db,now)).member.role,'auxiliar');
 await assert.rejects(verifyTerminalCredential('ts1.'+session.id+'.'+'z'.repeat(43),db,now),/UNAUTHENTICATED/);
 await assert.rejects(verifyTerminalCredential('ts1.short.bad',db,now),/UNAUTHENTICATED/);
 docs['terminals/'+terminal.id]={...terminal,state:'revoked'};await assert.rejects(verifyTerminalCredential('ts1.'+session.id+'.'+secret,db,now),/UNAUTHENTICATED/);
});
