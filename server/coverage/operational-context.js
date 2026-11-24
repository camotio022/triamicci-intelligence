import {summarizeStock,summarizeTasks} from '../ai/operational-context.js';

export async function readCoverageContext(unit,date) {
 const [taskSnap,productSnap,balanceSnap,orders,shipments] = await Promise.all([
  unit.collection('productionDays').doc(date).collection('tasks').limit(31).get(),
  unit.collection('products').limit(61).get(),
  unit.collection('physicalBalances').limit(61).get(),
  unit.collection('purchaseOrdersV3').limit(21).get(),
  unit.collection('receiptShipments').where('status','==','pending').limit(21).get()
 ]);
 const tasks = summarizeTasks(taskSnap.docs,[],date,taskSnap.size>30);
 const stock = summarizeStock(productSnap.docs,balanceSnap.docs,productSnap.size>60||balanceSnap.size>60);
 const records = (snapshot,count)=>snapshot.docs.slice(0,count).map(doc=>({id:doc.id,status:doc.data().status||null}));
 return {
  demand: {status:'unknown',note:'Sem previsão de pedidos de clientes por turno. Pedidos de compra não medem movimento.'},
  production: {...tasks,ids:taskSnap.docs.slice(0,30).map(doc=>doc.id),note:'Carga interna do dia. Confira o horário das tarefas para decidir se podem ser adiantadas.'},
  stock: {...stock,low:stock.items.filter(item=>item.quantity!==null&&item.minStock!=null&&item.quantity<item.minStock),unknown:stock.items.filter(item=>item.quantity===null).length},
  purchases: {records:records(orders,20),partial:orders.size>20,note:'Pedidos de compra da unidade, sem vínculo comprovado ao turno.'},
  receiving: {records:records(shipments,20),partial:shipments.size>20,note:'Conferências pendentes da unidade. Horário de chegada não confirmado.'}
 };
}
