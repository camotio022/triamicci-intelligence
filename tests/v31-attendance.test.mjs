import test from 'node:test';import assert from 'node:assert/strict';
import {attendanceTransition} from '../server/workflows/attendance-v31.js';
test('jornada somente aceita transições legais',()=>{
 assert.equal(attendanceTransition('not_started','clock_in'),'working');
 assert.equal(attendanceTransition('working','break_start'),'on_break');
 assert.equal(attendanceTransition('on_break','break_end'),'working');
 assert.equal(attendanceTransition('working','clock_out'),'finished');
 assert.equal(attendanceTransition('not_started','break_start'),null);
 assert.equal(attendanceTransition('on_break','clock_out'),null);
 assert.equal(attendanceTransition('finished','clock_in'),null);
});

test('prorrogação mantém a declaração atual, sem iniciar nem reabrir jornada',()=>{assert.equal(attendanceTransition('working','continue_work'),'working');assert.equal(attendanceTransition('on_break','continue_work'),'on_break');assert.equal(attendanceTransition('finished','continue_work'),null);assert.equal(attendanceTransition('not_started','continue_work'),null)});
