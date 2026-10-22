import {randomUUID} from 'node:crypto';

// Reuse the existing authorized invalidation path for backwards-compatible Rules. No business data. Commit alongside the authorized mutation.
export function signalUnitChange(tx, db, unitId) {
 if (typeof unitId !== 'string' || !unitId || unitId.includes('/')) throw Error('INVALID_UNIT');
 tx.set(db.collection('units').doc(unitId).collection('live').doc('attendance'), {
  revision: randomUUID(), updatedAt: new Date()
 });
}
