import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/NotificationCenter.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/notification-module.css',import.meta.url),'utf8');
test('notifications are a navigable module with message lifecycle and a shared data subscription',()=>{
 assert.match(app,/navigate\("notifications"\)/);assert.match(app,/<NotificationsPage/);
 assert.doesNotMatch(src,/ti-notification-panel/);
 for(const action of ['notificationDelete','notificationRestore','notificationRead','notificationOpen'])assert.ok(src.includes(action));
 assert.equal((src.match(/useUnitLive\(/g)||[]).length,1);
 assert.match(src,/role="group" aria-label="Exibir notificações"/);
});
test('compact notification module uses safe-area spacing and touch controls',()=>{
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/var\(--ti-brand/);
 assert.match(css,/-webkit-line-clamp:2/);
});
