import {isManagement} from '../server/permissions/v31-policy.js';
import React,{useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
const listUnits=['kg','g','L','mL','un','porcao','pacote','duzia'];
async function invoke(action,payload={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const r=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
 const d=await r.json();if(!r.ok)throw Error(d.message||'Operação não realizada.');return d;
}
function Field({name,children}){return <label>{name}{children}</label>}
export default function KitchenV3Workflows({kind,products,orders,membership,onChange}){
 const {notify}=useFeedback();const managers=isManagement(membership.role);
 const [productId,setProductId]=useState(''),[location,setLocation]=useState('reserva'),[supplier,setSupplier]=useState(''),
 [commercialUnit,setCommercialUnit]=useState('kg'),[commercialQuantity,setCommercialQuantity]=useState(''),
 [stockQuantity,setStockQuantity]=useState(''),[orderId,setOrderId]=useState(''),[lot,setLot]=useState(''),[expiry,setExpiry]=useState(''),
 [notes,setNotes]=useState(''),[quantity,setQuantity]=useState(''),[sessionId,setSessionId]=useState(()=>crypto.randomUUID()),
 [lotCounts,setLotCounts]=useState({}),[initialLotName,setInitialLotName]=useState(''),[initialLotExpiry,setInitialLotExpiry]=useState(''),[lots,setLots]=useState([]),[loadingLots,setLoadingLots]=useState(false),
 [from,setFrom]=useState('reserva'),[to,setTo]=useState('giro'),
 [outputId,setOutputId]=useState(''),[outputQty,setOutputQty]=useState(''),[outputLocation,setOutputLocation]=useState('reserva'),
 [sources,setSources]=useState([{productId:'',location:'reserva',quantity:''}]),[alternativeReason,setAlternativeReason]=useState(''),
 [busy,setBusy]=useState(false),[error,setError]=useState('');
 const productsActive=useMemo(()=>products.filter(p=>p.status==='active'),[products]);
 const chosen=products.find(p=>p.id===productId),out=products.find(p=>p.id===outputId);
 const expected=chosen?.profile?.countUnit;
 const relatedOrders=orders.filter(o=>o.items?.some(i=>i.productId===productId)&&!['cancelled','received'].includes(o.status));
 const order=orders.find(o=>o.id===orderId);
 const chosenLine=order?.items?.find(i=>i.productId===productId);
 useEffect(()=>{if(chosenLine){setCommercialUnit(chosenLine.unit);setSupplier(order.supplier);}else if(chosen?.profile?.receivingPresentation==='kg')setCommercialUnit('kg');},[productId,orderId,chosenLine?.unit]);
 useEffect(()=>{
  let alive=true;setLotCounts({});setLots([]);
  if(kind!=='count'||!productId||!chosen?.trackExpiry)return;
  setLoadingLots(true);
  invoke('v3Lots',{productId}).then(d=>{if(alive){setLots(d.lots||[]);setLotCounts(Object.fromEntries((d.lots||[]).map(l=>[l.id,'' ])));}})
   .catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoadingLots(false)});
  return()=>{alive=false};
 },[kind,productId,chosen?.trackExpiry]);
 const commit=async(action,payload,success)=>{
  if(busy)return;setBusy(true);setError('');
  try{await invoke(action,{requestId:crypto.randomUUID(),...payload});notify(success,'success');await onChange?.();setNotes('');setQuantity('');setCommercialQuantity('');setStockQuantity('');setOutputQty('');return true;}
  catch(e){setError(e.message);notify(e.message,'error');return false;}
  finally{setBusy(false);}
 };
 const productOptions=productsActive.map(p=><option value={p.id} key={p.id}>{p.profile?.displayName||p.name}</option>);
 const sourceOptions=[...(out?.profile?.sourceProductIds||[]),...(managers?(out?.profile?.alternativeProductIds||[]):[])];
 const configuredSources=sourceOptions.map(id=>products.find(p=>p.id===id)).filter(Boolean);
 const submit=e=>{
  e.preventDefault();
  if(kind==='receive')return commit('v3InspectReceive',{productId,orderId:orderId||null,supplier,
   commercialQuantity:Number(commercialQuantity),commercialUnit,stockQuantity:Number(stockQuantity||0),location,lot,expiryDate:expiry,notes},'Conferência enviada. A entrada depende da aprovação gerencial.');
  if(kind==='count'){
   if(!/^[a-f0-9-]{36}$/i.test(sessionId)){setError('Identificador da rodada inválido. Gere um novo identificador.');return;}
   if(chosen?.trackExpiry&&lots.some(l=>lotCounts[l.id]==='')){setError('Informe a contagem de cada lote, inclusive zero quando estiver vazio.');return;}
   const counts=lots.map(l=>({id:l.id,quantity:Number(lotCounts[l.id])}));
   return commit('v3Count',{productId,location,sessionId,quantity:Number(quantity),lotCounts:counts,initialLot:chosen?.trackExpiry&&!lots.length&&Number(quantity)>0?{lot:initialLotName.trim(),expiryDate:initialLotExpiry}:null,notes},'Contagem física registrada.');
  }
  if(kind==='transfer')return commit('v3Transfer',{productId,from,to,quantity:Number(quantity)},'Transferência registrada.');
  if(kind==='produce')return commit('v3Produce',{outputProductId:outputId,outputQuantity:Number(outputQty),outputLocation,inputs:sources.map(i=>({...i,quantity:Number(i.quantity)})),
   lot,expiryDate:expiry,notes,alternativeReason},'Produção concluída e saldos registrados.');
 };
 const prepared=kind==='produce';
 const relevantProduct=prepared?out:chosen;
 const locations=relevantProduct?.profile?.locations||['reserva','giro'];
 const showLot=(kind==='receive'&&chosen?.trackExpiry)||(prepared&&out?.trackExpiry);
 return <section className="v3-card v3-workflow">
  <h2>{({receive:'Receber mercadoria',count:'Conferir estoque',transfer:'Abastecer Giro ou devolver à Reserva',produce:'Registrar produção concluída'})[kind]}</h2>
  <p>{({receive:'Confira o que realmente chegou. Um pedido não é estoque antes de ser recebido.',count:'Registre o que encontrou fisicamente. Uma diferença não significa automaticamente venda ou produção.',transfer:'Mova quantidades entre locais sem baixar o total da cozinha.',produce:'Escolha a origem real da matéria-prima e informe o rendimento realmente preparado. Não fazemos conversões presumidas.'})[kind]}</p>
  {error&&<p role="alert" className="v3-error">{error}</p>}
  <form className="v3-form" onSubmit={submit}>
   {prepared?<Field name="O que foi preparado?"><select required value={outputId} onChange={e=>{setOutputId(e.target.value);setSources([{productId:'',location:'reserva',quantity:''}]);}}><option value="">Selecione um preparo</option>{productsActive.filter(p=>['internal','both'].includes(p.profile?.origin)&&p.profile?.controlMode==='quantitative').map(p=><option key={p.id} value={p.id}>{p.profile?.displayName||p.name}</option>)}</select></Field>:
    <Field name="Insumo"><select required value={productId} onChange={e=>{setProductId(e.target.value);setOrderId('')}}><option value="">Selecione um insumo</option>{productOptions}</select></Field>}
   {kind==='receive'&&<>
    <Field name="Pedido relacionado (opcional)"><select value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">Entrega sem pedido cadastrado</option>{relatedOrders.map(o=><option value={o.id} key={o.id}>{o.supplier} · {o.etaDate}</option>)}</select></Field>
    <Field name="Fornecedor"><input required maxLength={100} value={supplier} onChange={e=>setSupplier(e.target.value)}/></Field>
    <div className="v3-line"><Field name="Quanto chegou?"><input type="number" required min={["un","porcao","pacote","duzia"].includes(commercialUnit)?"1":".001"} step={["un","porcao","pacote","duzia"].includes(commercialUnit)?"1":".001"} value={commercialQuantity} onChange={e=>setCommercialQuantity(e.target.value)}/></Field>
     <Field name="Conferido em"><select value={commercialUnit} onChange={e=>setCommercialUnit(e.target.value)}>{listUnits.map(x=><option key={x}>{x}</option>)}</select></Field></div>
    {chosen?.profile?.controlMode==='quantitative'?
    <Field name={'Quantidade realmente contada para estoque ('+(expected||'não configurada')+')'}><input type="number" required min=".001" step={['un','pacote','porcao','duzia'].includes(expected)?'1':'.001'} value={stockQuantity} onChange={e=>setStockQuantity(e.target.value)} placeholder="Valor aferido, nunca convertido por suposição"/></Field>:
    <p className="v3-info">Este insumo usa disponibilidade. Registraremos o recebimento sem criar uma quantidade física presumida.</p>}
    <Field name="Armazenar em"><select value={location} onChange={e=>setLocation(e.target.value)}>{(chosen?.profile?.locations||['reserva']).map(x=><option key={x} value={x}>{x==='giro'?'Giro · 1º piso':'Reserva · 2º piso'}</option>)}</select></Field>
   </>}
   {kind==='count'&&<>
    <Field name="Onde está contando?"><select value={location} onChange={e=>setLocation(e.target.value)}>{locations.map(x=><option value={x} key={x}>{x==='reserva'?'Reserva · 2º piso':'Giro · 1º piso'}</option>)}</select></Field>
    <Field name={'Quantidade encontrada ('+(expected||'sem unidade de contagem')+')'}><input required type="number" min="0" step={['un','pacote','porcao','duzia'].includes(expected)?'1':'.001'} value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
    <Field name="Identificador da rodada de contagem"><input required value={sessionId} onChange={e=>setSessionId(e.target.value)} aria-describedby="v3-session-help"/></Field><p id="v3-session-help" className="v3-info">Use o mesmo identificador para contar Reserva e Giro na mesma rodada. Uma nova rodada deve ter um identificador diferente.</p><button type="button" className="v3-secondary" onClick={()=>setSessionId(crypto.randomUUID())}>Iniciar nova rodada</button>
    {chosen?.trackExpiry&&<fieldset><legend>Contagem de lotes no local</legend><p>Para preservar validade e rastreabilidade, informe cada lote; sem lotes cadastrados é necessário primeiro regularizar o recebimento.</p>
      {loadingLots?<p>Carregando lotes…</p>:lots.length?lots.map(l=><Field key={l.id} name={(l.lot||'Lote')+' · vence '+l.expiryDate}><input required type="number" min="0" step={['un','pacote','porcao','duzia'].includes(expected)?'1':'.001'} value={lotCounts[l.id]??''} onChange={e=>setLotCounts(old=>({...old,[l.id]:e.target.value}))}/></Field>):<div className="v3-form"><p role="status">Primeira contagem: gerente ou administrador deve identificar o lote existente antes de estabelecer o saldo.</p>{managers&&<><Field name="Lote físico inicial"><input required maxLength={80} value={initialLotName} onChange={e=>setInitialLotName(e.target.value)}/></Field><Field name="Validade do lote"><input required type="date" value={initialLotExpiry} onChange={e=>setInitialLotExpiry(e.target.value)}/></Field></>}</div>}
     </fieldset>}
   </>}
   {kind==='transfer'&&<>
    <Field name="De"><select value={from} onChange={e=>setFrom(e.target.value)}><option value="reserva">Reserva · 2º piso</option><option value="giro">Giro · 1º piso</option></select></Field>
    <Field name="Para"><select value={to} onChange={e=>setTo(e.target.value)}><option value="giro">Giro · 1º piso</option><option value="reserva">Reserva · 2º piso</option></select></Field>
    <Field name={'Quantidade ('+(expected||'não configurada')+')'}><input required type="number" min=".001" step={['un','pacote','porcao','duzia'].includes(expected)?'1':'.001'} value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
   </>}
   {prepared&&<>
    <Field name={'Quantidade preparada ('+(out?.profile?.countUnit||'não configurada')+')'}><input required type="number" min=".001" step={['un','pacote','porcao','duzia'].includes(out?.profile?.countUnit)?'1':'.001'} value={outputQty} onChange={e=>setOutputQty(e.target.value)}/></Field>
    <Field name="Onde será armazenado?"><select value={outputLocation} onChange={e=>setOutputLocation(e.target.value)}>{locations.map(x=><option value={x} key={x}>{x==='reserva'?'Reserva · 2º piso':'Giro · 1º piso'}</option>)}</select></Field>
    <fieldset><legend>Matérias-primas realmente utilizadas</legend>{sources.map((source,i)=><div className="v3-line" key={i}><Field name="Origem"><select required value={source.productId} onChange={e=>setSources(old=>old.map((x,k)=>k===i?{...x,productId:e.target.value}:x))}><option value="">Selecione</option>{configuredSources.map(x=><option value={x.id} key={x.id}>{x.profile?.displayName||x.name}</option>)}</select></Field>
      <Field name="Local"><select value={source.location} onChange={e=>setSources(old=>old.map((x,k)=>k===i?{...x,location:e.target.value}:x))}><option value="reserva">Reserva</option><option value="giro">Giro</option></select></Field>
      <Field name={'Utilizado ('+(products.find(p=>p.id===source.productId)?.profile?.countUnit||'?')+')'}><input required type="number" min=".001" step=".001" value={source.quantity} onChange={e=>setSources(old=>old.map((x,k)=>k===i?{...x,quantity:e.target.value}:x))}/></Field>
    </div>)}
     <button className="v3-secondary" type="button" onClick={()=>setSources(s=>[...s,{productId:'',quantity:'',location:'reserva'}])} disabled={sources.length>=12}>Adicionar matéria-prima</button>
    </fieldset>
    {managers&&<Field name="Motivo de substituição (obrigatório quando origem alternativa)"><textarea maxLength={240} value={alternativeReason} onChange={e=>setAlternativeReason(e.target.value)}/></Field>}
   </>}
   {showLot&&<>
    <div className="v3-line"><Field name="Lote de armazenamento"><input required maxLength={80} value={lot} onChange={e=>setLot(e.target.value)} placeholder="Identificação real"/></Field><Field name="Validade"><input required type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></Field></div>
   </>}
   {kind!=='transfer'&&<Field name="Observações (opcional)"><textarea maxLength={240} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>}
   <button type="submit" disabled={busy||(!prepared&&!chosen)||prepared&&!out||kind==='count'&&(!managers||chosen?.profile?.controlMode!=='quantitative')||kind==='count'&&chosen?.trackExpiry&&!lots.length&&!managers||kind==='transfer'&&from===to||kind==='transfer'&&chosen?.profile?.controlMode!=='quantitative'}>
    {busy?'Registrando…':({receive:'Enviar conferência',count:'Salvar contagem',transfer:'Confirmar transferência',produce:'Concluir produção'})[kind]}
   </button>
  </form>
  {kind==='receive'&&managers&&<section className="v3-approval-list" aria-label="Conferências aguardando aprovação"><h3>Aguardando aprovação gerencial</h3><p>Somente aprovar após verificar os dados conferidos. O estoque ainda não foi atualizado.</p><button type="button" className="v3-secondary" onClick={loadPending}>Atualizar pendências</button>{pendingError&&<p role="alert">{pendingError}</p>}{inspections.length===0?<p>Nenhuma conferência pendente encontrada.</p>:inspections.map(item=><article key={item.id} className="v3-card"><strong>{products.find(p=>p.id===item.productId)?.name||"Insumo"} · {item.supplier}</strong><p>Recebido: {item.commercialQuantity} {item.commercialUnit} · Saldo aferido: {item.stockQuantity} · {item.location}</p>{item.lot&&<p>Lote: {item.lot} · validade: {item.expiryDate}</p>}{item.notes&&<p>{item.notes}</p>}<button type="button" disabled={busy} onClick={()=>approve(item.id)}>{busy?"Processando…":"Aprovar entrada no estoque"}</button></article>)}</section>}
 </section>;
}
