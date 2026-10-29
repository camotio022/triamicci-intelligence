// Percorre documentos por ID: não depende de índice composto nem da ordenação de datas.
// Limita o trabalho por chamada e preserva o cursor mesmo em páginas sem contagens do dia.
export async function todayCountPage(collection,{before,start,end,pageSize=12,scanLimit=1000}={}){
 const selected=[];let cursor=before||null,scanned=0;
 while(scanned<scanLimit){
  let query=collection.orderBy('__name__');
  if(cursor)query=query.startAfter(cursor);
  const limit=Math.min(pageSize-selected.length,scanLimit-scanned),snap=await query.limit(limit).get();
  for(const doc of snap.docs){
   cursor=doc.id;scanned++;
   const value=doc.data().at,at=value?.toDate?.()||value;
   const time=at instanceof Date?at.getTime():NaN;
   if(time>=start.getTime()&&time<end.getTime())selected.push(doc);
   if(selected.length===pageSize)return {selected,nextCursor:cursor};
  }
  if(snap.size<limit)return {selected,nextCursor:null};
 }
 return {selected,nextCursor:cursor};
}
