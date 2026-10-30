import {apiFetch} from './api-fetch.js';
import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {AreaChart,Area,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer,PieChart,Pie,Cell} from 'recharts';
import {Package,ArrowDownRight,ArrowUpRight,AlertTriangle,RefreshCcw} from 'lucide-react';

const colors=['#A71916','#007934','#D88B20','#6B5555','#8C726A','#B5A5A0'];
const format=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
function Kpi({icon:Icon,label,value,detail}){
  return <article className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon size={19}/></span></div><p className="metric-label">{label}</p><strong className="metric-value">{value}</strong><p className="metric-detail">{detail}</p></article>;
}
export default function Dashboard({membership,onInventory}){
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const token=await auth.currentUser.getIdToken();
      const res=await apiFetch('/api/dashboard/summary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});
      const json=await res.json();
      if(!res.ok)throw new Error(json.message||'Erro ao carregar indicadores.');
      setData(json);
    }catch(e){setData(null);setError(e.message);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  return <section className="real-dashboard">
    <div className="page-heading"><div><p className="eyebrow">UNIDADE {membership.unitId.toUpperCase()} · DADOS DO FIREBASE</p><h1>Visão geral 👋</h1><p className="subheading">Informações operacionais reais, sem números demonstrativos.</p></div>
      <button className="period-button" type="button" onClick={load} disabled={loading}><RefreshCcw size={16}/>{loading?'Atualizando...':'Atualizar dados'}</button></div>
    {error&&<p role="alert" className="dashboard-error">{error}</p>}
    {loading&&!data&&<p>Carregando dados do Firebase...</p>}
    {data&&<>
      <section className="metric-grid">
        <Kpi icon={Package} label="Insumos cadastrados" value={format(data.productCount)} detail={format(data.activeCount)+' ativos'}/>
        <Kpi icon={ArrowUpRight} label="Entradas (7 dias)" value={format(data.entries)} detail="número de operações"/>
        <Kpi icon={ArrowDownRight} label="Saídas (7 dias)" value={format(data.exits)} detail="número de operações"/>
        <Kpi icon={AlertTriangle} label="Atenção ao estoque" value={format(data.attentionCount)} detail="insumos no mínimo ou abaixo"/>
      </section>
      <section className="charts-grid">
        <article className="panel consumption-panel"><div className="panel-heading"><div><h2>Movimentações nos últimos 7 dias</h2><p>Quantidade de operações, sem somar kg, litros e unidades.</p></div></div>
          <div className="chart-legend"><span><i className="legend-dot outgoing"/> Saídas</span><span><i className="legend-dot incoming"/> Entradas</span></div>
          {data.entries + data.exits === 0 ? <p className="dashboard-empty dashboard-chart-empty">Ainda não há movimentações registradas nos últimos 7 dias.</p> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.days} margin={{top:8,right:8,left:-18,bottom:0}}>
            <CartesianGrid stroke="#edf0f5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#9299a8',fontSize:12}}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:'#9299a8',fontSize:11}}/>
            <Tooltip formatter={v=>[v+' operações','']}/><Area type="monotone" dataKey="exit" name="Saídas" stroke="#A71916" strokeWidth={2} fill="#A71916" fillOpacity={0.1}/><Area type="monotone" dataKey="entry" name="Entradas" stroke="#007934" strokeWidth={2} fill="transparent"/>
          </AreaChart></ResponsiveContainer></div>}
        </article>
        <article className="panel category-panel"><div className="panel-heading"><div><h2>Insumos por categoria</h2><p>Participação dos produtos ativos no catálogo.</p></div></div>
          {data.categories.length?<><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categories} dataKey="value" nameKey="name" innerRadius={65} outerRadius={88} paddingAngle={3}>{data.categories.map((item,i)=><Cell key={item.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={v=>[v+' insumos','']}/></PieChart></ResponsiveContainer></div>
          <div className="category-legend">{data.categories.map((item,i)=><div className="category-row" key={item.name}><span><i style={{background:colors[i%colors.length]}}/>{item.name}</span><b>{item.value}</b></div>)}</div></>:<p className="dashboard-empty">Ainda não existem insumos ativos.</p>}
        </article>
      </section>
      <section className="panel stock-panel"><div className="panel-heading stock-heading"><div><h2>Estoque que precisa de atenção</h2><p>Produtos ativos com saldo igual ou inferior ao mínimo cadastrado.</p></div><button type="button" className="link-button" onClick={onInventory}>Ver estoque</button></div>
        {data.lowProducts.length?<div className="table-wrap"><table><thead><tr><th>INSUMO</th><th>CATEGORIA</th><th>SALDO</th><th>MÍNIMO</th></tr></thead><tbody>{data.lowProducts.map(p=><tr key={p.id}><td><b>{p.name}</b></td><td>{p.category}</td><td>{format(p.quantity)} {p.unit}</td><td>{format(p.minStock)} {p.unit}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty">Nenhum insumo abaixo do mínimo cadastrado.</p>}
        {data.attentionCount>10&&<p className="dashboard-empty">Mostrando 10 de {data.attentionCount} itens; consulte o estoque para mais detalhes.</p>}
      </section>
      <p className="dashboard-updated">Última consulta: {new Date(data.generatedAt).toLocaleString('pt-BR')} · Operações: últimos 7 dias · Sem dados de custo ou faturamento cadastrados.</p>
    </>}
  </section>;
}
