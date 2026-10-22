import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startVisibleRefresh} from '../src/visible-refresh.js';

test('refresh pauses when hidden, serializes requests, resumes and cleans up', async () => {
 let tick, listener, calls=0, finish, cleared=false;
 const document={visibilityState:'hidden',addEventListener:(_,fn)=>{listener=fn},removeEventListener:(_,fn)=>{assert.equal(fn,listener);listener=null}};
 const stop=startVisibleRefresh(()=>{calls++;return new Promise(resolve=>{finish=resolve})},{document,setInterval:fn=>{tick=fn;return 1},clearInterval:id=>{assert.equal(id,1);cleared=true}});
 await tick();assert.equal(calls,0);
 document.visibilityState='visible';const request=listener();await tick();assert.equal(calls,1);
 finish();await request;const next=tick();assert.equal(calls,2);finish();await next;
 stop();await tick();assert.equal(calls,2);assert.equal(listener,null);assert.equal(cleared,true);
});
