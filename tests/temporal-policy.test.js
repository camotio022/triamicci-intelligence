import {test} from 'node:test';import assert from 'node:assert/strict';
import {unitDay,publicationWindow} from '../server/schedules/temporal-policy.js';
test('publication opens twenty days before the month and closed months remain closed',()=>{
 assert.deepEqual(publicationWindow('2026-11','2026-10-11'),{opensOn:'2026-10-12',open:false});
 assert.equal(publicationWindow('2026-11','2026-10-12').open,true);
 assert.equal(publicationWindow('2026-10','2026-11-01').open,false);
 assert.equal(unitDay(new Date('2026-11-01T02:59:00Z')),'2026-10-31');
 assert.equal(unitDay(new Date('2026-11-01T03:00:00Z')),'2026-11-01');
});
