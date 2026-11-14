import {sendNotification} from 'web-push';
import {getDb} from '../_lib.js';
import {allowedRecipient,noticeUrl} from './policy.js';
import {signalUnitChange} from '../live-signal.js';
export const pushConfigured=()=>!!(process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY&&process.env.PUBLIC_APP_URL);
// Stored atomically with the business mutation. No network calls inside a transaction.
export function queuePush(tx,db,unitId,eventId,{uid=null,audience='member',title,message=null,page='my-profile',targetDevice=null}){
 tx.set(db.doc(`units/${unitId}/pushOutbox/${eventId}`),{uid,audience,title,message,page,targetDevice,state:'pending',attempts:0,createdAt:new Date(),expiresAt:new Date(Date.now()+86400000),delivered:[]});
}
export async function drainPush(unitId,{db=getDb(),transport=sendNotification,eventId=null}={}){
 const configured=pushConfigured();
 const deadline=Date.now()+8000;
 const outbox=db.collection('units').doc(unitId).collection('pushOutbox');
 const pending=eventId?{docs:[await outbox.doc(eventId).get()]}:await outbox.where('state','==','pending').limit(3).get();
 for(const item of pending.docs){
  if(Date.now()>deadline)break;
  const event=await db.runTransaction(async tx=>{
   const snap=await tx.get(item.ref),v=snap.data();
   if(!v||v.state!=='pending'||v.leaseUntil?.toMillis()>Date.now())return null;
   if(v.expiresAt.toMillis()<Date.now()||v.attempts>=5){tx.update(item.ref,{state:'expired'});return null}
   tx.update(item.ref,{leaseUntil:new Date(Date.now()+120000),attempts:v.attempts+1});return v;
  });
  if(!event)continue;
  try{
   const members=['managers','unit'].includes(event.audience)?(await db.collection('memberships').where('unitId','==',unitId).get()).docs:[await db.doc('memberships/'+event.uid).get()];
   const recipients=members.filter(d=>d.exists&&allowedRecipient(d.data(),unitId,event.audience));
   let failed=false;
   for(const member of recipients){
    if(Date.now()>deadline){failed=true;break}
    // The inbox uses the same event ID, so retries cannot duplicate entries.
    const inbox=db.doc(`units/${unitId}/memberNotifications/${member.id}/items/${item.id}`);
    await db.runTransaction(async tx=>{const prior=await tx.get(inbox);if(!prior.exists){tx.create(inbox,{title:event.title,message:event.message||'Abra o aplicativo para consultar os detalhes.',recipientUid:member.id,unitId,at:event.createdAt,read:false,source:'Operação',page:event.page});signalUnitChange(tx,db,unitId,['notifications'])}});
    if(!configured){failed=true;continue}
    const devices=await db.collection('pushDevices').where('uid','==',member.id).limit(10).get();
    for(const device of devices.docs){
     const v=device.data(),key=device.id;
     if(v.unitId!==unitId||event.delivered?.includes(key)||event.targetDevice&&event.targetDevice!==key)continue;
     if(Date.now()>deadline){failed=true;break}
     // Recheck access immediately before each send, including role/unit changes.
     const current=await db.doc('memberships/'+member.id).get();
     if(!allowedRecipient(current.data(),unitId,event.audience))continue;
     try{
      await transport(v.subscription,JSON.stringify({title:event.title,body:'Abra o Triamicci para consultar os detalhes.',tag:item.id,url:noticeUrl(event.page,unitId)}),{TTL:3600,timeout:1500,vapidDetails:{subject:new URL(process.env.PUBLIC_APP_URL).origin,publicKey:process.env.WEB_PUSH_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_PRIVATE_KEY}});
      event.delivered=[...(event.delivered||[]),key];await item.ref.update({delivered:event.delivered});
     }catch(e){if([404,410].includes(e.statusCode))await device.ref.delete();else failed=true;}
    }
   }
   await item.ref.update({state:failed?'pending':'sent',leaseUntil:null,updatedAt:new Date()});
  }catch{await item.ref.update({leaseUntil:null});}
 }
}
// Push failure must never turn a committed operation into a reported business failure.
export async function tryDrainPush(unitId,eventId=null){try{await drainPush(unitId,{eventId})}catch{console.error('Push delivery deferred')}}
