import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from 'playwright';
test('V4 actual screens render and interact at mobile and desktop widths',{timeout:90000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'pipe'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4179/qa/v4-mobile.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',route=>{const b=route.request().postDataJSON()||{};const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());const a='c'.repeat(40),out='d'.repeat(40);const product={id:a,name:'Frango grelhado',status:'active',unit:'un',physicalUnit:'un',physicalBalance:{reserve:50,rotation:0,total:50,unit:'un',at:new Date().toISOString()}};
    const base={message:'Consulta de teste',products:[product,{...product,id:out,name:'Parmegiana',physicalBalance:{reserve:0,rotation:0,total:0,unit:'un'}}],catalog:[],registry:[{id:'qa-user',accountUid:'qa-user',name:'Pessoa de teste',status:'active',sector:'cozinha',shift:'manha'}],schedules:[{id:'official',period:today.slice(0,7),status:'published',entries:[{uid:'qa-user',date:today,type:'work',name:'Pessoa de teste'}]}],presence:[],tasks:[{id:'abcdefghijklmnopqrst',recipeId:'parmegiana',recipeName:'Parmegiana de frango',plannedQuantity:30,status:'pending'}],recipes:[{id:'parmegiana',name:'Parmegiana de frango',yieldQuantity:1,outputProductId:out,version:1,lines:[{productId:a,quantity:1,substitutes:[]}]}],runs:[],items:[{id:'notice',title:'Conferência das entregas',body:'Conferir itens e validade antes de encaminhar para aprovação.',priority:'important',publishedByName:'Gestão da unidade',publishedAt:new Date().toISOString()}],requests:[],closures:[],investigations:[],professional:{name:'Pessoa de teste',skills:[],certifications:[],availability:[]},personal:{},recognition:{},proposals:[],record:null,day:today,complete:true,entry:null,nextOff:null,pending:false,official:false,report:null};
    if(b.action==='todayCounts')base.products=[{productId:a,name:'Frango grelhado',at:new Date().toISOString()}];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(base)});
   });
   await page.goto('http://127.0.0.1:4179/qa/v4-mobile.html');await page.waitForTimeout(500);assert.deepEqual(errors,[],errors.join('\n'));
   for(const screen of ['Mural','Produção','Inventário','Folgas','Minha ficha','Cozinha']){
    await page.getByRole('navigation',{name:'Telas de teste'}).getByRole('button',{name:screen,exact:true}).click();
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${screen} overflows at ${width}`);
    if(screen==='Mural'){await page.getByText('Publicar comunicado',{exact:true}).click();await page.getByLabel('Título',{exact:true}).fill('Comunicado de teste');}
    if(screen==='Produção'){await page.getByRole('button',{name:'Registrar execução'}).click();await page.getByLabel('Porções produzidas',{exact:true}).fill('10');}
    if(screen==='Mural'&&width===390)await page.screenshot({path:'/tmp/triamicci-v4-mural.png',fullPage:true});
   }
   assert.deepEqual(errors,[],errors.join('\n'));await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
