import assert from 'node:assert/strict';
import test from 'node:test';
import {moveCoverageCard,projectCoverage} from '../src/coverage-board-state.js';

const cook={uid:'cook',matchesRole:true,countsForMinimum:true};
const support={uid:'support',matchesRole:false,countsForMinimum:true};
const window={start:'12:00',end:'20:20'};
const row={count:1,minimum:4,headcountGap:3,roleGap:1,skillGap:0,window,candidates:[cook,support]};
const proposal={staffId:'cook',status:'approved',second:window};

test('drafting a cook fills one vacancy, while a pending invite only changes the column',()=>{
 const preview=projectCoverage(row,[],[],[],cook);
 assert.deepEqual([preview.count,preview.headcountGap,preview.roleGap,preview.column],[2,2,0,'needs']);
 const pending=projectCoverage(row,[{...proposal,status:'pending_acceptance'}],[],[]);
 assert.deepEqual([pending.count,pending.roleGap,pending.column],[1,1,'waiting']);
 const approved=projectCoverage(row,[proposal],[],[]);
 assert.deepEqual([approved.count,approved.headcountGap,approved.roleGap,approved.column],[2,2,0,'needs']);
});

test('only enough approved coverage resolves a turn and part shifts need a confirmed handover',()=>{
 const oneShort={...row,count:3};
 assert.equal(projectCoverage(oneShort,[proposal],[],[]).column,'resolved');
 const part={...proposal,second:{...window,start:'16:20'}};
 assert.equal(projectCoverage(oneShort,[part],[],[]).column,'needs');
 assert.equal(projectCoverage(oneShort,[{...part,coveredStart:true}],[],[]).column,'resolved');
 assert.equal(projectCoverage(oneShort,[{...part,coveredStart:true,actualStart:'17:00'}],[],[]).column,'needs');
 assert.equal(projectCoverage(oneShort,[{...proposal,staffId:'support'}],[],[]).column,'needs');
 assert.equal(projectCoverage(oneShort,[proposal],[{deficit:1}],[]).column,'needs');
});

test('card reordering preserves other cards and ignores invalid drop targets',()=>{
 const order=['kitchen','front','second'];
 assert.deepEqual(moveCoverageCard(order,'kitchen','second'),['front','second','kitchen']);
 assert.equal(moveCoverageCard(order,'missing','front'),order);
 assert.deepEqual(order,['kitchen','front','second']);
});
