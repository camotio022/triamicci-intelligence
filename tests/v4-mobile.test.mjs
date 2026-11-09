import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from 'playwright';
test('V4 actual screens render and interact at mobile and desktop widths',{timeout:90000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'pipe'});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4179/qa/v4-mobile.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],counts=[],reads=[],finishes=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',route=>{const b=route.request().postDataJSON()||{};reads.push({path:new URL(route.request().url()).pathname,action:b.action});const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());const a='c'.repeat(40),out='d'.repeat(40);const product={id:a,name:'Frango grelhado',status:'active',unit:'un',physicalUnit:'un',physicalBalance:{reserve:50,rotation:0,total:50,unit:'un',at:new Date().toISOString()}};
    const base={message:'Consulta de teste',shipments:[],people:[],accounts:[],claims:[],notifications:[],members:[],orders:[],signals:[],products:[product,{...product,id:out,name:'Parmegiana',physicalBalance:{reserve:0,rotation:0,total:0,unit:'un'}}],catalog:[],registry:[{id:'qa-user',accountUid:'qa-user',name:'Pessoa de teste',status:'active',sector:'cozinha',shift:'manha'}],schedules:[{id:'official',period:today.slice(0,7),status:'published',entries:[{uid:'qa-user',date:today,type:'work',name:'Pessoa de teste'}]}],presence:[],tasks:[{id:'abcdefghijklmnopqrst',recipeId:'parmegiana',recipeName:'Parmegiana de frango',plannedQuantity:30,status:'pending'}],recipes:[{id:'parmegiana',name:'Parmegiana de frango',yieldQuantity:1,outputProductId:out,version:1,lines:[{productId:a,quantity:1,substitutes:[]}]}],runs:[{id:'qa-today',recipeName:'Produção de hoje',portions:1,at:new Date().toISOString(),items:[]},{id:'qa-old',recipeName:'Produção da semana passada',portions:1,at:new Date(Date.now()-7*86400000).toISOString(),items:[]}],items:[{id:'notice',title:'Conferência das entregas',body:'Conferir itens e validade antes de encaminhar para aprovação.',priority:'important',publishedByName:'Gestão da unidade',publishedAt:new Date().toISOString()}],requests:[],closures:[],investigations:[],professional:{name:'Pessoa de teste',skills:[],certifications:[],availability:[]},personal:{},recognition:{},proposals:[],record:null,day:today,complete:true,entry:null,nextOff:null,pending:false,official:false,report:null};
    if(b.action==='list'&&route.request().url().includes('/api/production/manage')){
     base.recipes.push({id:'isca-medida',name:'Isca de tilápia',stockEffect:'measured_transformation',outputProductId:'f'.repeat(40),outputUnit:'un',yieldQuantity:1,lines:[{productId:'e'.repeat(40),quantity:null,location:'reserva',substitutes:[]}]});
     base.blockedRecipes=[{id:'blocked',name:'Preparação bloqueada',errors:['Matéria-prima desativada no catálogo.']}];
    }
    if(b.action==='list'&&route.request().url().includes('/api/products/manage'))base.products.push({id:'e'.repeat(40),name:'Tilápia em kg',unit:'kg',physicalUnit:'kg',status:'active'},{id:'f'.repeat(40),name:'Isca pronta',unit:'un',physicalUnit:'un',status:'active',lotTrackingMode:'per_lot'});
    if(b.action==='finish')finishes.push(b);
    if(b.module==='operationalCatalog'&&b.action==='status')base.items=[{id:'bacon',active:false,reason:'missing_profile',needsReconciliation:true,matches:[{id:'e'.repeat(40),name:'Bacon',configuration:{stockUnit:'un',operationalUnit:'un',receivingUnit:'kg',source:'supplier',trackExpiry:false,minStock:5,countFrequency:'daily',critical:true}}]}];
    if(b.action==='shipmentsList'){base.shipments=[{id:'closed',status:'approved',supplier:'Entrega recente',createdAt:new Date().toISOString(),lines:[]}];base.pendingShipments=[{id:'pending-old',status:'pending',supplier:'Pendência antiga de teste',createdAt:'2020-01-01T12:00:00Z',lines:[]}];base.pendingComplete=true;}
    if(b.action==='list'&&route.request().url().includes('/api/operations/stock'))base.productions=base.runs;
    if(b.action==='v3Count')counts.push(b);
    if(['v3Dashboard','v3Conference'].includes(b.action))base.products=[{...product,catalogId:'bacon',operationalCatalogVersion:'56-v1',name:'Bacon',trackExpiry:true,unit:'kg',profile:{origin:'supplier',controlMode:'quantitative',countUnit:'kg',locations:['reserva','giro']},v3Balance:{reserva:1,giro:1,total:2,unit:'kg'}}];
    if(b.action==='v3Lots')base.lots=[];
    if(b.action==='todayCounts')base.products=[{productId:a,name:'Frango grelhado',at:new Date().toISOString()}];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(base)});
   });
   await page.goto('http://127.0.0.1:4179/qa/v4-mobile.html');await page.waitForTimeout(500);assert.deepEqual(errors,[],errors.join('\n'));
   const signal=async(stock,attendance)=>{const response=await fetch('http://127.0.0.1:8080/v1/projects/demo-triamicci-v31/databases/(default)/documents/units/qa-unit/live/attendance',{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:{protocolVersion:{integerValue:'2'},revision:{stringValue:stock+attendance},domains:{mapValue:{fields:{stock:{stringValue:stock},attendance:{stringValue:attendance}}}}}})});assert.equal(response.ok,true)};
   await signal('stock-initial','attendance-initial');
   for(const screen of ['Escalas','Mural','Produção','Inventário','Folgas','Minha ficha','Cozinha','Recebimento','Recebimento pendente','Recebimento com lote','Contagem','Acessos','Cadastro','Navegação'].filter(s=>!process.env.QA_SCREEN||s===process.env.QA_SCREEN)){
    const beforeReads=reads.length;
    await page.getByRole('navigation',{name:'Telas de teste'}).getByRole('button',{name:screen,exact:true}).click();
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${screen} overflows at ${width}`);
    if(screen==='Escalas'){
     await page.getByLabel('Mês de referência',{exact:true}).fill('2026-11');
     const field=page.getByLabel('Mês de referência',{exact:true});
     assert.equal(await field.evaluate(el=>el.getBoundingClientRect().right<=el.closest('.ti-planning-card').getBoundingClientRect().right),true,'Campo de mês cabe no cartão');
     if(width<=760){
      await page.getByText('Consultar escala por dia',{exact:true}).click();
      const day=page.getByLabel('Dia para consultar',{exact:true});
      assert.equal(await day.isVisible(),true,'Filtro diário disponível no celular');
      await day.fill('2026-11-12');
      assert.equal(await day.inputValue(),'2026-11-12');
      assert.equal(await page.locator('.ti-schedule-matrix').isVisible(),false,'Matriz larga oculta no mobile');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Escala mobile não transborda a página');
     }else{
      await page.getByText('Ver grade mensal completa',{exact:true}).click();
      assert.equal(await page.locator('.ti-schedule-matrix').isVisible(),true,'Matriz completa disponível no desktop');
     }
    }
    if(screen==='Mural'){assert.equal(await page.getByText('Jornadas declaradas',{exact:true}).count(),1);assert.equal(await page.getByText('0 em trabalho ou intervalo declarado',{exact:true}).count(),1);await page.getByText('Publicar comunicado',{exact:true}).click();await page.getByLabel('Título',{exact:true}).fill('Comunicado de teste');}
    if(screen==='Produção'){if(width===390)await page.screenshot({path:'/tmp/triamicci-production-today-390.png',fullPage:true});await page.getByRole('navigation',{name:'Seções da produção'}).getByRole('button',{name:'Histórico',exact:true}).click();assert.equal(await page.getByText('Produção da semana passada',{exact:true}).isVisible(),false);await page.getByRole('region',{name:'Histórico de produção',exact:true}).getByRole('button',{name:'Todos',exact:true}).click();assert.equal(await page.getByText('Produção da semana passada',{exact:true}).isVisible(),true);const history=page.getByRole('region',{name:'Histórico de produção',exact:true});await history.getByRole('button',{name:'Personalizado',exact:true}).click();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());await history.getByLabel('De',{exact:true}).fill(today);await history.getByLabel('Até',{exact:true}).fill(today);assert.equal(await page.getByText('Produção da semana passada',{exact:true}).count(),0);await page.getByRole('navigation',{name:'Seções da produção'}).getByRole('button',{name:'Hoje',exact:true}).click();await page.getByRole('button',{name:'Registrar execução'}).click();await page.getByLabel('Quantidade produzida (un)',{exact:true}).fill('10');
     assert.equal(await page.getByText('1 preparação precisa de revisão',{exact:true}).isVisible(),true);await page.getByRole('navigation',{name:'Seções da produção'}).getByRole('button',{name:'Preparações',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Preparações da unidade'}).isVisible(),true);assert.equal(await page.getByText('Fichas anteriores',{exact:false}).count(),0,'Ficha legada não deve aparecer na interface');assert.equal(await page.getByRole('option',{name:'Criar nova ficha',exact:true}).count(),0);await page.getByRole('navigation',{name:'Seções da produção'}).getByRole('button',{name:'Hoje',exact:true}).click();
     const execution=page;await execution.getByLabel('Preparação para registrar produção',{exact:true}).selectOption('isca-medida');
     const raw=execution.getByLabel('Quantidade realmente utilizada (kg)',{exact:true});assert.equal(await raw.inputValue(),'','Transformação não presume consumo');await raw.fill('2');
     await execution.getByLabel('Quantidade produzida (un)',{exact:true}).fill('5');assert.equal(await raw.inputValue(),'2','Alterar rendimento não recalcula matéria-prima');
     await execution.getByLabel('Lote do preparo final',{exact:true}).fill('ISCA-UI');await execution.getByLabel('Validade do preparo',{exact:true}).fill('2099-12-30');await execution.getByRole('checkbox').check();page.once('dialog',dialog=>dialog.accept());await execution.getByRole('button',{name:'Confirmar transformação na reserva',exact:true}).click();
     await page.getByRole('status').filter({hasText:'Consulta de teste'}).first().waitFor();assert.equal(finishes.at(-1).portions,5);assert.equal(finishes.at(-1).items[0].quantity,2);assert.equal(finishes.at(-1).taskId,null,'Execução avulsa não conclui tarefa anterior');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Transformação cabe em '+width);
    }
    if(screen==='Cozinha'){
     await page.getByRole('button',{name:/Produção de hoje/}).first().waitFor();
     assert.equal(await page.getByRole('heading',{name:'Operação da cozinha',exact:true}).count(),1);
     assert.equal(await page.getByText('Produção da semana passada',{exact:true}).count(),0);
     const ownReads=()=>reads.slice(beforeReads).filter(r=>r.action==='list'&&['/api/products/manage','/api/operations/stock'].includes(r.path)).length;
     assert.equal(ownReads(),2,'Uma carga de catálogo e uma do resumo, sem duplicação inicial');
     await signal('stock-initial','attendance-changed');await page.waitForTimeout(150);
     assert.equal(ownReads(),2,'Presença não recarrega estoque nem produção da cozinha');
     await signal('stock-changed','attendance-changed');
     for(let n=0;n<30&&ownReads()<4;n++)await page.waitForTimeout(100);
     assert.equal(ownReads(),4,'Mudança de estoque atualiza a cozinha uma única vez');
     assert.deepEqual(errors,[],errors.join('\n'));
    }
    if(['Recebimento','Recebimento pendente','Recebimento com lote'].includes(screen))await page.getByRole('button',{name:'＋ Nova conferência',exact:true}).click();
    if(screen==='Recebimento'){
     assert.equal(await page.getByText('Pendência antiga de teste',{exact:true}).count(),1,'Pendência antiga não desaparece com a paginação do histórico');
     await page.getByLabel('Fornecedor da entrega não prevista',{exact:true}).fill('Fornecedor teste');
     await page.getByLabel('Por que a entrega não estava prevista?').fill('Compra experimental autorizada');
     await page.getByRole('button',{name:'Conferir itens',exact:true}).click();await page.screenshot({path:'/tmp/v4-receive-step-'+width+'.png',fullPage:true});
     await page.getByLabel('Produto do item 1',{exact:true}).selectOption('c'.repeat(40));
     await page.getByLabel('Quanto chegou?').fill('5');
     if(await page.getByLabel('Quantidade física conferida (un)').count())await page.getByLabel('Quantidade física conferida (un)').fill('5'); // Unidades iguais: quantidade física acompanha o peso/contagem informada.
     assert.equal(await page.getByLabel('Lote',{exact:true}).count(),0,'Recebimento padrão não deve exigir lote individual');
     await page.getByRole('button',{name:'Revisar conferência',exact:true}).click();
     assert.equal(await page.getByText('Revisar antes de enviar',{exact:true}).count(),1);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Recebimento review overflows at ${width}`);
    }
    if(screen==='Recebimento pendente'){
     await page.getByRole('combobox',{name:'Entrega',exact:true}).selectOption('11111111-1111-4111-8111-111111111111');
     await page.getByRole('button',{name:'Conferir itens',exact:true}).click();
     assert.equal(await page.getByLabel('Produto do item 1').inputValue(),'c'.repeat(40),'The ordered product must remain selected without an operational profile');
     assert.match(await page.getByRole('alert').innerText(),/precisa de configuração para recebimento/);
     await page.getByLabel('Quanto chegou?').fill('1');
     assert.equal(await page.getByRole('button',{name:'Revisar conferência',exact:true}).isDisabled(),true);
     assert.equal(await page.getByRole('button',{name:'Configurar produto do pedido',exact:true}).count(),1);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Pending receipt overflows at ${width}`);
    }
    if(screen==='Recebimento com lote'){
     await page.getByLabel('Fornecedor da entrega não prevista',{exact:true}).fill('TESTE LOTES');
     await page.getByLabel('Por que a entrega não estava prevista?').fill('Conferência de teste com validade');
     await page.getByRole('button',{name:'Conferir itens',exact:true}).click();
     await page.getByLabel('Produto do item 1',{exact:true}).selectOption('c'.repeat(40));
     await page.getByLabel('Quanto chegou?').fill('1');
     assert.equal(await page.getByLabel('Lote',{exact:true}).count(),1);
     await page.getByRole('button',{name:'Revisar conferência',exact:true}).click();
     assert.equal(await page.getByText('Revisar antes de enviar',{exact:true}).count(),0,'Lote obrigatório não pode ser omitido');
     await page.getByLabel('Lote',{exact:true}).fill('TESTE-LOTE');
     await page.getByLabel('Validade',{exact:true}).fill('2099-12-31');
     await page.getByRole('button',{name:'Revisar conferência',exact:true}).click();
     assert.equal(await page.getByText('Revisar antes de enviar',{exact:true}).count(),1);
    }
    if(screen==='Contagem'){
     const dismissMessages=async()=>{for(let i=0;i<4&&await page.getByRole('button',{name:'Fechar mensagem',exact:true}).count();i++)await page.getByRole('button',{name:'Fechar mensagem',exact:true}).first().click();};
     await dismissMessages();
     await page.getByRole('button',{name:'Operações',exact:true}).click();
     await page.getByRole('button',{name:'Contagem oficial',exact:true}).click();
     for(const area of ['Reserva','Giro']){
      await page.getByRole('navigation',{name:'Área de conferência'}).getByRole('button',{name:area,exact:true}).click();
      await page.getByRole('button',{name:'Contar',exact:true}).first().click();
      await page.getByLabel('Quantidade encontrada',{exact:true}).fill('1');
      await page.getByLabel('Lote físico inicial',{exact:true}).fill('TESTE-LOTE');
      await page.getByLabel('Validade do lote',{exact:true}).fill('2099-12-31');
      await page.getByRole('button',{name:'Confirmar e próximo',exact:true}).click();
      await page.getByRole('navigation',{name:'Área de conferência'}).waitFor();
      await dismissMessages();
     }
     assert.equal(counts.length,2);assert.equal(counts[0].sessionId,counts[1].sessionId);
     assert.deepEqual(counts.map(c=>c.location),['reserva','giro']);
    }
    if(screen==='Acessos'){
     for(const role of ['admin','manager','submanager','cook','auxiliar']){
      await page.getByRole('navigation',{name:'Perfis de homologação'}).getByRole('button',{name:'Perfil '+role,exact:true}).click();
      const management=['admin','manager','submanager'].includes(role);
      const menuToggle=page.getByRole('button',{name:'Abrir menu',exact:true});
      if(await menuToggle.isVisible()&&await menuToggle.getAttribute('aria-expanded')!=='true')await menuToggle.click();
      const sidebar=page.locator('#primary-sidebar');
      const adminGroup=sidebar.getByRole('button',{name:'Administração',exact:true});
      assert.equal(await adminGroup.count(),management?1:0,'Grupo Administração respeita perfil '+role);
      if(management&&await adminGroup.getAttribute('aria-expanded')!=='true')await adminGroup.click();
      const adminNav=sidebar.getByRole('button',{name:'Gestão de Insumos',exact:true});
      assert.equal(await adminNav.count(),management?1:0,'Menu respeita perfil '+role);
      if(management){
       await adminNav.click();
       await page.getByRole('heading',{name:'Gestão de Insumos',exact:true}).waitFor();
       await page.getByRole('button',{name:'Configurar 56 produtos Validar e ativar insumos da nova lista',exact:true}).click();
       await page.getByRole('button',{name:'Bacon Configuração pendente · Proteínas e carnes',exact:true}).click();
       await page.getByRole('heading',{name:'Configuração da cozinha preservada',exact:true}).waitFor();
       assert.equal(await page.getByRole('combobox',{name:'Unidade de estoque',exact:true}).inputValue(),'un');
       assert.equal(await page.getByRole('combobox',{name:'Unidade de recebimento',exact:true}).inputValue(),'kg');
       assert.equal(await page.getByLabel('Exigir controle de validade',{exact:true}).isChecked(),false);
       assert.equal(await page.getByLabel('Estoque mínimo',{exact:true}).inputValue(),'5');

      }
      if(!management)assert.equal(await page.getByRole('heading',{name:'Administração · Catálogo',exact:true}).count(),0,'Revogar papel fecha área administrativa');
     }
    }
    if(screen==='Cadastro'){
     await page.getByLabel('Buscar na equipe').fill('Pessoa');await page.getByRole('button',{name:'Abrir ficha',exact:true}).click();
     const dialog=page.getByRole('dialog');await dialog.waitFor();
     assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
     await page.keyboard.press('Shift+Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
     await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
    }
    if(screen==='Navegação'){
     if(await page.getByRole('button',{name:'Abrir menu',exact:true}).isVisible()&&await page.getByRole('button',{name:'Abrir menu',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
     await page.locator('#primary-sidebar').getByRole('button',{name:'Estoque e insumos',exact:true}).click();
     await page.getByRole('navigation',{name:'Seções de estoque e insumos',exact:true}).getByRole('button',{name:'Hoje',exact:true}).click();
     await page.getByPlaceholder('Nome do insumo').fill('Frango');
     if(await page.getByRole('button',{name:'Abrir menu',exact:true}).isVisible()&&await page.getByRole('button',{name:'Abrir menu',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
     await page.locator('#primary-sidebar').getByRole('button',{name:'Produção',exact:true}).click();
     await page.goBack();await page.waitForTimeout(200);
     assert.equal(await page.getByPlaceholder('Nome do insumo').inputValue(),'Frango');
    }
    if(screen==='Mural'&&width===390)await page.screenshot({path:'/tmp/triamicci-v4-mural.png',fullPage:true});
   }
   assert.deepEqual(errors,[],errors.join('\n'));await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
