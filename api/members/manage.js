import { getDb, getAuth, authenticate, membership, roles, checkRequest, send } from '../_lib.js';

const statuses = ['active','inactive'];
const cleanMember = (doc) => {
  const data = doc.data();
  return {
    uid:doc.id,
    email:typeof data.email === 'string' ? data.email : '',
    name:typeof data.name === 'string' ? data.name : '',
    unitId:data.unitId,
    role:data.role,
    status:data.status,
    createdAt:data.createdAt?.toDate?.()?.toISOString?.() || null
  };
};

export default async function handler(req,res) {
  if (!checkRequest(req,res)) return;
  res.setHeader('Cache-Control','no-store');
  try {
    const actor = await authenticate(req);
    const actingMember = await membership(actor.uid);
    if (!actingMember || !['admin','manager'].includes(actingMember.role))
      return send(res,403,'Sem permissão para gerir colaboradores.');

    const { action } = req.body || {};
    const db = getDb();
    if (action === 'list') {
      const snap = await db.collection('memberships').where('unitId','==',actingMember.unitId).limit(201).get();
      if (snap.size > 200) return send(res,409,'A unidade excede o limite da listagem. Paginação necessária.');
      const members = snap.docs.map(cleanMember);
      // Nome vem do perfil Google/Firebase quando ainda não está gravado no vínculo.
      const profiles = new Map();
      for (let index = 0; index < members.length; index += 100) {
        const batch = members.slice(index,index+100);
        const result = await getAuth().getUsers(batch.map(item => ({uid:item.uid})));
        for (const profile of result.users) profiles.set(profile.uid,profile);
      }
      for (const item of members) {
        const profile = profiles.get(item.uid);
        if (!item.name) item.name = profile?.displayName || '';
        if (!item.email) item.email = profile?.email || '';
      }
      return send(res,200,'Colaboradores carregados.',{
        members:members.sort((a,b) => (a.name || a.email).localeCompare(b.name || b.email,'pt-BR'))
      });
    }

    if (action !== 'update') return send(res,400,'Ação inválida.');
    const { uid, role, status } = req.body || {};
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
        !roles.includes(role) || !statuses.includes(status))
      return send(res,400,'Colaborador, cargo ou situação inválidos.');
    if (uid === actor.uid) return send(res,403,'Não podes alterar o teu próprio acesso.');

    const targetRef = db.doc('memberships/' + uid);
    const actorRef = db.doc('memberships/' + actor.uid);
    const auditRef = db.collection('auditLogs').doc();

    await db.runTransaction(async tx => {
      const [actorSnap,targetSnap] = await Promise.all([tx.get(actorRef),tx.get(targetRef)]);
      const currentActor = actorSnap.data();
      const target = targetSnap.data();
      if (!currentActor || currentActor.status !== 'active' ||
          !['admin','manager'].includes(currentActor.role) ||
          currentActor.unitId !== actingMember.unitId)
        throw new Error('FORBIDDEN');
      if (!target || target.unitId !== currentActor.unitId) throw new Error('NOT_FOUND');
      if (!roles.includes(target.role) || !statuses.includes(target.status)) throw new Error('INVALID_STATE');

      // Gerentes só podem administrar auxiliares e cozinheiros, inclusive o cargo de destino.
      if (currentActor.role === 'manager' &&
          (!['auxiliar','cook'].includes(target.role) || !['auxiliar','cook'].includes(role)))
        throw new Error('FORBIDDEN');

      if (target.role === role && target.status === status) throw new Error('NO_CHANGES');

      // Nunca deixar a unidade sem um administrador ativo.
      if (target.role === 'admin' && target.status === 'active' &&
          (role !== 'admin' || status !== 'active')) {
        const unitMembers = await tx.get(db.collection('memberships')
          .where('unitId','==',currentActor.unitId).limit(201));
        if (unitMembers.size > 200) throw new Error('TOO_MANY_MEMBERS');
        const adminCount = unitMembers.docs.filter(doc =>
          doc.data().role === 'admin' && doc.data().status === 'active').length;
        if (adminCount <= 1) throw new Error('LAST_ADMIN');
      }

      const now = new Date();
      tx.update(targetRef,{role,status,updatedAt:now,updatedBy:actor.uid});
      tx.create(auditRef,{
        event:'member.updated',unitId:currentActor.unitId,actorUid:actor.uid,
        targetUid:uid,fromRole:target.role,toRole:role,fromStatus:target.status,toStatus:status,at:now
      });
    });
    return send(res,200,'Colaborador atualizado.');
  } catch(error) {
    if (error.message === 'UNAUTHENTICATED') return send(res,401,'Faça login.');
    if (error.message === 'FORBIDDEN') return send(res,403,'Sem permissão para esta alteração.');
    if (error.message === 'NOT_FOUND') return send(res,404,'Colaborador não encontrado nesta unidade.');
    if (error.message === 'TOO_MANY_MEMBERS') return send(res,409,'Unidade grande demais para esta operação; contacte o suporte.');
    if (error.message === 'LAST_ADMIN') return send(res,409,'Não é possível remover o último administrador ativo da unidade.');
    if (error.message === 'NO_CHANGES') return send(res,409,'Nenhuma alteração foi feita.');
    if (error.message === 'INVALID_STATE') return send(res,409,'O vínculo atual está inconsistente.');
    console.error('Member management:',error.message);
    return send(res,500,'Não foi possível concluir a operação.');
  }
}
