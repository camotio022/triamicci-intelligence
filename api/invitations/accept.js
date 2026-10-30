import {sendQuotaError} from '../../server/quota-error.js';
import { getDb, authenticate, membership, normalizeEmail, hashToken, checkRequest, send } from '../../server/_lib.js';
export default async function handler(req,res) {
  if (!checkRequest(req,res)) return;
  try {
    const actor = await authenticate(req);
    if (!actor.email || !actor.email_verified) return send(res,403,'É necessário autenticar um e-mail verificado.');
    const { invite } = req.body || {};
    if (typeof invite !== 'string' || invite.length > 500) return send(res,400,'Convite inválido.');
    const parts = invite.split('.');
    if (parts.length !== 3 || !parts.every(part=>/^[A-Za-z0-9_-]+$/.test(part))) return send(res,400,'Convite inválido.');
    const [unitId,id,token] = parts;
    const db = getDb();
    const invitationRef = db.doc('units/'+unitId+'/invitations/'+id);
    const memberRef = db.doc('memberships/'+actor.uid);
    const auditRef = db.collection('auditLogs').doc();
    await db.runTransaction(async tx => {
      const [invitationSnap,memberSnap] = await Promise.all([tx.get(invitationRef),tx.get(memberRef)]);
      const invitation = invitationSnap.data();
      if (!invitation || invitation.status !== 'pending' || invitation.unitId !== unitId ||
          invitation.tokenHash !== hashToken(token) || invitation.expiresAt.toMillis() <= Date.now() ||
          invitation.email !== normalizeEmail(actor.email)) throw new Error('INVALID_INVITATION');
      if (memberSnap.exists) throw new Error('MEMBERSHIP_EXISTS');
      if (!['admin','manager','submanager','cook','auxiliar'].includes(invitation.role)) throw new Error('INVALID_INVITATION');
      const inviterSnap = await tx.get(db.doc('memberships/' + invitation.createdBy));
      const inviter = inviterSnap.data();
      if (!inviter || inviter.status !== 'active' || inviter.unitId !== unitId ||
          !['admin','manager','submanager'].includes(inviter.role) ||
          (['manager','submanager'].includes(inviter.role) && !['cook','auxiliar'].includes(invitation.role)))
        throw new Error('INVALID_INVITATION');
      // Admin SDK só escreve após validar identidade e token em transação.
      tx.create(memberRef,{unitId,role:invitation.role,status:'active',email:normalizeEmail(actor.email),createdAt:new Date(),invitedBy:invitation.createdBy});
      tx.update(invitationRef,{status:'accepted',acceptedBy:actor.uid,acceptedAt:new Date(),tokenHash:null});
      tx.create(auditRef,{event:'invitation.accepted',unitId,invitationId:id,actorUid:actor.uid,at:new Date()});
    });
    return send(res,200,'Convite aceite. Acesso liberado.');
  } catch(error) {
    if (error.message === 'UNAUTHENTICATED') return send(res,401,'Entre com Google para aceitar.');
    if (error.message === 'INVALID_INVITATION') return send(res,400,'Convite inválido, expirado ou já utilizado.');
    if (error.message === 'MEMBERSHIP_EXISTS') return send(res,409,'Esta conta já possui vínculo.');
    if(sendQuotaError(res,error))return;console.error('Invitation accept:',error.message);
    return send(res,500,'Não foi possível aceitar o convite.');
  }
}
