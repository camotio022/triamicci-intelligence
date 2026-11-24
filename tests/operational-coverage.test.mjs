import test from 'node:test';
import assert from 'node:assert/strict';
import {carryFiveTwoRoster,effectiveFiveTwoPair,fiveTwoEntries,fiveTwoPair,fiveTwoWeeks} from '../server/schedules/five-two.js';
import {evaluateOperationalDay,forecastPaymentDate,suggestSundayMove,validOperationalPolicy,wholeTurnAssignment} from '../server/coverage/operational.js';

const date='2026-12-13';
const kitchen=(uid,certifications=[],extras={})=>({
 uid,name:uid,status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',
 certifications,availability:[{day:'dom',start:'12:00',end:'20:20',breakStart:'14:00',breakEnd:'15:00'},{day:'seg',start:'14:00',end:'22:20'}],...extras
});
const work=(people,date,type='work')=>people.map(({uid})=>({uid,date,type}));
const policy={holidays:[],peakPeriods:[],strongPeaks:[],frontWeekdayMinimum:null,countManagement:null,managementPaid:null,recurring:[]};

test('fixed 5×2 is inherited from published weeks while Sundays start empty',()=>{
 const past={period:'2026-11',status:'published',roster:{weekly:{'2026-11-23':{a:1},'2026-11-30':{a:2}},sundays:{a:'2026-11-22'}}};
 const draft={period:'2026-11',status:'draft',roster:{weekly:{'2026-11-30':{a:4}},sundays:{}}};
 const roster=carryFiveTwoRoster('2026-12',[draft,past],[{uid:'a'}]);
 assert.deepEqual(roster.sundays,{});
 for(const week of fiveTwoWeeks('2026-12'))assert.equal(fiveTwoPair(roster,week,'a'),2);
 const changed=effectiveFiveTwoPair(roster,'2026-12','2026-12-07','a',3,['2026-12-28']);
 assert.equal(fiveTwoPair(changed,'2026-11-30','a'),2);
 assert.equal(fiveTwoPair(changed,'2026-12-21','a'),3);
 assert.equal(fiveTwoPair(changed,'2026-12-28','a'),2);
});

test('approved leaves have priority over Sunday and can be attached to an account UID',()=>{
 const worker=kitchen('d',[],{accountUid:'account'});
 const roster={weekly:{},sundays:{d:date}};
 const entries=fiveTwoEntries({period:'2026-12',members:[worker],roster,dates:[date],approvedLeaves:[{uid:'account',date}]});
 assert.equal(entries[0].type,'leave');
 const result=evaluateOperationalDay({date,entries:[...work([worker],date),{uid:'account',date,type:'leave'}],people:[worker],policy});
 assert.equal(result.shifts.find(row=>row.sector==='cozinha'&&row.shift==='noite').count,0);
});

test('a holiday uses Sunday hours and cannot double-count a prep station for simultaneous montage',()=>{
 const holiday='2026-12-14';
 const people=[kitchen('Rita',['montagem','chapa']),kitchen('Nina',['montagem']),kitchen('Eva',['montagem']),kitchen('Leo')];
 const result=evaluateOperationalDay({date:holiday,entries:work(people,holiday),people,policy:{...policy,holidays:[holiday],strongPeaks:[holiday]},
  requirements:[{weekday:0,sector:'cozinha',skill:'chapa',minimum:1,start:'17:00',end:'20:00'}]});
 const row=result.shifts.find(x=>x.shift==='noite'&&x.sector==='cozinha');
 assert.deepEqual(row.window,{start:'12:00',end:'20:20'});
 assert.equal(row.minimum,4);
 assert.equal(row.skillCount,2);
 assert.equal(row.shortage,1);
});

test('Sunday move reduces shortage on the original Sunday and honors manual locks',()=>{
 const people=['A','B','C','D','E'].map(uid=>kitchen(uid));
 const from='2026-12-13', to='2026-12-06';
 const entries=[...work(people,to),...work(people.slice(0,3),from),{uid:'D',date:from,type:'monthly_sunday'},{uid:'E',date:from,type:'leave'}];
 const args={period:'2026-12',entries,people,policy,requirements:[]};
 const result=suggestSundayMove({...args,roster:{weekly:{},sundays:{D:from}}});
 assert.deepEqual([result.uid,result.from,result.to,result.improvement],['D',from,to,1]);
 assert.equal(suggestSundayMove({...args,roster:{weekly:{},sundays:{D:from},lockedSundays:['D']}}),null);
 assert.equal(suggestSundayMove({...args,entries:entries.filter(row=>!(row.date===to&&row.uid==='E')),roster:{weekly:{},sundays:{D:from}}}),null);
});

test('coverage keeps normal hours apart from the extra period and leaves unconfigured pay pending',()=>{
 const row={window:{start:'12:00',end:'20:20'}};
 const regular={scheduled:true,hours:{start:'08:00',end:'16:20'}};
 assert.deepEqual(wholeTurnAssignment(row,regular),{first:{start:'08:00',end:'16:20'},second:{start:'16:20',end:'20:20'}});
 assert.deepEqual(wholeTurnAssignment(row,{scheduled:false}),{first:null,second:row.window});
 assert.equal(wholeTurnAssignment(row,{scheduled:true,hours:{start:'05:00',end:'10:00'}}),null);
 assert.equal(forecastPaymentDate(date,null),null);
 assert.equal(forecastPaymentDate('2026-12-29',{daysAfter:5}),'2027-01-03');
 assert.equal(validOperationalPolicy(policy),true);
 assert.equal(validOperationalPolicy({...policy,holidays:['2026-02-30']}),false);
});
