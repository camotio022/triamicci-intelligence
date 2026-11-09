import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validSubscription,deviceId,allowedRecipient,noticeUrl} from '../server/push/policy.js';
import {queuePush,drainPush} from '../server/push/delivery.js';
const sub={endpoint:'https://web.push.apple.com/abc',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
test('browser push endpoints only: reject SSRF, credentials, ports and malformed keys',()=>{
 assert.equal(validSubscription(sub),true);
 for(const endpoint of ['http://web.push.apple.com/a','https://localhost/a','https://169.254.169.254/a','https://web.push.apple.com.evil.test/a','https://evil@web.push.apple.com/a','https://web.push.apple.com:444/a'])assert.equal(validSubscription({...sub,endpoint}),false,endpoint);
 assert.equal(validSubscription({...sub,keys:{}}),false);assert.equal(deviceId(sub.endpoint),deviceId(sub.endpoint));
});
test('delivery requires current active unit and manager audience role',()=>{
 assert.equal(allowedRecipient({status:'active',unitId:'a',role:'cook'},'a','member'),true);
 assert.equal(allowedRecipient({status:'inactive',unitId:'a',role:'manager'},'a','managers'),false);
 assert.equal(allowedRecipient({status:'active',unitId:'b',role:'manager'},'a','managers'),false);
 assert.equal(allowedRecipient({status:'active',unitId:'a',role:'cook'},'a','managers'),false);
 assert.equal(allowedRecipient({status:'active',unitId:'a',role:'submanager'},'a','managers'),true);
 assert.equal(new URL(noticeUrl('https://evil.test','a'),'https://app.test').searchParams.get('page'),'my-profile');
});
function memoryDb(){
 const rows=new Map();const stamp=v=>v instanceof Date?{toMillis:()=>v.getTime()}:v;
 const convert=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,stamp(x)]));
 const snap=path=>({id:path.split('/').at(-1),exists:rows.has(path),data:()=>rows.get(path),ref:doc(path)});
 const doc=path=>({path,collection:name=>collection(path+'/'+name),get:async()=>snap(path),update:async v=>rows.set(path,{...rows.get(path),...convert(v)}),delete:async()=>rows.delete(path)});
 const collection=(path,filters=[],max=Infinity)=>({path,doc:id=>doc(path+'/'+(id||'signal')),where:(k,op,v)=>collection(path,[...filters,[k,v]],max),limit:n=>collection(path,filters,n),get:async()=>({docs:[...rows.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1&&filters.every(([f,v])=>rows.get(k)[f]===v)).slice(0,max).map(snap)})});
 return {rows,doc,collection,runTransaction:async fn=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v)=>writes.push(()=>rows.set(r.path,convert(v))),create:(r,v)=>writes.push(()=>{assert.ok(!rows.has(r.path));rows.set(r.path,convert(v))}),update:(r,v)=>writes.push(()=>rows.set(r.path,{...rows.get(r.path),...convert(v)}))});writes.forEach(w=>w());return result}};
}
function seed(db,uid='u',unitId='a',role='cook'){
 db.rows.set('memberships/'+uid,{status:'active',unitId,role});
 db.rows.set('pushDevices/device-'+uid,{uid,unitId,subscription:sub});
}
async function enqueue(db,event='one',opts={uid:'u',title:'Aviso'}){await db.runTransaction(async tx=>queuePush(tx,db,'a',event,opts))}
process.env.WEB_PUSH_PUBLIC_KEY='test';process.env.WEB_PUSH_PRIVATE_KEY='test';process.env.PUBLIC_APP_URL='https://app.test';
test('committed outbox delivers once; retry does not duplicate inbox; removed device is pruned',async()=>{
 const db=memoryDb();seed(db);await enqueue(db);let calls=0;
 await drainPush('a',{db,transport:async()=>{calls++}});await drainPush('a',{db,transport:async()=>{calls++}});
 assert.equal(calls,1);assert.equal(db.rows.get('units/a/pushOutbox/one').state,'sent');assert.ok(db.rows.has('units/a/memberNotifications/u/items/one'));
 await enqueue(db,'gone');await drainPush('a',{db,transport:async()=>{throw {statusCode:410}}});assert.equal(db.rows.has('pushDevices/device-u'),false);
});
test('transient failure remains queued and succeeds on next drain without duplicate inbox',async()=>{
 const db=memoryDb();seed(db);await enqueue(db);
 await drainPush('a',{db,transport:async()=>{throw {statusCode:503}}});assert.equal(db.rows.get('units/a/pushOutbox/one').state,'pending');
 let calls=0;await drainPush('a',{db,transport:async()=>{calls++}});assert.equal(calls,1);assert.equal(db.rows.get('units/a/pushOutbox/one').state,'sent');
});
test('unit transfer or loss of manager role prevents delivery',async()=>{
 const db=memoryDb();seed(db,'u','b');await enqueue(db);let calls=0;
 await drainPush('a',{db,transport:async()=>{calls++}});assert.equal(calls,0);
 const other=memoryDb();seed(other);await enqueue(other,'managers',{audience:'managers',title:'Gestão'});await drainPush('a',{db:other,transport:async()=>{calls++}});assert.equal(calls,0);
});
test('worker displays background push and limits click navigation to same origin',async()=>{
 const handlers={},shown=[],opened=[];const self={location:{origin:'https://app.test'},addEventListener:(type,fn)=>handlers[type]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(readFileSync(new URL('../public/push-sw.js',import.meta.url),'utf8'),{self,URL});
 let pending;handlers.push({data:{json:()=>({title:'Aviso',url:'https://evil.test'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown[0][1].data.url,'https://app.test/');
 handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>pending=p});await pending;assert.equal(opened.length,0);
 handlers.notificationclick({notification:{close(){},data:{url:'https://app.test/?page=leave-requests'}},waitUntil:p=>pending=p});await pending;assert.equal(opened[0],'https://app.test/?page=leave-requests');
});
test('test notification targets only the requested device',async()=>{
 const db=memoryDb();seed(db);db.rows.set('pushDevices/second',{uid:'u',unitId:'a',subscription:{...sub,endpoint:'https://fcm.googleapis.com/second'}});
 await enqueue(db,'device-test',{uid:'u',targetDevice:'device-u',title:'Teste'});const endpoints=[];
 await drainPush('a',{db,eventId:'device-test',transport:async s=>endpoints.push(s.endpoint)});assert.deepEqual(endpoints,[sub.endpoint]);
});
test('failed transaction never leaves a push event to deliver',async()=>{
 const db=memoryDb();await assert.rejects(db.runTransaction(async tx=>{queuePush(tx,db,'a','rollback',{uid:'u',title:'Aviso'});throw Error('business rejected')}));
 assert.equal(db.rows.has('units/a/pushOutbox/rollback'),false);
});
