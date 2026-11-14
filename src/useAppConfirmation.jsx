import {useEffect,useRef,useState} from 'react';
import ConfirmSheet from './ConfirmSheet.jsx';

export default function useAppConfirmation(){
 const [message,setMessage]=useState('');
 const pending=useRef(null);

 useEffect(()=>()=>pending.current?.(false),[]);

 const askConfirmation=description=>new Promise(resolve=>{
  if(pending.current){resolve(false);return;}
  pending.current=resolve;
  setMessage(description);
 });

 const decide=accepted=>{
  const resolve=pending.current;
  pending.current=null;
  setMessage('');
  resolve?.(accepted);
 };

 const confirmationSheet=<ConfirmSheet open={Boolean(message)}
  title="Confirmar ação?" description={message}
  onCancel={()=>decide(false)} onConfirm={()=>decide(true)}/>;

 return {askConfirmation,confirmationSheet};
}
