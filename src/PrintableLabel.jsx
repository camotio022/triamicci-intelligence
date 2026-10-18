import React from 'react';
const date=d=>d?d.split('-').reverse().join('/'):'—';
export default function PrintableLabel({label,onClose}){
 if(!label)return null;
 return <div className="ti-print-modal" role="presentation">
  <section className="ti-print-box" role="dialog" aria-modal="true" aria-label="Etiqueta para impressão">
   <div className="ti-print-commands"><button type="button" onClick={()=>window.print()}>Imprimir etiqueta</button><button type="button" onClick={onClose}>Fechar</button></div>
   <div className="ti-print-paper">
    <div className="ti-print-brand">TRIAMICCI · CONTROLE DE VALIDADES</div>
    <h2>{label.productName}</h2>
    <div><strong>Lote:</strong> {label.lot}</div>
    <div><strong>Local:</strong> {label.zone==='reserva'?'RESERVA':'GIRO'}</div>
    <div><strong>Quantidade:</strong> {label.quantity} {label.quantityUnit}</div>
    <div><strong>Preparo/abertura:</strong> {date(label.startedOn)}</div>
    <div><strong>Validade de origem:</strong> {date(label.originalExpiry)}</div>
    <div className="ti-print-expiry"><strong>VALIDADE:</strong> {date(label.expiresOn)}</div>
    <small>Etiqueta ID: {label.id} · Emissor: {label.createdBy} · Condições conforme POP aprovado</small>
   </div>
  </section>
 </div>;
}
