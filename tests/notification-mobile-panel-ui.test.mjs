import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/NotificationCenter.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/notifications.css',import.meta.url),'utf8');
test('notification center: mobile close and existing message lifecycle kept',()=>{
 assert.match(src,/aria-label="Fechar notificações"/);
 assert.match(src,/notificationDelete/);
 assert.match(src,/notificationRestore/);
 assert.match(src,/notificationRead/);
 assert.match(src,/aria-expanded=\{open\}/);
});
test('notification center: safe area and touch sizes',()=>{
 assert.match(css,/top:calc\(60px \+ env\(safe-area-inset-top,0px\)\)/);
 assert.match(css,/bottom:max\(10px,env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(css,/\.ti-notification-actions button\{min-width:0;min-height:44px/);
});
