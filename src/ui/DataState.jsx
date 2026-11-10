import React from 'react';
export default function DataState({title,error,onRetry}){
 return <section className="inventory-page"><h1>{title}</h1>{error?<><p role="alert">Dados indisponíveis. {error} Nenhum saldo zero foi confirmado.</p><button type="button" onClick={onRetry}>Tentar novamente</button></>:<p role="status">Consultando dados…</p>}</section>;
}
