import {createHash,timingSafeEqual} from 'node:crypto';
export const IDLE_MS=180000;
export const PAIR_MS=60000;
export const SESSION_MS=12*60*60*1000;
export const keyPattern=/^[A-Za-z0-9_-]{32,64}$/;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const matches=(secret,hash)=>typeof secret==='string'&&keyPattern.test(secret)&&typeof hash==='string'&&hash.length===64&&timingSafeEqual(Buffer.from(digest(secret)),Buffer.from(hash));
export const millis=value=>value?.toMillis?.()??(value instanceof Date?value.getTime():Number(value));
export function sessionValid(session,terminal,member,now=Date.now()){
 return !!(session&&terminal&&member&&session.state==='active'&&terminal.state==='active'&&terminal.activeSessionId===session.id&&session.terminalId===terminal.id&&member.status==='active'&&member.unitId===session.unitId&&terminal.unitId===session.unitId&&member.role===session.role&&millis(session.expiresAt)>now&&millis(session.idleUntil)>now);
}
export async function verifyTerminalCredential(token,db,now=Date.now()){
 const parts=token.split('.');if(parts.length!==3||parts[0]!=='ts1'||!keyPattern.test(parts[1])||!keyPattern.test(parts[2]))throw Error('UNAUTHENTICATED');
 const snap=await db.doc('terminalSessions/'+parts[1]).get(),session=snap.exists?{...snap.data(),id:snap.id}:null;
 if(!session||!matches(parts[2],session.secretHash))throw Error('UNAUTHENTICATED');
 const [device,person]=await Promise.all([db.doc('terminals/'+session.terminalId).get(),db.doc('memberships/'+session.uid).get()]);
 const terminal=device.exists?{...device.data(),id:device.id}:null,member=person.exists?person.data():null;
 if(!sessionValid(session,terminal,member,now)){
  if(session.state==='active')await db.doc('terminalSessions/'+session.id).update({state:'ended',endedAt:new Date(now),endReason:'expired-or-access-changed'});
  throw Error('UNAUTHENTICATED');
 }
 return {session,terminal,member};
}
