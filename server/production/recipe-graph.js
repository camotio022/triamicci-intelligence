export function hasRecipeCycle(recipes){
 const graph=new Map();
 for(const recipe of recipes){
  if(!recipe.outputProductId)continue;
  const edges=graph.get(recipe.outputProductId)||new Set();
  for(const line of recipe.lines||[])for(const id of [line.productId,...(line.substitutes||[])])edges.add(id);
  graph.set(recipe.outputProductId,edges);
 }
 const active=new Set(),done=new Set();
 const visit=id=>{if(active.has(id))return true;if(done.has(id))return false;active.add(id);for(const next of graph.get(id)||[])if(visit(next))return true;active.delete(id);done.add(id);return false;};
 return [...graph.keys()].some(visit);
}
