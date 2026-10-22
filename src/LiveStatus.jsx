import React from 'react';
import {Radio,CloudOff} from 'lucide-react';
export default function LiveStatus({state}){
 const live=state.status==='live';
 return <span className={'ti-live-status '+(live?'is-live':'')} role="status">
  {live?<Radio size={14} aria-hidden="true"/>:<CloudOff size={14} aria-hidden="true"/>}
  {live?'Ao vivo':state.status==='error'?(state.errorCode==='permission-denied'?'Atualização automática sem permissão':'Sincronização indisponível'):state.status==='connecting'?'Conectando':'Reconectando'}
  {!live&&state.updatedAt&&<small>Atualizado às {state.updatedAt.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</small>}
 </span>;
}
