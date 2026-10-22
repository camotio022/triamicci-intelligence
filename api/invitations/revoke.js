import { getDb, authenticate, membership, checkRequest, send } from '../../server/_lib.js';

// Revogação definitiva de convite. Apenas administrador da unidade ou o emissor autorizado.
export default async function handler(req, res) {
  if (!checkRequest(req, res)) return;
  try {
    const actor = await authenticate(req);
    const member = await membership(actor.uid);
    if (!member || !['admin','manager','submanager'].includes(member.role))
      return send(res,403,'Sem permissão para revogar convites.');
    // Consultas de convites passam pela API: Rules públicas não precisam expor a coleção.
    // Devolver somente os campos necessários à interface, nunca tokenHash.
    if (req.body?.action === 'list') {
      const unitId = req.body?.unitId;
      if (unitId !== member.unitId) return send(res,403,'Unidade não autorizada.');
      const snap = await getDb().collection('units').doc(unitId).collection('invitations')
        .orderBy('createdAt','desc').limit(50).get();
      const invitations = snap.docs.filter(doc => member.role === 'admin' || doc.data().createdBy === actor.uid)
        .map(doc => {
          const value = doc.data();
          return {id:doc.id,email:value.email||'',role:value.role||'',status:value.status||'',
            deliveryMethod:value.deliveryMethod||'',createdBy:value.createdBy||'',
            createdAt:value.createdAt?.toDate?.()?.toISOString?.() || null};
        });
      res.setHeader('Cache-Control','no-store');
      return send(res,200,'Convites carregados.',{invitations});
    }
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
