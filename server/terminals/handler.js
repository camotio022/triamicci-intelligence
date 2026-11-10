import {randomBytes,randomInt} from 'node:crypto';
import {authenticate,membership,getDb,checkRequest,send} from '../_lib.js';
import {MANAGEMENT_ROLES} from '../permissions/v31-policy.js';
import {sendQuotaError} from '../quota-error.js';
import {digest,matches,keyPattern,millis,sessionValid,verifyTerminalCredential,IDLE_MS,PAIR_MS,SESSION_MS} from './policy.js';
const key=()=>randomBytes(32).toString('base64url');
const requireKey=value=>{if(!keyPattern.test(value||''))throw Error('INVALID_INPUT');return value};
const audit=(tx,db,event,data)=>tx.create(db.collection('auditLogs').doc(),{event,at:new Date(),...data});
const publicMember=m=>({unitId:m.unitId,role:m.role,status:m.status,name:m.name||'',email:m.email||''});
function stream(req,res,attach,timeout,renew=false){
 res.status(200);res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store, no-transform');res.setHeader('X-Accel-Buffering','no');res.flushHeaders?.();
 return new Promise(resolve=>{
  let stopped=false,stops=[],timer,pulse;
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);clearInterval(pulse);for(const fn of stops)fn();res.end();resolve()};
  const emit=data=>{if(!stopped)res.write(JSON.stringify(data)+'\n')};
  res.on('close',stop);timer=setTimeout(()=>{if(renew)emit({state:'renew'});stop()},timeout);timer.unref?.();
  if(renew){pulse=setInterval(()=>emit({state:'keepalive'}),20000);pulse.unref?.()}
  try{stops=attach(emit,stop);if(stopped)for(const fn of stops)fn()}catch{emit({state:'unavailable'});stop()}
 });
}
export default async function terminals(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 const db=getDb(),{action}=req.body||{},now=Date.now();
 try{
  if(action==='forgetDevice'){
   const id=requireKey(req.body.terminalId),ref=db.doc('terminals/'+id);
   await db.runTransaction(async tx=>{const d=await tx.get(ref);if(!d.exists||!matches(req.body.deviceSecret,d.data().secretHash))throw Error('FORBIDDEN');const active=d.data().activeSessionId?await tx.get(db.doc('terminalSessions/'+d.data().activeSessionId)):null;if(active?.exists)tx.update(active.ref,{state:'ended',endedAt:new Date()});tx.update(ref,{state:'revoked',revokedAt:new Date()});audit(tx,db,'terminal.forgotten',{unitId:d.data().unitId,terminalId:id})});
   return send(res,200,'Navegador desvinculado.');
  }
  if(action==='pairStart'){
   const {terminalId,deviceSecret,requestId,browserSecret,scanSecret}=req.body;
   [terminalId,requestId,browserSecret,scanSecret].forEach(requireKey);
   const ref=db.doc('terminals/'+terminalId),pair=db.doc('terminalRequests/'+requestId);
   let expiresAt,code;
   await db.runTransaction(async tx=>{
    const [d,old]=await Promise.all([tx.get(ref),tx.get(pair)]),t=d.data();
    if(!d.exists||t.state!=='active'||!matches(deviceSecret,t.secretHash))throw Error('FORBIDDEN');
    if(old.exists){const p=old.data();if(p.terminalId!==terminalId||!matches(browserSecret,p.browserHash)||p.state!=='pending'||millis(p.expiresAt)<=now)throw Error('EXPIRED');expiresAt=millis(p.expiresAt);code=p.code;return}
    if(now-millis(t.lastPairAt||0)<PAIR_MS)throw Error('RATE_LIMIT');
    expiresAt=now+PAIR_MS;code=String(randomInt(1000,10000));
    tx.create(pair,{terminalId,unitId:t.unitId,name:t.name,state:'pending',browserHash:digest(browserSecret),scanHash:digest(scanSecret),code,createdAt:new Date(now),expiresAt:new Date(expiresAt)});
    tx.update(ref,{lastPairAt:new Date(now),pendingId:requestId});
   });
   return send(res,200,'Escaneie pelo celular.',{requestId,code,expiresAt});
  }
  if(['pairWatch','pairRedeem'].includes(action)){
   const {requestId,browserSecret}=req.body;requireKey(requestId);
   const ref=db.doc('terminalRequests/'+requestId),snap=await ref.get(),p=snap.data();
   if(!snap.exists||!matches(browserSecret,p.browserHash))throw Error('FORBIDDEN');
   if(millis(p.expiresAt)<=now)throw Error('EXPIRED');
   if(action==='pairWatch')return stream(req,res,(emit,stop)=>[ref.onSnapshot(s=>{const v=s.data();emit({state:millis(v?.expiresAt)<=Date.now()?'expired':v?.state||'expired'});if(v?.state!=='pending')stop()},()=>{emit({state:'unavailable'});stop()})],Math.min(PAIR_MS,millis(p.expiresAt)-now));
   const sessionId=key(),secret=key(),sessionRef=db.doc('terminalSessions/'+sessionId);
   let result;
   await db.runTransaction(async tx=>{
    const current=await tx.get(ref),v=current.data();
    if(!current.exists||v.state!=='approved'||millis(v.expiresAt)<=Date.now()||!matches(browserSecret,v.browserHash))throw Error('EXPIRED');
    const deviceRef=db.doc('terminals/'+v.terminalId),[device,person]=await Promise.all([tx.get(deviceRef),tx.get(db.doc('memberships/'+v.uid))]),t=device.data(),m=person.data();
    if(!device.exists||t.state!=='active'||t.pendingId!==requestId||!person.exists||m.status!=='active'||m.unitId!==v.unitId||m.role!==v.role)throw Error('FORBIDDEN');
    if(t.activeSessionId){const oldRef=db.doc('terminalSessions/'+t.activeSessionId),old=await tx.get(oldRef);if(old.exists)tx.update(oldRef,{state:'ended',endedAt:new Date()})}
    const started=Date.now();
    tx.create(sessionRef,{terminalId:v.terminalId,terminalName:t.name,uid:v.uid,unitId:v.unitId,role:m.role,state:'active',secretHash:digest(secret),createdAt:new Date(started),idleUntil:new Date(started+IDLE_MS),expiresAt:new Date(started+SESSION_MS)});
    tx.update(deviceRef,{activeSessionId:sessionId,pendingId:null});tx.update(ref,{state:'consumed',consumedAt:new Date(started)});
    audit(tx,db,'terminal.session_started',{uid:v.uid,unitId:v.unitId,terminalId:v.terminalId,sessionId});
    result={credential:'ts1.'+sessionId+'.'+secret,uid:v.uid,membership:publicMember(m),terminal:{id:v.terminalId,name:t.name,unitId:v.unitId}};
   });
   return send(res,200,'Entrada autorizada.',result);
  }
  if(['sessionWatch','sessionTouch','sessionEnd'].includes(action)){
   const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1]||'';
   const verified=await verifyTerminalCredential(token,db),{session,terminal,member}=verified;
   const ref=db.doc('terminalSessions/'+session.id);
   if(action==='sessionEnd'){
    await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.state==='active'){tx.update(ref,{state:'ended',endedAt:new Date()});audit(tx,db,'terminal.session_ended',{uid:session.uid,unitId:session.unitId,terminalId:terminal.id,sessionId:session.id})}});
    return send(res,200,'Sessão encerrada.');
   }
   if(action==='sessionTouch'){
    await db.runTransaction(async tx=>{const [a,b,c]=await Promise.all([tx.get(ref),tx.get(db.doc('terminals/'+terminal.id)),tx.get(db.doc('memberships/'+session.uid))]);if(!sessionValid({...a.data(),id:a.id},{...b.data(),id:b.id},c.data()))throw Error('UNAUTHENTICATED');tx.update(ref,{idleUntil:new Date(Date.now()+IDLE_MS)})});
    return send(res,200,'Sessão ativa.',{idleUntil:Date.now()+IDLE_MS});
   }
   return stream(req,res,(emit,stop)=>{
    let s=session,t=terminal,m=member,live={},ready=new Set(),expiry;
    const deliver=()=>{if(ready.size!==4)return;clearTimeout(expiry);if(!sessionValid(s,t,m)){emit({state:'ended'});stop();if(s.state==='active')ref.update({state:'ended',endedAt:new Date(),endReason:'expired-or-access-changed'}).catch(()=>{});return}emit({state:'active',uid:s.uid,membership:publicMember(m),terminal:{id:t.id,name:t.name,unitId:t.unitId},live,idleUntil:millis(s.idleUntil)});expiry=setTimeout(deliver,Math.max(1,Math.min(millis(s.idleUntil),millis(s.expiresAt))-Date.now()+1));expiry.unref?.()};
    const failed=()=>{emit({state:'unavailable'});stop()};
    const stops=[ref.onSnapshot(d=>{s={...d.data(),id:d.id};ready.add('s');deliver()},failed),db.doc('terminals/'+terminal.id).onSnapshot(d=>{t={...d.data(),id:d.id};ready.add('t');deliver()},failed),db.doc('memberships/'+session.uid).onSnapshot(d=>{m=d.data();ready.add('m');deliver()},failed),db.doc('units/'+session.unitId+'/live/attendance').onSnapshot(d=>{live=d.data()||{};ready.add('l');deliver()},failed)];
    return [...stops,()=>clearTimeout(expiry)];
   },240000,true);
  }
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)throw Error('FORBIDDEN');
  // An already delegated terminal may not approve another computer or administer devices.
  if(actor.terminalSessionId)throw Error('FORBIDDEN');
  const manager=MANAGEMENT_ROLES.includes(m.role);
  if(['pairDetails','pairApprove'].includes(action)){
   const {requestId,scanSecret}=req.body;requireKey(requestId);
   const ref=db.doc('terminalRequests/'+requestId);let view;
   await db.runTransaction(async tx=>{
    const p=await tx.get(ref),v=p.data();
    if(!p.exists||!matches(scanSecret,v.scanHash)||v.unitId!==m.unitId)throw Error('FORBIDDEN');
    if(v.state!=='pending'||millis(v.expiresAt)<=Date.now())throw Error('EXPIRED');
    const [d,a]=await Promise.all([tx.get(db.doc('terminals/'+v.terminalId)),tx.get(db.doc('memberships/'+actor.uid))]),current=a.data();
    if(d.data()?.state!=='active'||d.data()?.pendingId!==requestId||current?.status!=='active'||current.unitId!==v.unitId)throw Error('FORBIDDEN');
    view={terminalName:v.name,unitId:v.unitId,code:v.code,expiresAt:millis(v.expiresAt),name:current.name||current.email||actor.uid,role:current.role};
    if(action==='pairApprove'){
     if(req.body.confirm!==true||req.body.code!==v.code)throw Error('INVALID_INPUT');
     tx.update(ref,{state:'approved',uid:actor.uid,role:current.role,approvedAt:new Date()});
     audit(tx,db,'terminal.entry_approved',{uid:actor.uid,unitId:v.unitId,terminalId:v.terminalId,requestId});
    }
   });
   return send(res,200,action==='pairApprove'?'Entrada autorizada. Confira o computador.':'Confira antes de autorizar.',view);
  }
  if(action==='register'){
   if(!manager)throw Error('FORBIDDEN');
   const name=typeof req.body.name==='string'?req.body.name.trim():'';
   if(name.length<3||name.length>60)throw Error('INVALID_INPUT');
   const id=key(),secret=key();
   await db.runTransaction(async tx=>{
    const [a,devices]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(db.collection('terminals').where('unitId','==',m.unitId).where('state','==','active').limit(21))]);
    if(a.data()?.status!=='active'||a.data()?.unitId!==m.unitId||!MANAGEMENT_ROLES.includes(a.data()?.role))throw Error('FORBIDDEN');
    if(devices.size>=20)throw Error('LIMIT');
    tx.create(db.doc('terminals/'+id),{name,unitId:m.unitId,state:'active',secretHash:digest(secret),createdAt:new Date(),createdBy:actor.uid,activeSessionId:null});audit(tx,db,'terminal.registered',{uid:actor.uid,unitId:m.unitId,terminalId:id,name});
   });
   return send(res,201,'Navegador cadastrado.',{terminal:{id,secret,name,unitId:m.unitId}});
  }
  if(action==='devices'){
   if(!manager)throw Error('FORBIDDEN');
   const snap=await db.collection('terminals').where('unitId','==',m.unitId).where('state','==','active').limit(21).get();
   return send(res,200,'Terminais da unidade.',{terminals:snap.docs.map(d=>({id:d.id,name:d.data().name,state:d.data().state,unitId:d.data().unitId}))});
  }
  if(action==='sessions'){
   const snap=await db.collection('terminalSessions').where('uid','==',actor.uid).where('state','==','active').limit(101).get();
   return send(res,200,'Suas sessões.',{sessions:snap.docs.filter(d=>d.data().unitId===m.unitId&&d.data().state==='active'&&millis(d.data().expiresAt)>now&&millis(d.data().idleUntil)>now).map(d=>({id:d.id,terminalId:d.data().terminalId,terminalName:d.data().terminalName||'Caixa',createdAt:millis(d.data().createdAt)}))});
  }
  if(['revokeDevice','revokeSession'].includes(action)){
   const id=requireKey(req.body.id),deviceAction=action==='revokeDevice';
   if(deviceAction&&!manager)throw Error('FORBIDDEN');
   const ref=db.doc((deviceAction?'terminals/':'terminalSessions/')+id);
   await db.runTransaction(async tx=>{const [s,a]=await Promise.all([tx.get(ref),tx.get(db.doc('memberships/'+actor.uid))]),v=s.data(),current=a.data();
    if(!s.exists||v.unitId!==current?.unitId||current?.status!=='active'||(deviceAction?!MANAGEMENT_ROLES.includes(current.role):v.uid!==actor.uid))throw Error('FORBIDDEN');
    const active=deviceAction&&v.activeSessionId?await tx.get(db.doc('terminalSessions/'+v.activeSessionId)):null;
    if(active?.exists)tx.update(active.ref,{state:'ended',endedAt:new Date()});
    tx.update(ref,{state:deviceAction?'revoked':'ended',revokedAt:new Date(),revokedBy:actor.uid});audit(tx,db,deviceAction?'terminal.revoked':'terminal.session_revoked',{uid:actor.uid,unitId:v.unitId,targetId:id});
   });return send(res,200,'Acesso revogado.');
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(sendQuotaError(res,e))return;
  const statuses={UNAUTHENTICATED:401,FORBIDDEN:403,INVALID_INPUT:400,EXPIRED:410,RATE_LIMIT:429,LIMIT:409};
  const messages={UNAUTHENTICATED:'Sessão encerrada ou expirada. Autorize novamente.',FORBIDDEN:'Não foi possível autorizar este acesso.',INVALID_INPUT:'Confira os dados informados.',EXPIRED:'QR Code expirado ou já utilizado. Gere outro no caixa.',RATE_LIMIT:'Aguarde o QR Code atual expirar para gerar outro.',LIMIT:'Limite de terminais atingido. Revogue um terminal antigo.'};
  if(!statuses[e.message])console.error('Terminal access:',e.code||e.message);
  return send(res,statuses[e.message]||500,messages[e.message]||'Não foi possível concluir o acesso.');
 }
}
