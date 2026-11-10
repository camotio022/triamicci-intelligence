import {readOperationalCatalog} from '../operations/read-catalog.js';
import {recipeAvailability,recipeProducts} from './readiness.js';
import {send} from '../_lib.js';
import {isManagement} from '../permissions/v31-policy.js';
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=d=>({id:d.id,...d.data(),at:iso(d.data().at),updatedAt:iso(d.data().updatedAt)});
// Authenticated dispatcher owns the tenant; only read composition lives here.
export default async function productionWorkspace(req,res,{db,unit,member}){
 const recipes=unit.collection('productionRecipes'),runs=unit.collection('productionRuns');
   const includeProducts=req.body?.includeProducts===true;
   const [r,p,available]=await Promise.all([recipes.orderBy('name').limit(100).get(),runs.orderBy('at','desc').limit(30).get(),includeProducts?readOperationalCatalog(db,unit):unit.collection('products').limit(201).get()]);
   if(available.tooLarge||available.size>200)return send(res,409,'Catálogo acima do limite desta consulta.');
   const products=includeProducts?available.contextProducts:await recipeProducts(db,unit,r.docs.filter(d=>d.data().active===true).map(d=>d.data()),available.docs);
   const reviewed=r.docs.filter(d=>d.data().preparationConfig||d.data().configurationDraft).map(d=>({...clean(d),...recipeAvailability(d.data(),products)}));
   return send(res,200,'Produção carregada.',{...(includeProducts?{products:available.products}:{}),recipes:reviewed.filter(r=>r.available&&r.preparationConfig),blockedRecipes:reviewed.filter(r=>r.active===true&&(!r.available||!r.preparationConfig)).map(r=>({id:r.id,name:r.name,errors:r.errors})),...(isManagement(member.role)?{reviewRecipes:reviewed}:{}),runs:p.docs.map(clean)});
}
