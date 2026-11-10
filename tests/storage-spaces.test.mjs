import test from 'node:test';
import assert from 'node:assert/strict';
import {STORAGE_TEMPLATES,STORAGE_ICONS,validateStorage,scheduled,progress} from '../server/storage/storage-model.js';
const base={name:'Carnes',icon:'beef',area:'reserva',frequency:'daily',weekdays:[]};
test('modelos comuns possuem identificadores e ícones permitidos',()=>{
 assert.ok(STORAGE_TEMPLATES.length>=8);
 assert.equal(new Set(STORAGE_TEMPLATES.map(t=>t.id)).size,STORAGE_TEMPLATES.length);
 for(const template of STORAGE_TEMPLATES){assert.ok(STORAGE_ICONS.includes(template.icon));assert.ok(validateStorage({...base,name:template.label,icon:template.icon})===null);}
});
test('não aceitar nomes e configurações inválidas',()=>{
 assert.equal(validateStorage({...base,name:' '})!==null,true);
 assert.equal(validateStorage({...base,icon:'<script>'})!==null,true);
 assert.equal(validateStorage({...base,area:'experimental'})!==null,true);
 assert.equal(validateStorage({...base,frequency:'custom',weekdays:[]})!==null,true);
 assert.equal(validateStorage({...base,frequency:'custom',weekdays:[1,1]})!==null,true);
 assert.equal(validateStorage({...base,frequency:'custom',weekdays:[0,2,4]})===null,true);
});
test('frequência respeita dia e não trata demanda como pendente',()=>{
 assert.equal(scheduled(base,'2026-11-09'),true);
 assert.equal(scheduled({...base,frequency:'on_demand'},'2026-11-09'),false);
 assert.equal(scheduled({...base,frequency:'weekly'},'2026-11-09'),true);
 assert.equal(scheduled({...base,frequency:'weekly'},'2026-11-10'),false);
 assert.equal(scheduled({...base,frequency:'custom',weekdays:[2,4]},'2026-11-10'),true);
 assert.equal(scheduled({...base,frequency:'monthly'},'2026-12-01'),true);
 assert.equal(scheduled({...base,frequency:'monthly'},'2026-12-02'),false);
});
test('progresso não divide por zero e não inventa contagens',()=>{
 assert.deepEqual(progress(0,0),{total:0,done:0,pending:0,percent:0});
 assert.deepEqual(progress(24,18),{total:24,done:18,pending:6,percent:75});
});
