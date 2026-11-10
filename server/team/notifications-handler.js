import {send} from '../_lib.js';
import {signalUnitChange} from '../live-signal.js';
// Account and tenant context is resolved by the authenticated members dispatcher.
export default async function notifications(req,res,{db,actor,actingMember}){
 const action=req.body?.action;
    if(action==='notifications'){
      // Per-user records only; keep original operational data and audit entries intact.
      const snap=await db.collection('units').doc(actingMember.unitId).collection('memberNotifications').doc(actor.uid).collection('items').orderBy('at','desc').limit(100).get();
      const asISO=value=>value?.toDate?.()?.toISOString?.()||null;
      return send(res,200,'Notificações carregadas.',{notifications:snap.docs.map(d=>{
       const n=d.data();
       return {id:d.id,title:n.title||'Alteração profissional',message:n.message||'',read:!!n.read,
        at:asISO(n.at),readAt:asISO(n.readAt),openedAt:asISO(n.openedAt),
        deletedAt:asISO(n.deletedAt),source:n.source||n.event||'Equipe',
        reference:n.reference||n.registryId||n.targetUid||null,
        page:['my-profile','leave-requests','people','kitchen-v3','mural'].includes(n.page)?n.page:null};
      })});
    }
    if(['notificationRead','notificationOpen','notificationDelete','notificationRestore'].includes(action)){
      const id=req.body?.id;
      if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))return send(res,400,'Aviso inválido.');
      const ref=db.collection('units').doc(actingMember.unitId).collection('memberNotifications').doc(actor.uid).collection('items').doc(id);
      const now=new Date();
      let found=false,changed=false;
      await db.runTransaction(async tx=>{
       const active=await tx.get(db.doc('memberships/'+actor.uid));
       if(!active.exists||active.data().status!=='active'||active.data().unitId!==actingMember.unitId)throw Error('FORBIDDEN');
       const snap=await tx.get(ref);if(!snap.exists)return;
       found=true;
       const n=snap.data(),deleted=!!n.deletedAt;
       if(action==='notificationRestore'&&!deleted)return;
       if(action==='notificationDelete'&&deleted)return;
       if(['notificationRead','notificationOpen'].includes(action)&&deleted)return;
       const patch=action==='notificationDelete'?{deletedAt:now}:
        action==='notificationRestore'?{deletedAt:null}:
        action==='notificationOpen'?{openedAt:n.openedAt||now,read:true,readAt:n.readAt||now}:
        {read:true,readAt:n.readAt||now};
       tx.update(ref,patch);changed=true;
       signalUnitChange(tx,db,actingMember.unitId,['notifications']);
      });
      if(!found)return send(res,404,'Aviso não encontrado.');
      if(!changed)return send(res,409,'O aviso já está neste estado ou está na lixeira.');
      return send(res,200,action==='notificationDelete'?'Aviso movido para a lixeira.':action==='notificationRestore'?'Aviso restaurado.':'Aviso atualizado.');
    }
 return send(res,400,'Ação de notificação inválida.');
}
