import {randomUUID} from 'node:crypto';

// Reuse the existing authorized invalidation path for backwards-compatible Rules. No business data. Commit alongside the authorized mutation.
export function signalUnitChange(tx, db, unitId, domains=['all']) {
 if (typeof unitId !== 'string' || !unitId || unitId.includes('/')) throw Error('INVALID_UNIT');
 const revision=randomUUID();
 tx.set(db.collection('units').doc(unitId).collection('live').doc('attendance'), {
  protocolVersion:2,revision,updatedAt:new Date(),
  ...(domains.includes('all')?{allRevision:revision}:{}),
  domains:Object.fromEntries(domains.filter(x=>x!=='all').map(x=>[x,revision]))
 },{merge:true});
}
