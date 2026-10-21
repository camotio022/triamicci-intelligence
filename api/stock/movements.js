import { getDb, authenticate, membership, checkRequest, send } from '../../server/_lib.js';

const idPattern = /^[a-f0-9]{40}$/;
const requestPattern = /^[a-f0-9-]{36}$/i;
const isQuantity = n => typeof n === 'number' && Number.isFinite(n) &&
  n > 0 && n <= 100000 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-7;
const asMilli = n => Math.round(n * 1000);
const fromMilli = n => n / 1000;
const clean = doc => {
  const d = doc.data();
  return {id:doc.id,productId:d.productId,productName:d.productName,type:d.type,
    amount:d.amount,unit:d.unit,before:d.before,after:d.after,note:d.note,
    actorUid:d.actorUid,at:d.at?.toDate?.()?.toISOString?.() || null};
};

export default async function handler(req,res) {
  if (!checkRequest(req,res)) return;
  res.setHeader('Cache-Control','no-store');
  try {
    const actor = await authenticate(req);
    const m = await membership(actor.uid);
    if (!m?.unitId) return send(res,403,'Acesso à unidade não autorizado.');
    const {action} = req.body || {};
    const db = getDb();
    const unit = db.collection('units').doc(m.unitId);
    const movements = unit.collection('movements');

    if (action === 'list') {
      const snap = await movements.orderBy('at','desc').limit(50).get();
      const records=snap.docs.map(clean);
      const ids=[...new Set(records.map(r=>r.actorUid).filter(Boolean))];
      const actors=await Promise.all(ids.map(async uid=>{const d=await db.collection('memberships').doc(uid).get();return [uid,d.exists&&d.data().unitId===m.unitId?(d.data().name||d.data().email||null):null]}));
      const names=Object.fromEntries(actors);
      return send(res,200,'Movimentações carregadas.',{movements:records.map(r=>({...r,actorName:names[r.actorUid]||'Responsável não identificado'}))});
    }
    if (action !== 'create') return send(res,400,'Ação inválida.');
    const {productId,type,amount,note,requestId} = req.body || {};
    if (!idPattern.test(productId || '') || !['entry','exit'].includes(type) ||
        !isQuantity(amount) || typeof note !== 'string' || note.trim().length < 3 ||
        note.trim().length > 240 || !requestPattern.test(requestId || ''))
      return send(res,400,'Informe produto, tipo, quantidade (até 3 casas), motivo e identificador válidos.');
    if (type === 'entry' && !['admin','manager','submanager'].includes(m.role))
      return send(res,403,'Somente administrador ou gerente pode registrar entradas.');

    const productRef = unit.collection('products').doc(productId);
    const movementRef = movements.doc(requestId);
    const actorRef = db.doc('memberships/'+actor.uid);
    const auditRef = db.collection('auditLogs').doc(requestId);
    const now = new Date();
    let result;
    await db.runTransaction(async tx => {
      // Todas as leituras antecedem as gravações e verificam a unidade no servidor.
      const [actorSnap,productSnap,existing] = await Promise.all([
        tx.get(actorRef),tx.get(productRef),tx.get(movementRef)
      ]);
      const current = actorSnap.data();
      if (!current || current.status !== 'active' || current.unitId !== m.unitId)
        throw new Error('FORBIDDEN');
      if (type === 'entry' && !['admin','manager','submanager'].includes(current.role))
        throw new Error('FORBIDDEN');
      if (existing.exists) {
        const old = existing.data();
        if (old.actorUid !== actor.uid || old.productId !== productId || old.type !== type ||
            old.amount !== amount || old.note !== note.trim())
          throw new Error('IDEMPOTENCY_CONFLICT');
        result = {id:requestId,before:old.before,after:old.after,duplicate:true};
        return;
      }
      if (!productSnap.exists) throw new Error('NOT_FOUND');
      const product = productSnap.data();
      if (product.status !== 'active') throw new Error('INACTIVE_PRODUCT');
      // Não movimentar perecíveis sem controlar o lote; a etapa seguinte implementa isso.
      if (product.trackExpiry === true) throw new Error('LOT_REQUIRED');
      const beforeMilli = asMilli(product.quantity ?? 0);
      if (!Number.isSafeInteger(beforeMilli) || beforeMilli < 0) throw new Error('INVALID_BALANCE');
      const delta = asMilli(amount) * (type === 'entry' ? 1 : -1);
      const afterMilli = beforeMilli + delta;
      if (!Number.isSafeInteger(afterMilli) || afterMilli < 0) throw new Error('INSUFFICIENT');
      if (afterMilli > 100000000000) throw new Error('LIMIT');
      const before = fromMilli(beforeMilli);
      const after = fromMilli(afterMilli);
      const record = {
        productId,productName:product.name,unit:product.unit,type,amount,
        before,after,note:note.trim(),actorUid:actor.uid,unitId:m.unitId,at:now
      };
      tx.update(productRef,{quantity:after,updatedAt:now,updatedBy:actor.uid});
      tx.create(movementRef,record);
      tx.create(auditRef,{event:'stock.movement',unitId:m.unitId,productId,actorUid:actor.uid,
        movementId:requestId,type,amount,before,after,at:now});
      result = {id:requestId,before,after,duplicate:false};
    });
    return send(res,200,result.duplicate?'Movimentação já registrada.':'Movimentação registrada.',{movement:result});
  } catch(e) {
    if (e.message === 'UNAUTHENTICATED') return send(res,401,'Faça login.');
    if (e.message === 'FORBIDDEN') return send(res,403,'Sem permissão para movimentar este estoque.');
    if (e.message === 'NOT_FOUND') return send(res,404,'Insumo não encontrado na unidade.');
    if (e.message === 'INACTIVE_PRODUCT') return send(res,409,'O insumo está inativo.');
    if (e.message === 'LOT_REQUIRED') return send(res,409,'Este insumo exige controle de lote e validade. Aguarde a etapa de lotes para movimentá-lo com segurança.');
    if (e.message === 'INVALID_BALANCE') return send(res,409,'Saldo cadastrado inconsistente. Solicite verificação.');
    if (e.message === 'INSUFFICIENT') return send(res,409,'Saldo insuficiente para esta saída.');
    if (e.message === 'LIMIT') return send(res,409,'Saldo excede o limite permitido.');
    if (e.message === 'IDEMPOTENCY_CONFLICT') return send(res,409,'Identificador de operação já utilizado com outros dados.');
    console.error('Stock movement:',e.message);
    return send(res,500,'Não foi possível registrar a movimentação.');
  }
}
