import React,{useState} from 'react';
import {normalizeProductName} from '../server/operations/catalog-identity.js';
import './preparation-setup.css';

export default function PreparedProductForm({products,call,onCreated,onCancel,initialName='',portionWeight='',weightUnit='g'}){
 const [form,setForm]=useState({name:initialName,category:'Preparações',unit:'porcao',portionWeight:portionWeight||'',weightUnit,minStock:'0',countFrequency:'weekly',expiry:''});
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[candidate,setCandidate]=useState(null),[reviewing,setReviewing]=useState(null);
 const [requestId]=useState(()=>crypto.randomUUID());
 const existing=products.find(p=>normalizeProductName(p.name)===normalizeProductName(form.name));
 const set=(key,value)=>{setForm(f=>({...f,[key]:value}));setConfirmed(false);setError('');};
 const lookup=async()=>{const r=await call('/api/products/manage','preparedLookup',{name:form.name});setCandidate(r.candidate||null);return r.candidate;};
 const consult=async()=>{if(busy)return;setBusy(true);setError('');try{const found=await lookup();if(!found)setError('Nenhum cadastro anterior encontrado. Confira os campos para cadastrar um novo insumo.');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const submit=async e=>{
  e.preventDefault();if(busy||!confirmed||existing&&!reviewing)return;
  setBusy(true);setError('');
  try{
   if(!reviewing&&await lookup()){setConfirmed(false);return;}
   const r=await call('/api/products/manage','createPrepared',{name:form.name,category:form.category,unit:form.unit,minStock:Number(form.minStock),countFrequency:form.countFrequency,trackExpiry:form.expiry==='yes',portionWeight:['porcao','un'].includes(form.unit)&&form.portionWeight!==''?Number(form.portionWeight):null,weightUnit:form.weightUnit,reviewConfirmed:confirmed,requestId,...(reviewing?{existingProductId:reviewing.id,expectedRevision:reviewing.revision}:{})});
   await onCreated(r.product);
  }catch(e){setError(e.message);if(e.data?.candidate)setCandidate(e.data.candidate);}finally{setBusy(false);}
 };
 return <section className="prep-setup" aria-label="Cadastrar insumo preparado"><h3>Cadastrar insumo preparado</h3>
  <p className="prep-info">Produto feito na cozinha, no mesmo catálogo da unidade. Cadastrar não lança saldo nem consome matéria-prima.</p>
  {candidate&&!reviewing&&<aside className="prep-pending"><strong>Cadastro anterior encontrado: {candidate.name}</strong><p>Contagem: {candidate.unit}. Validade: {candidate.trackExpiry?'controlada':'não controlada'}. {candidate.physicalBalance?`Saldo físico registrado: ${candidate.physicalBalance.total} ${candidate.physicalBalance.unit}.`:`Saldo legado: ${candidate.quantity} ${candidate.unit}; sem contagem física confirmada.`}</p><button type="button" className="prep-secondary" onClick={()=>{setReviewing(candidate);setForm(f=>({...f,name:candidate.name,category:candidate.category,unit:candidate.unit,minStock:String(candidate.minStock),countFrequency:candidate.countFrequency,expiry:candidate.trackExpiry?'yes':'no',portionWeight:candidate.portionWeight??f.portionWeight,weightUnit:candidate.weightUnit}));setError('');setConfirmed(false);}}>Revisar e reaproveitar cadastro existente</button></aside>}
  {reviewing&&<p className="prep-info">Revisando o cadastro existente. ID, histórico, unidade, validade e saldos serão preservados. O peso pronto não converte os saldos anteriores.</p>}
  {error&&<p role="alert" className="prep-error">{error}</p>}
  <form className="prep-form" onSubmit={submit}>
   <label>Nome do novo insumo<input aria-label="Nome do novo insumo" required minLength={3} maxLength={100} disabled={busy||Boolean(reviewing)} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
   {!reviewing&&<button type="button" className="prep-secondary" disabled={busy||form.name.trim().length<3} onClick={consult}>Consultar cadastro existente</button>}
   <label>Categoria do novo insumo<input aria-label="Categoria do novo insumo" required minLength={2} maxLength={60} disabled={busy} value={form.category} onChange={e=>set('category',e.target.value)}/></label>
   {existing&&<aside className="prep-pending"><strong>Este insumo já existe: {existing.name}.</strong>{existing.status==='active'?<button type="button" className="prep-secondary" disabled={busy} onClick={()=>onCreated(existing)}>Usar insumo existente</button>:<p>Revise o cadastro inativo na Administração. Ele não será duplicado.</p>}</aside>}
   <label>Como contar o insumo pronto?<select aria-label="Como contar o insumo pronto?" value={form.unit} disabled={busy||Boolean(reviewing)} onChange={e=>set('unit',e.target.value)}><option value="porcao">Porções</option><option value="un">Unidades</option><option value="kg">Quilogramas (kg)</option><option value="g">Gramas (g)</option><option value="L">Litros (L)</option><option value="ml">Mililitros (ml)</option></select></label>
   {['porcao','un'].includes(form.unit)&&<fieldset><legend>Peso padrão pronto · opcional</legend><div className="prep-grid"><label>Peso padrão da porção<input aria-label="Peso padrão da porção" type="number" min="0.001" max="100000" step="0.001" disabled={busy} value={form.portionWeight} onChange={e=>set('portionWeight',e.target.value)}/></label><label>Unidade do peso padrão<select aria-label="Unidade do peso padrão" disabled={busy} value={form.weightUnit} onChange={e=>set('weightUnit',e.target.value)}><option value="g">g</option><option value="kg">kg</option></select></label></div><small>Descreve a porção pronta. Não determina quanto de matéria-prima foi consumido.</small></fieldset>}
   <label>Estoque mínimo do novo insumo<input aria-label="Estoque mínimo do novo insumo" required type="number" min="0" max="100000" step={['porcao','un'].includes(form.unit)?'1':'.001'} disabled={busy} value={form.minStock} onChange={e=>set('minStock',e.target.value)}/></label>
   <label>Frequência de contagem do novo insumo<select aria-label="Frequência de contagem do novo insumo" disabled={busy} value={form.countFrequency} onChange={e=>set('countFrequency',e.target.value)}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="on_demand">Sob demanda</option></select></label>
   <label>Controle de validade do novo insumo<select aria-label="Controle de validade do novo insumo" required disabled={busy||Boolean(reviewing)} value={form.expiry} onChange={e=>set('expiry',e.target.value)}><option value="">Selecione após conferir</option><option value="yes">Exigir lote e validade na produção</option><option value="no">Sem controle de validade neste cadastro</option></select></label>
   <label className="prep-check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Conferi o novo insumo, a unidade de contagem e a validade.</label>
   <div className="prep-actions"><button type="button" className="prep-secondary" disabled={busy} onClick={onCancel}>Voltar sem cadastrar</button><button type="submit" className="prep-primary" disabled={busy||!confirmed||Boolean(existing&&!reviewing)}>{busy?'Salvando…':reviewing?'Validar cadastro existente sem alterar saldo':'Cadastrar insumo sem lançar saldo'}</button></div>
  </form>
 </section>;
}
