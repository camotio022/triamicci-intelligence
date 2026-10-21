import { getDb, getAuth, authenticate, membership, normalizeEmail, emailPattern, roles, newToken, hashToken, deliverInvite, checkRequest, send } from '../../server/_lib.js';
export default async function handler(req,res) {
  if (!checkRequest(req,res)) return;
  try {
    const actor = await authenticate(req);
    const member = await membership(actor.uid);
    if (!member || !['admin','manager','submanager'].includes(member.role)) return send(res,403,'Sem permissão para convidar.');
    const { unitId, role, deliveryMethod = 'email' } = req.body || {};
    if (!['email','link'].includes(deliveryMethod)) return send(res,400,'Modo de convite inválido.');
    const email = normalizeEmail(req.body?.email);
    if (!emailPattern.test(email) || email.length > 254 || !roles.includes(role) || unitId !== member.unitId)
      return send(res,400,'E-mail, função ou unidade inválidos.');
    if (['manager','submanager'].includes(member.role) && !['cook','auxiliar'].includes(role)) return send(res,403,'Gerente não pode atribuir essa função.');
    // Convites não podem alterar o cargo de quem já possui vínculo.
    if (email === normalizeEmail(actor.email) || email === normalizeEmail(member.email))
      return send(res,409,'Não é possível convidar a própria conta.');
    let existingUser = null;
    try {
      existingUser = await getAuth().getUserByEmail(email);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    if (existingUser) {
      if (existingUser.uid === actor.uid) return send(res,409,'Não é possível convidar a própria conta.');
      const existingMembership = await getDb().doc('memberships/' + existingUser.uid).get();
      if (existingMembership.exists)
        return send(res,409,'Este e-mail já está associado a um colaborador. Utilize a gestão de acessos.');
    }
    if (!process.env.PUBLIC_APP_URL) return send(res,503,'PUBLIC_APP_URL não configurada.');
    if (deliveryMethod === 'email' && (!process.env.RESEND_API_KEY || !process.env.INVITE_FROM_EMAIL))
      return send(res,503,'Serviço de e-mail ainda não configurado.');
    let appOrigin;
    try {
      const appUrl = new URL(process.env.PUBLIC_APP_URL.trim());
      if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password) throw new Error('Invalid URL');
      appOrigin = appUrl.origin;
    } catch {
      return send(res,503,'PUBLIC_APP_URL inválida.');
    }
    const db = getDb();
    // Limite persistente: cinco tentativas por hora por emissor.
    const quotaRef = db.collection('invitationRateLimits').doc(actor.uid);
    const permitted = await db.runTransaction(async tx => {
      const snap = await tx.get(quotaRef);
      const now = Date.now();
      const current = snap.data();
      const start = current?.windowStart?.toMillis?.() || 0;
      const count = now - start < 3600000 ? (current?.count || 0) : 0;
      if (count >= 5) return false;
      tx.set(quotaRef, { windowStart: new Date(count ? start : now), count: count + 1, updatedAt: new Date(now) });
      return true;
    });
    if (!permitted) return send(res,429,'Limite de cinco tentativas por hora atingido.');

    const existing = await db.collection('units').doc(unitId).collection('invitations')
      .where('email','==',email).where('status','==','pending').limit(10).get();
    if (!existing.empty) return send(res,409,'Já existe um convite pendente para este e-mail.');
    const token = newToken();
    const invitation = db.collection('units').doc(unitId).collection('invitations').doc();
    const now = Date.now();
    await invitation.set({
      email,role,unitId,deliveryMethod,status:deliveryMethod === 'link' ? 'pending' : 'sending',tokenHash:hashToken(token),
      createdBy:actor.uid,createdAt:adminTimestamp(),expiresAt: new Date(now + 7*24*60*60*1000),
      updatedAt:adminTimestamp()
    });
    const url = appOrigin + '/#invite=' + encodeURIComponent(unitId+'.'+invitation.id+'.'+token);
    if (deliveryMethod === 'link') {
      await db.collection('auditLogs').add({
        event:'invitation.link_created',unitId,invitationId:invitation.id,actorUid:actor.uid,at:adminTimestamp()
      });
      // Link de uso único: só retorna nesta resposta autenticada, nunca grava token em texto no Firestore.
      res.setHeader('Cache-Control','no-store');
      return send(res,201,'Link criado. Envie-o somente ao colaborador correto.',{inviteUrl:url});
    }
    try {
      await deliverInvite({to:email,url,unitId,role});
    } catch (error) {
      await invitation.update({status:'delivery_failed',updatedAt:adminTimestamp()});
      console.error('Invitation delivery failed:',error.message);
      return send(res,502,'Falha no envio do e-mail. Verifique a configuração do remetente.');
    }
    await invitation.update({status:'pending',updatedAt:adminTimestamp()});
    await db.collection('auditLogs').add({event:'invitation.created',unitId,invitationId:invitation.id,actorUid:actor.uid,at:adminTimestamp()});
    return send(res,201,'Convite enviado.');
  } catch(error) {
    console.error('Invitation create:',error.message);
    return send(res,error.message==='UNAUTHENTICATED'?401:500,'Não foi possível criar o convite.');
  }
}
function adminTimestamp(){return new Date();}
