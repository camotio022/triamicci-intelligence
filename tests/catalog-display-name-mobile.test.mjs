import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

test('catálogo usa nome configurado na lista, no título e após salvar e reabrir',{timeout:90000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4194','--strictPort'],{stdio:'pipe'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4194/qa/v4-mobile.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:1000}}),id='b'.repeat(40),saved=[];
   const product={id,name:'Farinha para empanar / mistura para empanar',status:'active',unit:'kg',profile:{displayName:'Farinha de Rosca',aliases:['Farinha parme'],controlMode:'availability',origin:'supplier',locations:['reserva'],version:2}};
   await page.route('**/api/**',async route=>{
    const body=route.request().postDataJSON()||{};
    if(body.action==='v3ProfileSave'){saved.push(body);product.profile={...body.profile,version:3};}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({products:[product],signals:[],orders:[],items:[],members:[],requests:[],schedules:[],presence:[]})});
   });
   await page.goto('http://127.0.0.1:4194/qa/v4-mobile.html');
   await page.getByRole('navigation',{name:'Telas de teste'}).getByRole('button',{name:'Contagem',exact:true}).click();
   await page.getByRole('button',{name:'Consultas e gestão',exact:true}).click();
   await page.getByRole('button',{name:'Gestão de Insumos',exact:true}).click();
   const tile=page.locator('.ti-insumos-item');
   await tile.getByText('Farinha de Rosca',{exact:true}).waitFor();
   assert.match(await tile.innerText(),/Disponibilidade/);
   assert.doesNotMatch(await tile.innerText(),/Farinha para empanar|availability/);
   await tile.locator('summary').click();
    await tile.getByRole('button',{name:'Configurar insumo',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Configuração do insumo'});
   await dialog.getByRole('heading',{name:'Farinha de Rosca',exact:true}).waitFor();
   await dialog.getByLabel('Nome claro e único que será exibido').fill('Farinha de Rosca fina');
   for(let i=0;i<3;i++)await dialog.getByRole('button',{name:'Próximo',exact:true}).click();
   await dialog.getByRole('button',{name:'Confirmar configuração',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await tile.getByText('Farinha de Rosca fina',{exact:true}).waitFor();
   assert.equal(saved.length,1);assert.equal(saved[0].productId,id);assert.equal(saved[0].expectedVersion,2);
   assert.equal(product.name,'Farinha para empanar / mistura para empanar');
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   await tile.getByText('Farinha de Rosca fina',{exact:true}).waitFor();
   await tile.locator('summary').click();
    await tile.getByRole('button',{name:'Configurar insumo',exact:true}).click();
   await dialog.getByRole('heading',{name:'Farinha de Rosca fina',exact:true}).waitFor();
   assert.equal(await dialog.getByLabel('Nome claro e único que será exibido').inputValue(),'Farinha de Rosca fina');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await page.close();
  }
 }finally{await browser?.close();server.kill('SIGTERM');}
});
