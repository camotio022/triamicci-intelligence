import React,{createContext,useCallback,useContext,useMemo,useState} from 'react';
import {CheckCircle2,AlertCircle,Info,X} from 'lucide-react';
import './feedback.css';
const Context=createContext(null);
let counter=0;
export function FeedbackProvider({children}){
 const [messages,setMessages]=useState([]);
 const dismiss=useCallback(id=>setMessages(old=>old.filter(m=>m.id!==id)),[]);
 const notify=useCallback((message,type='info')=>{
  const id=++counter;
  setMessages(old=>[...old.slice(-3),{id,message:String(message),type}]);
  return id;
 },[]);
 const value=useMemo(()=>({notify,dismiss}),[notify,dismiss]);
 return <Context.Provider value={value}>{children}<div className="ti-feedback-stack" aria-label="Mensagens da operação">
 {messages.map(m=><section key={m.id} className={'ti-feedback ti-feedback-'+m.type} role={m.type==='error'?'alert':'status'}>
  {m.type==='success'?<CheckCircle2 size={20}/>:m.type==='error'?<AlertCircle size={20}/>:<Info size={20}/>}
  <span>{m.message}</span><button type="button" aria-label="Fechar mensagem" onClick={()=>dismiss(m.id)}><X size={18}/></button>
 </section>)}</div></Context.Provider>;
}
export function useFeedback(){
 const result=useContext(Context);
 if(!result)throw Error('FeedbackProvider ausente');
 return result;
}
