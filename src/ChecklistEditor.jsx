import React,{useState} from 'react';
import {ArrowUp,ArrowDown,Plus,Trash2} from 'lucide-react';
const roles={auxiliar:'Auxiliar',cook:'Cozinheiro',manager:'Gerente',submanager:'Subgerente',admin:'Administrador'};
const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const blankItem=()=>({id:crypto.randomUUID(),title:'',guidance:'',required:true,critical:false,photoRequired:false,allowNA:false});
export default function ChecklistEditor({template,duplicate,call,onSaved,onCancel}){
 const [id]=useState(()=>duplicate||!template?crypto.randomUUID():template.id);
 const [model,setModel]=useState(()=>structuredClone(template?.draft||template?.published||{name:'',moment:'other',frequency:'daily',dueTime:'',weekdays:[],roles:['cook','auxiliar'],items:[blankItem()]}));
 const [revision,setRevision]=useState(duplicate?0:template?.revision||0),[saved,setSaved]=useState(!duplicate&&template?.hasDraft===true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[removed,setRemoved]=useState(null);
 const update=(key,value)=>{setModel(m=>({...m,[key]:value}));setSaved(false);};
 const editItem=(index,key,value)=>{setModel(m=>({...m,items:m.items.map((item,i)=>i===index?{...item,[key]:value,...(key==='critical'&&value?{required:true,allowNA:false}:{})}:item)}));setSaved(false);};
 const move=(index,delta)=>{const next=[...model.items];[next[index],next[index+delta]]=[next[index+delta],next[index]];update('items',next);};
 const save=async e=>{e.preventDefault();setBusy(true);setError('');try{await call('saveTemplate',{id,model,expectedRevision:revision});setRevision(v=>v+1);setSaved(true);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const publish=async()=>{setBusy(true);setError('');try{await call('publishTemplate',{id,expectedRevision:revision});onSaved('Checklist publicado.');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="ti-check-card ti-check-editor" aria-label="Configurar checklist">
  <h2>{duplicate?'Duplicar modelo':template?'Editar modelo':'Novo modelo'}</h2><p>Você define os itens da sua unidade. Alterações valem para novas listas; conferências já geradas ficam preservadas.</p>
  <form onSubmit={save}><fieldset disabled={busy}>
   <label>Nome do checklist<input required maxLength={100} value={model.name} onChange={e=>update('name',e.target.value)}/></label>
   <div className="ti-check-grid"><label>Momento<select value={model.moment} onChange={e=>update('moment',e.target.value)}><option value="opening">Abertura</option><option value="closing">Fechamento</option><option value="other">Outro</option></select></label><label>Horário limite<input type="time" required value={model.dueTime} onChange={e=>update('dueTime',e.target.value)}/></label></div>
   <label>Quando aparece<select value={model.frequency} onChange={e=>update('frequency',e.target.value)}><option value="daily">Todos os dias</option><option value="weekdays">Dias da semana</option><option value="manual">Avulso, ao iniciar</option></select></label>
   {model.frequency==='weekdays'&&<fieldset className="ti-check-choices"><legend>Dias da semana</legend>{weekdays.map((name,index)=><label key={name}><input type="checkbox" checked={model.weekdays.includes(index)} onChange={()=>update('weekdays',model.weekdays.includes(index)?model.weekdays.filter(x=>x!==index):[...model.weekdays,index])}/>{name}</label>)}</fieldset>}
   <fieldset className="ti-check-choices"><legend>Quem confere</legend>{Object.entries(roles).map(([value,label])=><label key={value}><input type="checkbox" checked={model.roles.includes(value)} onChange={()=>update('roles',model.roles.includes(value)?model.roles.filter(x=>x!==value):[...model.roles,value])}/>{label}</label>)}</fieldset>
   <h3>Itens de conferência</h3>
   {!model.items.length&&<p role="status">Nenhum item no modelo. Você pode salvar o rascunho; para publicar, adicione pelo menos um item.</p>}
   {removed&&<button type="button" className="secondary" onClick={()=>{const next=[...model.items];next.splice(Math.min(removed.index,next.length),0,removed.item);update('items',next);setRemoved(null);}}>Desfazer exclusão do item</button>}
   {model.items.map((item,index)=><section className="ti-check-edit-item" key={item.id} aria-label={'Item '+(index+1)}>
    <div className="ti-check-item-tools"><strong>Item {index+1}</strong><div><button type="button" className="secondary icon" aria-label={'Subir item '+(index+1)} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={18}/></button><button type="button" className="secondary icon" aria-label={'Descer item '+(index+1)} disabled={index===model.items.length-1} onClick={()=>move(index,1)}><ArrowDown size={18}/></button><button type="button" className="secondary ti-check-remove" aria-label={'Excluir item '+(index+1)} onClick={()=>{setRemoved({item,index});update('items',model.items.filter((_,i)=>i!==index));}}><Trash2 size={18}/> Excluir item</button></div></div>
    <label>O que conferir<input required maxLength={160} value={item.title} onChange={e=>editItem(index,'title',e.target.value)}/></label>
    <label>Orientação (opcional)<textarea maxLength={600} value={item.guidance} onChange={e=>editItem(index,'guidance',e.target.value)}/></label>
    <div className="ti-check-choices">{[['required','Obrigatório'],['critical','Crítico'],['photoRequired','Foto na hora'],['allowNA','Permitir não se aplica']].map(([key,label])=><label key={key}><input type="checkbox" checked={item[key]} disabled={item.critical&&['required','allowNA'].includes(key)} onChange={e=>editItem(index,key,e.target.checked)}/>{label}</label>)}</div>
   </section>)}
   <button type="button" className="secondary" disabled={model.items.length>=40} onClick={()=>update('items',[...model.items,blankItem()])}><Plus size={18}/> Adicionar item</button>
   {error&&<p role="alert" className="ti-check-alert">{error}</p>}
   {saved&&<p role="status" className="ti-check-success">Rascunho salvo. Revise e publique para liberar à equipe.</p>}
   <div className="ti-check-actions ti-check-editor-actions"><button type="button" className="secondary" onClick={()=>onCancel()}>Voltar</button><button type="submit" className="secondary">Salvar rascunho</button><button type="button" disabled={!saved||busy||model.items.length===0} onClick={publish}>Publicar checklist</button></div>
  </fieldset></form>
 </section>;
}
