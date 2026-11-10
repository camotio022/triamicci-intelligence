import test from 'node:test';
import assert from 'node:assert/strict';
import {readOperationalCatalog} from '../server/operations/read-catalog.js';
import {recipeAvailability} from '../server/production/readiness.js';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
const snap=(id,data)=>({id,data:()=>data});
function fixture({size=2}={}){
 const reads=[];
 const docs={products:[snap(a,{name:'Original',status:'active',operationalCatalogVersion:'56-v1',unit:'kg',catalogId:'one',internalSecret:'not serialized'}),snap(b,{name:'Inactive',status:'inactive',operationalCatalogVersion:'56-v1',unit:'kg',catalogId:'one'}),snap(c,{name:'Unreviewed',status:'active',unit:'kg'})],physicalBalances:[snap(a,{unit:'un',reserve:2,rotation:1,total:3,countedTotal:3,countId:'private-history-id'})],operationalProfiles:[snap(a,{displayName:'Configured',countUnit:'un',version:1})]};
 const unit={collection:name=>({limit(n){return {async get(){reads.push({name,limit:n});return {docs:docs[name],size:name==='products'?size:docs[name].length}}}}})};
 const db={collection:name=>({doc:id=>({name,id})}),async getAll(...refs){reads.push({definitions:refs});return refs.map(r=>snap(r.id,{operationalUnit:'kg'}))}};
 return {db,unit,reads};
}
test('workspace shares one bounded catalogue pass and deduplicates definitions',async()=>{
 const f=fixture(),result=await readOperationalCatalog(f.db,f.unit);
 assert.equal(f.reads.length,4);assert.equal(f.reads[3].definitions.length,1);
 assert.deepEqual(f.reads.slice(0,3).map(r=>r.limit),[201,201,201]);
 assert.equal(result.products.length,2,'unreviewed products remain outside the public catalogue');
 const p=result.products.find(p=>p.id===a);assert.equal(p.name,'Configured');assert.equal(p.unit,'un');assert.equal(p.physicalBalance.total,3);
 assert.equal(p.internalSecret,undefined);assert.equal(p.physicalBalance.countId,undefined);
 assert.equal(result.contextProducts.find(p=>p.id===a).physicalBalance.countId,'private-history-id','server readiness retains full authoritative context');
 assert.equal(recipeAvailability({active:true,lines:[{productId:a}]},result.contextProducts).available,true);
 assert.equal(recipeAvailability({active:true,lines:[{productId:b}]},result.contextProducts).available,false,'inactive dependencies remain blocked');
 assert.equal(recipeAvailability({active:true,lines:[{productId:c}]},result.contextProducts).available,false,'unreviewed dependencies remain blocked');
});
test('oversized catalogues fail before definitions are fetched; never truncate operational data',async()=>{
 const f=fixture({size:201});assert.deepEqual(await readOperationalCatalog(f.db,f.unit),{tooLarge:true});assert.equal(f.reads.length,3);
});
