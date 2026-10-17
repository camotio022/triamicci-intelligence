import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';

async function api(path,action,extra={}){
 const user=auth.currentUser;if(!user)throw Error('Sessão expirada.');
 const token=await user.getIdToken();
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...extra})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Erro de comunicação.');return data;
}
const fmt=at=>at?new Date(at).toLocaleString('pt-BR'):'—';
const qty=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:3});
const numeric=(s)=>s===''?null:Number(s);
export default function PhysicalStock({membership,mode='receive'}){
 const [products,setProducts]=useState([]),[history,setHistory]=useState({receipts:[],counts:[]});
 const [productId,setProductId]=useState(''),[supplier,setSupplier]=useState(''),[weight,setWeight]=useState('');
 const [amount,setAmount]=useState(''),[reserve,setReserve]=useState(''),[rotation,setRotation]=useState('');
 const [lot,setLot]=useState(''),[expiry,setExpiry]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const canReceive=['admin','manager'].includes(membership.role);
 const load=useCallback(async()=>{
  try{
   const [p,h]=await Promise.all([api('/api/products/manage','list'),api('/api/operations/stock','list')]);
   setProducts(p.products||[]);setHistory({receipts:h.receipts||[],counts:h.counts||[]});
  }catch(e){setStatus(e.message)}
 },[]);
 useEffect(()=>{load()},[load]);
 const p=products.find(x=>x.id===productId);
 const physicalUnit=['alcatra-bife','alcatra-cubos','frango-file-120g'].includes(p?.catalogId)?'un':p?.unit||'un';
 const previous=history.counts.find(c=>c.productId===productId);
 const total=numeric(reserve)!==null&&numeric(rotation)!==null?Number(reserve)+Number(rotation):null;
 const submit=async e=>{
  e.preventDefault();if(busy||!p)return;
  setBusy(true);setStatus('');
  try{
   const requestId=crypto.randomUUID();
   if(mode==='receive'){
    if(!canReceive)throw Error('Só administrador ou gerente registra recebimentos.');
    await api('/api/operations/stock','receive',{productId,requestId,supplier:supplier.trim(),
     deliveredWeightKg:weight===''?null:Number(weight),physicalQuantity:Number(amount),
     lot:lot.trim(),expiryDate:expiry,notes:notes.trim()});
    setAmount('');setWeight('');setNotes('');setLot('');setExpiry('');
   }else{
    await api('/api/operations/stock','count',{productId,requestId,reserve:Number(reserve),rotation:Number(rotation),notes:notes.trim()});
    setReserve('');setRotation('');setNotes('');
   }
   setStatus('Registro salvo no Firebase.');await load();
  }catch(e){setStatus(e.message)}finally{setBusy(false)}
 };
 const rows=mode==='receive'?history.receipts:history.counts;
 return <section className="receiving-page">
  <p className="eyebrow">OPERAÇÃO · FIREBASE · {membership.unitId}</p>
  <h1>{mode==='receive'?'Recebimento de mercadorias':'Contagem diária — reserva e giro'}</h1>
  <p>{mode==='receive'?'Registre a mercadoria conferida com a quantidade física efetivamente recebida.':
    'Informe o estoque físico encontrado em cada área; confira o histórico antes de salvar.'}</p>
  <div className="receiving-notice">Estes registros são reais e auditados no Firestore. O saldo legado do catálogo ainda não é alterado automaticamente: a conciliação e o controle de lotes serão homologados separadamente.</div>
  {mode==='receive'&&!canReceive?<p>Somente administrador ou gerente pode registrar recebimentos.</p>:
  <form className="receiving-card" onSubmit={submit}>
   <h2>{mode==='receive'?'Conferir entrega':'Registrar contagem'}</h2>
   <div className="inventory-fields">
    <label>Produto<select required value={productId} onChange={e=>{setProductId(e.target.value);setStatus('')}}>
     <option value="">Selecione o produto da unidade</option>{products.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
    {mode==='receive'?<>
     <label>Fornecedor<input required minLength={1} maxLength={160} value={supplier} onChange={e=>setSupplier(e.target.value)} /></label>
     <label>Quantidade física recebida ({physicalUnit})<input required type="number" min="0.001" step={physicalUnit==='un'?'1':'0.001'} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label>Peso entregue (kg), quando houver<input type="number" min="0.001" step="0.001" value={weight} onChange={e=>setWeight(e.target.value)}/></label>
     {p?.trackExpiry&&<>
      <label>Lote<input required maxLength={80} value={lot} onChange={e=>setLot(e.target.value)}/></label>
      <label>Validade<input required type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
     </>}
    </>:<>
     <label>Reserva ({physicalUnit})<input required type="number" min="0" step={physicalUnit==='un'?'1':'0.001'} value={reserve} onChange={e=>setReserve(e.target.value)}/></label>
     <label>Giro ({physicalUnit})<input required type="number" min="0" step={physicalUnit==='un'?'1':'0.001'} value={rotation} onChange={e=>setRotation(e.target.value)}/></label>
    </>}
    <label>Observação<input maxLength={240} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   </div>
   {mode==='count'&&<p><strong>Total agora:</strong> {total===null?'—':qty(total)+' '+physicalUnit}. <strong>Última contagem:</strong> {previous?qty(previous.reserve+previous.rotation)+' '+previous.unit+' em '+fmt(previous.at):'Não registrada'}</p>}
   <button type="submit" disabled={busy||!productId}>{busy?'Salvando...':mode==='receive'?'Salvar recebimento':'Salvar contagem'}</button>
   {status&&<p role="status">{status}</p>}
  </form>}
  <section className="receiving-card"><div className="inventory-list-header"><h2>Histórico real</h2><button type="button" onClick={load}>Atualizar</button></div>
   {rows.length===0?<p>Nenhum registro salvo nesta unidade.</p>:
    <div className="receiving-scroll"><table className="receiving-table"><thead><tr><th>QUANDO</th><th>PRODUTO</th><th>QUANTIDADE</th><th>RESPONSÁVEL</th></tr></thead><tbody>
     {rows.map(r=><tr key={r.id}><td>{fmt(r.at)}</td><td>{r.productName}</td><td>{mode==='receive'?qty(r.physicalQuantity)+' '+r.unit:qty(r.reserve)+' reserva + '+qty(r.rotation)+' giro ('+r.unit+')'}</td><td>{r.actorUid}</td></tr>)}
    </tbody></table></div>}
  </section>
 </section>;
}
