import { getDb, authenticate, membership, checkRequest, send } from '../../server/_lib.js';

// Revogação definitiva de convite. Apenas administrador da unidade ou o emissor autorizado.
export default async function handler(req, res) {
  if (!checkRequest(req, res)) return;
  try {
    const actor = await authenticate(req);
    const member = await membership(actor.uid);
    if (!member || !['admin','manager'].includes(member.role))
      return send(res,403,'Sem permissão para revogar convites.');
    const { unitId, invitationId } = req.body || {};
    if (unitId !== member.unitId || typeof invitationId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(invitationId))
      return send(res,400,'Convite ou unidade inválidos.');
    const db = getDb();
    const ref = db.doc('units/' + unitId + '/invitations/' + invitationId);
    const auditRef = db.collection('auditLogs').doc();
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const invitation = snap.data();
      if (!invitation) throw new Error('NOT_FOUND');
      if (member.role !== 'admin' && invitation.createdBy !== actor.uid)
        throw new Error('FORBIDDEN');
      if (!['pending','delivery_failed'].includes(invitation.status))
        throw new Error('NOT_REVOCABLE');
      tx.update(ref,{status:'revoked',tokenHash:null,updatedAt:new Date(),revokedBy:actor.uid});
      tx.create(auditRef,{event:'invitation.revoked',unitId,invitationId,actorUid:actor.uid,at:new Date()});
    });
    return send(res,200,'Convite revogado. O link não poderá mais ser utilizado.');
  } catch (error) {
    if (error.message === 'UNAUTHENTICATED') return send(res,401,'Faça login.');
    if (error.message === 'NOT_FOUND') return send(res,404,'Convite não encontrado.');
    if (error.message === 'FORBIDDEN') return send(res,403,'Sem permissão para revogar este convite.');
    if (error.message === 'NOT_REVOCABLE') return send(res,409,'Este convite já foi usado ou revogado.');
    console.error('Invitation revoke:',error.message);
    return send(res,500,'Não foi possível revogar o convite.');
  }
}
