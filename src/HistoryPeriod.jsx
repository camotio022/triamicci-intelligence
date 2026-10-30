import React from 'react';
export default function HistoryPeriod({from,to,onFrom,onTo}){
 return <div className="ti-history-period"><label>De<input type="date" value={from} max={to||undefined} onChange={e=>onFrom(e.target.value)}/></label><label>Até<input type="date" value={to} min={from||undefined} onChange={e=>onTo(e.target.value)}/></label><button type="button" onClick={()=>{onFrom('');onTo('')}}>Limpar período</button><small>O filtro considera os registros carregados nesta consulta.</small></div>;
}
