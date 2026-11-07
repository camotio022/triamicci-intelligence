import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('fase 1: fundação importada depois das folhas de compatibilidade',()=>{
 const main=read('main.jsx');
 assert.match(main,/import '\.\/ios-edge-to-edge\.css';\s*import '\.\/ui-foundation-phase1\.css';/);
});
test('fase 1: cabeçalho mobile apresenta título completo e drawer controla foco',()=>{
 const app=read('App.jsx'),css=read('ui-foundation-phase1.css');
 assert.match(app,/className="ti-mobile-page-label"/);
 assert.match(app,/ref=\{menuTriggerRef\}/);
 assert.match(app,/document\.body\.style\.overflow='hidden'/);
 assert.match(css,/\.ti-mobile-page-label\{display:block/);
 assert.match(css,/max-width:359px/);
});
test('fase 1: confirmação acessível tem Escape, foco, botões e safe areas',()=>{
 const comp=read('ConfirmSheet.jsx'),css=read('confirm-sheet.css');
 for(const pattern of [/role="alertdialog"/,/aria-modal="true"/,/requestAnimationFrame/,/e\.key==='Escape'/,/e\.key!=='Tab'/,/aria-busy=\{busy\}/])assert.match(comp,pattern);
 assert.match(css,/safe-area-inset-bottom/);
});
test('fase 1: folgas deixam de usar diálogos nativos',()=>{
 const comp=read('LeaveRequests.jsx');
 assert.doesNotMatch(comp,/window\.(confirm|prompt)\s*\(/);
 assert.match(comp,/<ConfirmSheet open=\{!!pendingAction\}/);
 assert.match(comp,/await api\('leaveDecision'/);
 assert.match(comp,/await api\('leaveRequest'/);
});
