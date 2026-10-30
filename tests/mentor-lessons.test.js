import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS,lessonsForRole,isLessonAllowed,progressKey} from '../src/mentor-lessons.js';
test('all lessons are valid with safe navigation targets',()=>{
 const validPages=new Set(['kitchen','my-profile','mural','people','inventory','receiving','history','count','daily-inventory','production','schedule-planning','leave-requests','catalog']);
 for(const lesson of LESSONS){assert.ok(lesson.id&&lesson.title);assert.ok(lesson.steps.length>=2);for(const s of lesson.steps){assert.ok(validPages.has(s.page));assert.ok(s.body.length>20)}}
 assert.equal(new Set(LESSONS.map(l=>l.id)).size,LESSONS.length);
 assert.ok(lessonsForRole('admin').some(l=>l.id==='admin-guide'));
 assert.equal(isLessonAllowed('admin-guide','cook'),false);
});
test('management-only lessons excluded from cook and auxiliar',()=>{
 for(const role of ['cook','auxiliar']){assert.equal(isLessonAllowed('manage-people',role),false);assert.equal(isLessonAllowed('double-shifts',role),false);assert.ok(lessonsForRole(role).length>=2)}
 assert.equal(isLessonAllowed('double-shifts','manager'),true);
});
test('learning progress remains separated by account and unit',()=>{
 assert.notEqual(progressKey('a','user-1'),progressKey('b','user-1'));
 assert.notEqual(progressKey('a','user-1'),progressKey('a','user-2'));
});