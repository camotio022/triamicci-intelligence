import test from 'node:test';
import assert from 'node:assert/strict';
import {muralDirectoryEntry} from '../server/team/mural-directory.js';
import {liveShiftState} from '../server/schedules/restaurant-today.js';
test('mural recebe dados operacionais sem expor cadastro administrativo',()=>{
 const entry=muralDirectoryEntry('staff-1',{name:'Pessoa',accountUid:'u1',sector:'cozinha',shift:'manha',email:'private@test',salary:5000,notes:'Pessoal',certifications:['privado'],role:'admin',availability:[{day:'qua',start:'08:00',end:'16:20',note:'privado'}]});
 assert.deepEqual(Object.keys(entry).sort(),['accountUid','availability','id','name','sector','shift']);
 assert.deepEqual(entry.availability,[{day:'qua',start:'08:00',end:'16:20'}]);
 assert.equal(liveShiftState({day:'2026-10-28',clock:'10:00',employee:entry}).due,true);
});
test('diretório aceita ficha sem conta nem horários',()=>{
 assert.deepEqual(muralDirectoryEntry('staff-2',{}),{id:'staff-2',name:'',accountUid:null,sector:'',shift:'',availability:[]});
});
