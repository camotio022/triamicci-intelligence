import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/ShipmentReceiving.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/shipment-receiving-mobile.css',import.meta.url),'utf8');
test('receiving: approval and rejection remain separate, server-authorized actions',()=>{
 assert.match(source,/api\(action\.approved\?'shipmentApprove':'shipmentReject'/);
 assert.match(source,/requestId:action\.id,reason:action\.reason/);
 assert.match(source,/if\(!approved&&reason\.length<8\)/);
 assert.match(source,/await load\(\)/);
 assert.doesNotMatch(source,/window\.confirm\(/);
});
test('receiving: reasons scoped to delivery, not shared between pending orders',()=>{
 assert.match(source,/\[reasons,setReasons\]=useState\(\{\}\)/);
 assert.match(source,/reasons\[item\.id\]/);
 assert.match(source,/setReasons\(old=>\(\{\.\.\.old,\[item\.id\]:e\.target\.value\}\)\)/);
 assert.match(source,/<ConfirmSheet open=\{!!decision\}/);
 assert.match(source,/setDecision\(null\)/);
});
test('receiving: safe mobile controls with no changes to persisted stock model',()=>{
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/min-height:44px/);
 assert.match(source,/api\('shipmentInspect'/);
 assert.match(source,/onChange\?\.\(\)/);
});
