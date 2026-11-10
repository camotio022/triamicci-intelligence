import {requestJson} from './api-client.js';
import React,{useEffect,useMemo,useState} from 'react';
import {X,ChefHat} from 'lucide-react';
import './storage-manager.css';
async function api(action,extra={}){
 return requestJson('/api/operations/stock',{action,...extra},{sessionMessage:'Faça login novamente.',formatError:data=>data.message||'Operação indisponível.'});
}
export default function StoragePreparation({storages,links,products,onClose,onChange}){
 const [origin,setOrigin]=useState('shipment'),[options,setOptions]=useState({shipments:[],runs:[]}),[shipment,setShipment]=useState(''),[lineIndex,setLineIndex]=useState(''),[sourceProduct,setSourceProduct]=useState(''),[sourceStorage,setSourceStorage]=useState(''),[outputProduct,setOutputProduct]=useState(''),[outputStorage,setOutputStorage]=useState(''),[sourceQuantity,setSourceQuantity]=useState(''),[outputQuantity,setOutputQuantity]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;api('storageProductionOptions').then(r=>{if(active){setOptions(r);setReady(true)}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
 const selectedShipment=options.shipments?.find(x=>x.id===shipment);
 const selectedLine=lineIndex===''?null:selectedShipment?.lines?.[Number(lineIndex)];
 const source=origin==='shipment'?selectedLine?.productId||'':sourceProduct;
 const primary=links.find(x=>x.productId===outputProduct);
 const eligible=storages.filter(x=>primary?.allowedStorageIds?.includes(x.id));
 const sourceEligible=storages.filter(x=>links.find(l=>l.productId===sourceProduct)?.allowedStorageIds?.includes(x.id));
 const valid=source&&outputProduct&&outputStorage&&Number(sourceQuantity.replace(',','.'))>0&&Number(outputQuantity.replace(',','.'))>0&&(origin==='shipment'?Boolean(selectedLine):Boolean(sourceStorage));
 const submit=async()=>{if(!valid||busy)return;setBusy(true);setError('');try{const result=await api('storagePrepare',{requestId:crypto.randomUUID(),sourceType:origin,shipmentId:origin==='shipment'?shipment:null,lineIndex:origin==='shipment'?Number(lineIndex):null,sourceProductId:source,sourceStorageId:origin==='stored'?sourceStorage:null,sourceQuantity:Number(sourceQuantity.replace(',','.')),outputProductId:outputProduct,outputStorageId:outputStorage,outputQuantity:Number(outputQuantity.replace(',','.')),notes:note});onChange?.(result.message);onClose()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <div className="ti-storage-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-label="Preparação do insumo" className="ti-storage-sheet ti-storage-preparation">
  <div className="ti-storage-sheet-head"><h2><ChefHat size={20}/> Registrar preparação</h2><button aria-label="Fechar" onClick={onClose}><X size={20}/></button></div>
  <p>Registre a matéria-prima e o rendimento real. O produto final será contado e validado pela gestão antes de entrar no saldo da nova estrutura.</p>
  <label>De onde vem o insumo?<select value={origin} onChange={e=>{setOrigin(e.target.value);setSourceQuantity('')}}><option value="shipment">Recebimento pendente</option><option value="stored">Armazenamento conferido</option></select></label>
  {origin==='shipment'?<><label>Recebimento<select value={shipment} onChange={e=>{setShipment(e.target.value);setLineIndex('')}}><option value="">Selecionar entrega</option>{(options.shipments||[]).map(s=><option key={s.id} value={s.id}>{s.supplier||'Fornecedor'} · {s.id.slice(0,8)}</option>)}</select></label><label>Matéria-prima recebida<select value={lineIndex} onChange={e=>setLineIndex(e.target.value)}><option value="">Selecionar insumo</option>{(selectedShipment?.lines||[]).filter(l=>l.stockUnit&&l.stockQuantity>0).map(l=><option key={l.lineIndex} value={String(l.lineIndex)}>{l.productName} · {l.stockQuantity} {l.stockUnit}</option>)}</select></label></>:<><label>Matéria-prima<select value={sourceProduct} onChange={e=>{setSourceProduct(e.target.value);setSourceStorage('')}}><option value="">Selecionar insumo</option>{products.filter(p=>p.status==='active'&&links.some(l=>l.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Armazenamento de origem<select value={sourceStorage} onChange={e=>setSourceStorage(e.target.value)}><option value="">Selecione</option>{sourceEligible.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></>}
  <label>Quantidade utilizada {selectedLine?.stockUnit?'('+selectedLine.stockUnit+')':''}<input inputMode="decimal" value={sourceQuantity} onChange={e=>setSourceQuantity(e.target.value)} placeholder="Quantidade real"/></label>
  <label>Produto resultante<select value={outputProduct} onChange={e=>{setOutputProduct(e.target.value);setOutputStorage('')}}><option value="">Selecionar insumo único</option>{products.filter(p=>p.status==='active'&&links.some(l=>l.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Destino previsto<select value={outputStorage} onChange={e=>setOutputStorage(e.target.value)}><option value="">Selecione</option>{eligible.map(s=><option key={s.id} value={s.id}>{s.name} · {s.area==='reserva'?'Reserva':'Giro'}</option>)}</select></label>
  <label>Quantidade produzida <input inputMode="decimal" value={outputQuantity} onChange={e=>setOutputQuantity(e.target.value)} placeholder="Rendimento final contado"/></label>
  <label>Observações (opcional)<input maxLength={240} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: filés porcionados para iscas"/></label>
  {error&&<div role="alert" className="ti-storage-error">{error}</div>}
  {!ready&&<p>Carregando recebimentos pendentes…</p>}
  <button className="ti-storage-primary" disabled={!ready||busy||!valid} onClick={submit}>{busy?'Registrando…':'Registrar rendimento'}</button>
  <p className="ti-storage-disclaimer">O rendimento é informado pela cozinha, nunca presumido. Nenhuma entrada automática no saldo antigo.</p>
 </section></div>;
}
