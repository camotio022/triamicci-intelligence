import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewCache,writeViewCache,clearViewCache} from '../src/fastCache.js';

function fakeStorage(){
 const state=new Map();
 return {get length(){return state.size},key(i){return [...state.keys()][i]??null},
 getItem(k){return state.get(k)??null},setItem(k,v){state.set(k,String(v))},
 removeItem(k){state.delete(k)}};
}
test('cache isolates account and unit and expires',()=>{
 globalThis.sessionStorage=fakeStorage();
 writeViewCache('user-a','barigui','inventory-products',[{name:'arroz'}],30000);
 assert.deepEqual(readViewCache('user-a','barigui','inventory-products'),[{name:'arroz'}]);
 assert.equal(readViewCache('user-b','barigui','inventory-products'),null);
 assert.equal(readViewCache('user-a','outra','inventory-products'),null);
 writeViewCache('user-a','barigui','expired',['old'],-1);
 assert.equal(readViewCache('user-a','barigui','expired'),null);
 clearViewCache('user-a');
 assert.equal(readViewCache('user-a','barigui','inventory-products'),null);
});
test('storage unavailable never blocks the app',()=>{
 globalThis.sessionStorage={getItem(){throw Error('disabled')},setItem(){throw Error('disabled')},get length(){throw Error('disabled')}};
 assert.equal(readViewCache('u','b','k'),null);
 assert.doesNotThrow(()=>writeViewCache('u','b','k',{}));
 assert.doesNotThrow(()=>clearViewCache('u'));
});
