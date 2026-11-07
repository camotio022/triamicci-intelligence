import {configuredProduct} from '../operations/configured-product.js';
import {isOperationalProduct} from '../operations/catalog-identity.js';
import {countUnit} from '../operations/logic.js';

export function balanceProblem(product){
 const b=product?.physicalBalance;
 if(!b)return null; // Cadastro/planejamento não inventam uma contagem inicial.
 const unit=product.physicalUnit||countUnit(product);
 if(b.unit!==unit)return `${product.name||'Produto'}: saldo em ${b.unit||'unidade não informada'} e cadastro em ${unit}. Revise a unidade e concilie o saldo e os lotes antes de produzir.`;
 if(!['reserve','rotation','total'].every(k=>Number.isFinite(b[k])&&b[k]>=0)||Math.abs(b.total-b.reserve-b.rotation)>.001)return `${product.name||'Produto'}: saldo físico inconsistente; solicite conciliação à gestão.`;
 return null;
}
export function recipeAvailability(recipe,products){
 const errors=[];
 if(recipe.active!==true)errors.push('Preparação em revisão ou arquivada.');
 const ids=[...new Set([...(recipe.lines||[]).map(l=>l.productId),recipe.outputProductId].filter(Boolean))];
 for(const id of ids){
  const p=products.find(p=>p.id===id);
  if(!p||!isOperationalProduct(p)){errors.push(`${p?.name||'Insumo vinculado'}: indisponível no catálogo operacional desta unidade.`);continue;}
  const problem=balanceProblem(p);if(problem)errors.push(problem);
 }
 const output=products.find(p=>p.id===recipe.outputProductId);
 if(output&&recipe.stockEffect!=='portion_same_product'&&recipe.outputUnit&&recipe.outputUnit!==(output.physicalUnit||countUnit(output)))errors.push('A unidade de saída da ficha mudou no catálogo. Revise e ative novamente a preparação.');
 return {available:errors.length===0,errors};
}
// Apenas dependências das fichas desta página, deduplicadas. Não cria listeners.
export async function recipeProducts(db,root,recipes,productDocs,reader=db){
 const ids=new Set(recipes.flatMap(r=>[...(r.lines||[]).map(l=>l.productId),r.outputProductId].filter(Boolean)));
 const docs=productDocs.filter(d=>ids.has(d.id));
 const catalogIds=[...new Set(docs.map(d=>d.data().catalogId).filter(Boolean))];
 const [catalogs,balances,profiles]=await Promise.all([
  catalogIds.length?reader.getAll(...catalogIds.map(id=>db.collection('productCatalog').doc(id))):[],
  docs.length?reader.getAll(...docs.map(d=>root.collection('physicalBalances').doc(d.id))):[],
  docs.length?reader.getAll(...docs.map(d=>root.collection('operationalProfiles').doc(d.id))):[]
 ]);
 const catalogMap=new Map(catalogs.map(d=>[d.id,d.data()]));
 return docs.map((d,i)=>{const p=configuredProduct(d.data(),profiles[i]?.data());return {id:d.id,...p,physicalUnit:countUnit(p,catalogMap.get(p.catalogId)),physicalBalance:balances[i]?.data()||null};});
}
