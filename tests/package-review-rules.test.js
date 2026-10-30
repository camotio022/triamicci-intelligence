import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewReadiness} from '../server/operations/package-review-rules.js';
const base={review:{ok:true,status:'READY_FOR_REVIEW',quantity:6.7},area:'giro',referenceBalance:7,lotStatus:'BALANCED',profileVersion:3,conferenceProfileVersion:3};
test('ready for human review never means permission to change stock',()=>{
 const r=reviewReadiness(base);
 assert.equal(r.readyForHumanReview,true);assert.equal(r.readyForBalanceApproval,false);
 assert.equal(r.variance,-0.3);assert.equal(r.stockEffect,'NONE');
});
test('reject stale profiles, unknown area and mismatched lots',()=>{
 assert.ok(reviewReadiness({...base,conferenceProfileVersion:2}).blockers.includes('VERSION_CHANGED'));
 assert.ok(reviewReadiness({...base,area:null}).blockers.includes('AREA_MISSING'));
 assert.ok(reviewReadiness({...base,lotStatus:'NEEDS_LOT_RECONCILIATION'}).blockers.includes('LOTS_NOT_BALANCED'));
 assert.equal(reviewReadiness({...base,review:{ok:false,status:'NEEDS_MEASUREMENT'}}).readyForHumanReview,false);
});
test('no inventory balance is accepted without reference',()=>{
 assert.equal(reviewReadiness({...base,referenceBalance:null}).readyForHumanReview,false);
});
