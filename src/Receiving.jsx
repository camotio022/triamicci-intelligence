import React, { useState } from 'react';
import TriamicciHistory from './TriamicciHistory.jsx';

const initial = [
  { id: 'PED-001', product: 'Peito de frango', unit: 'kg', ordered: 12, received: '', note: '' },
  { id: 'PED-002', product: 'Batata congelada', unit: 'kg', ordered: 18, received: '', note: '' },
  { id: 'PED-003', product: 'Óleo de soja', unit: 'L', ordered: 6, received: '', note: '' },
];
const demoUser = 'Auxiliar (demonstração)';
const number = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export default function Receiving() {
  const [rows, setRows] = useState(initial);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState('');
  const update = (id, key, value) => setRows(old => old.map(row => row.id === id ? { ...row, [key]: value } : row));
  const submit = e => {
    e.preventDefault();
    if (rows.some(r => r.received.trim() === '' || !Number.isFinite(Number(r.received)) || Number(r.received) < 0)) {
      setMessage('Preencha todas as quantidades recebidas com valores válidos e não negativos.');
      return;
    }
    const timestamp = new Date().toISOString();
    const saved = rows.map(r => ({
      ...r, received: Number(r.received), difference: Number(r.received) - r.ordered,
      status: Number(r.received) === r.ordered ? 'Conferido' : 'Divergência pendente',
      recordedAt: timestamp, recordedBy: demoUser,
    }));
    setRecords(old => [...saved, ...old]);
    setMessage('Conferência registrada nesta sessão de demonstração. Nenhum dado foi enviado ao servidor.');
    setRows(initial.map(r => ({ ...r, received: '', note: '' })));
  };
  return <section className="receiving-page">
    <div className="receiving-title"><div><p className="eyebrow">OPERAÇÃO · DEMONSTRAÇÃO</p><h1>Recebimento de mercadorias</h1><p>Confira a quantidade solicitada com a quantidade física recebida. Divergências ficam pendentes de resolução.</p></div></div>
    <div className="receiving-notice">Dados fictícios. Registros mantidos apenas enquanto esta página estiver aberta; ainda não há autenticação, aprovação gerencial ou persistência.</div>
    <form onSubmit={submit} className="receiving-card">
      <h2>Conferência do pedido</h2>
      <p>Responsável demonstrativo: {demoUser}</p>
      <div className="receiving-scroll"><table className="receiving-table"><thead><tr><th>PRODUTO</th><th>PEDIDO</th><th>RECEBIDO</th><th>DIFERENÇA</th><th>OBSERVAÇÃO (OPCIONAL)</th></tr></thead><tbody>
        {rows.map(row => { const hasValue = row.received.trim() !== '' && Number.isFinite(Number(row.received)) && Number(row.received) >= 0; const diff = hasValue ? Number(row.received) - row.ordered : null;
          return <tr key={row.id}><td><strong>{row.product}</strong><small>{row.id}</small></td><td>{number(row.ordered)} {row.unit}</td><td><label className="sr-only" htmlFor={'received-'+row.id}>Quantidade recebida de {row.product} em {row.unit}</label><input id={'received-'+row.id} type="number" min="0" step="any" required value={row.received} onChange={e=>update(row.id,'received',e.target.value)} /></td><td className={diff === null ? '' : diff === 0 ? 'receiving-ok' : 'receiving-warning'}>{diff === null ? '—' : (diff > 0 ? '+' : '') + number(diff) + ' ' + row.unit}</td><td><label className="sr-only" htmlFor={'note-'+row.id}>Observação sobre {row.product}</label><input id={'note-'+row.id} value={row.note} maxLength={240} placeholder="Ex.: peso da balança" onChange={e=>update(row.id,'note',e.target.value)} /></td></tr>;
        })}
      </tbody></table></div>
      <div className="receiving-actions"><button type="submit">Registrar conferência</button><span role="status">{message}</span></div>
    </form>
    <section className="receiving-card"><TriamicciHistory title="Histórico de conferências (demonstração)" records={records}
     getId={(r)=>r.recordedAt+'-'+r.id} getDate={r=>r.recordedAt} getTitle={r=>r.product}
     getQuantity={r=>number(r.received)+' '+r.unit} getDescription={r=>r.status+' · Pedido: '+number(r.ordered)+' '+r.unit}
     getPerson={r=>r.recordedBy} renderDetails={r=><div>{r.note||'Sem observação'} · Diferença: {number(r.difference)} {r.unit}</div>}
     empty="Nenhuma conferência registrada nesta sessão."/></section>
  </section>;
}
