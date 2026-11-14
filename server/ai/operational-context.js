import {restaurantDay} from '../../shared/operation-day.js';

export function classifyQuestion(question=''){
 const text=String(question).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const production=/produc|prepar|porcion|cozinha|mise en place|tarefas? do dia|o que fazer hoje|priori/.test(text);
 const stock=/estoque|saldo|quantidade|faltando|compr|insumo|produto|inventario|repor|baixo|acabando|reposic/.test(text);
 return {production,stock};
}
const short=(v,n=80)=>String(v??'').slice(0,n);
const quantity=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function summarizeTasks(docs,recipes,day,hasMore=false){
 const byId=new Map(recipes.map(r=>[r.id,r.data()]));
 const tasks=docs.slice(0,30).map(d=>{
  const t=d.data(),recipe=byId.get(t.recipeId);
  return {preparation:short(t.recipeName||recipe?.name||'Sem nome'),status:['pending','partial','completed','done'].includes(t.status)?t.status:'não informado',
   planned:quantity(t.plannedQuantity),completed:quantity(t.completedQuantity),
   unit:short(t.unit||'un',12),
   recipeKnown:!!recipe,ingredients:Array.isArray(recipe?.lines)?recipe.lines.length:null};
 });
 return {kind:'production',day,source:'tarefas registradas na produção de hoje; não é uma previsão de vendas',hasMore,tasks};
}
export function summarizeStock(products,balances,hasMore=false){
 const byId=new Map(balances.map(d=>[d.id,d.data()]));
 const items=products.slice(0,60).filter(d=>d.data().status==='active').map(d=>{
  const p=d.data(),balance=byId.get(d.id);
  const unit=short(p.unit||'',12),counted=balance&&balance.unit===p.unit?quantity(balance.total):null;
  return {name:short(p.name),unit,quantity:counted,minStock:quantity(p.minStock),
   ...(counted===null?{note:'sem contagem física compatível'}:{})};
 });
 return {kind:'stock',source:'catálogo e última contagem física disponível; não é saldo conferido em tempo real',hasMore,items};
}
export async function operationalContext(db,unitId,question){
 const intent=classifyQuestion(question),unit=db.collection('units').doc(unitId),data=[];
 if(intent.production){
  const day=restaurantDay(new Date());
  const tasks=await unit.collection('productionDays').doc(day).collection('tasks').orderBy('createdAt','asc').limit(31).get();
  const ids=[...new Set(tasks.docs.slice(0,30).map(d=>d.data().recipeId).filter(id=>typeof id==='string'&&/^[a-z0-9-]{3,64}$/.test(id)))].slice(0,12);
  const recipes=await Promise.all(ids.map(id=>unit.collection('productionRecipes').doc(id).get()));
  data.push(summarizeTasks(tasks.docs,recipes.filter(x=>x.exists),day,tasks.size>30||ids.length<new Set(tasks.docs.slice(0,30).map(d=>d.data().recipeId).filter(Boolean)).size));
 }
 if(intent.stock){
  const [products,balances]=await Promise.all([unit.collection('products').limit(61).get(),unit.collection('physicalBalances').limit(61).get()]);
  data.push(summarizeStock(products.docs,balances.docs,products.size>60||balances.size>60));
 }
 return {scope:'Unidade autenticada, somente leitura',intent,sections:data,
  ...(data.length?{}:{notice:'Não foram consultados registros operacionais para esta pergunta; responda conceitualmente e não afirme conhecer dados da unidade.'})};
}
