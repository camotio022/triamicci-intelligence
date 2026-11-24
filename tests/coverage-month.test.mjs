import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {evaluateCoverageMonth} from '../server/coverage/month.js';

test('monthly coverage exposes every Sunday and withholds extra counts on incomplete drafts',()=>{
 const date='2026-11-29';
 const person={uid:'cook',status:'active',jobTitle:'Cozinheiro',shift:'noite',sector:'cozinha',
  availability:[{day:'dom',start:'12:00',end:'20:20'}]};
 const plan={period:'2026-11',status:'draft',roster:{weekly:{},sundays:{}},entries:[{date,uid:person.uid,type:'work'}]};
 const result=evaluateCoverageMonth({plan,people:[person],requirements:[],policy:{}});
 assert.equal(result.days.length,30);
 assert.equal(result.days.filter(day=>day.sunday).length,5);
 assert.equal(result.extra,null);
 assert.equal(result.days.at(-1).unplanned,true);
 assert.equal(result.days.find(day=>day.date===date).shifts.find(row=>row.sector==='cozinha'&&row.shift==='noite').count,1);
 const published=evaluateCoverageMonth({plan:{...plan,status:'published'},people:[person],requirements:[],policy:{},leaves:[{date,uid:'cook',type:'leave'}]});
 assert.equal(published.days.find(day=>day.date===date).shifts.find(row=>row.sector==='cozinha'&&row.shift==='noite').count,0);
 assert.equal(typeof published.extra,'number');
});

test('coverage month renders before the plan and the assessment arrive',async()=>{
 const vite=await createServer({server:{middlewareMode:true,ws:false,hmr:false},appType:'custom'});
 try{
  const {default:CoverageMonth}=await vite.ssrLoadModule('/src/CoverageMonth.jsx');
  assert.equal(renderToStaticMarkup(createElement(CoverageMonth,{plan:null})), '');
  const html=renderToStaticMarkup(createElement(CoverageMonth,{
   plan:{id:'nov',period:'2026-11',status:'published'},today:'2026-11-24'
  }));
  assert.match(html,/Conferindo os turnos do mês/);
 }finally{await vite.close();}
});

test('monthly projection distinguishes unknown staffing from confirmed vacancies and excludes legacy proposals',()=>{
 const date='2026-11-23';
 const person={uid:'cook',status:'active',jobTitle:'Cozinheiro',shift:'noite',sector:'cozinha',
  availability:[{day:'seg',start:'14:00',end:'22:20'}]};
 const plan={period:'2026-11',status:'published',entries:[{date,uid:'cook',type:'work'}]};
 const result=evaluateCoverageMonth({plan,people:[person],requirements:[],policy:{}});
 const rows=result.days.find(day=>day.date===date).shifts;
 const kitchen=rows.find(row=>row.sector==='cozinha'&&row.shift==='noite');
 const front=rows.find(row=>row.sector==='frente'&&row.shift==='noite');
 assert.equal(kitchen.confirmedDeficit,true);
 assert.equal(kitchen.extra,1);
 assert.equal(front.uncertain,true);
 assert.equal(front.confirmedDeficit,false);
 assert.equal(front.extra,0);
});
