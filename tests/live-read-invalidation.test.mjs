import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveHub,invalidateOncePerDelivery} from '../src/live-hub.js';

test('one Firestore delivery invalidates once despite several listeners',()=>{
 const event={data:{revision:'a'},connected:true};
 let invalidations=0;
 const invalidate=()=>{invalidations++};
 assert.equal(invalidateOncePerDelivery(event,invalidate),true);
 assert.equal(invalidateOncePerDelivery(event,invalidate),false);
 assert.equal(invalidations,1);
 const next={data:{revision:'b'},connected:true};
 assert.equal(invalidateOncePerDelivery(next,invalidate),true);
 assert.equal(invalidations,2);
});

test('shared hub opens one listener and unsubscribes after final subscriber',()=>{
 let open=0,close=0,emit;
 const hub=createLiveHub((_unit,send)=>{open++;emit=send;return()=>{close++}});
 const seenA=[],seenB=[];
 const unsubA=hub.subscribe('user:unit','unit',e=>seenA.push(e));
 const unsubB=hub.subscribe('user:unit','unit',e=>seenB.push(e));
 assert.equal(open,1);
 const change={data:{revision:'x'},connected:true};
 emit(change);
 assert.deepEqual(seenA,[change]);
 assert.deepEqual(seenB,[change]);
 unsubA();
 assert.equal(close,0);
 unsubB();
 assert.equal(close,1);
});
