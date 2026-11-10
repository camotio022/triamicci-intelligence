import fs from 'node:fs';
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
// Isolated synthetic fixture: all Firestore/auth access is replaced before handlers load.
const root=process.argv.find((arg,i)=>i>1&&!arg.startsWith('--'))||fileURLToPath(new URL('../',import.meta.url));
const timestamp={toDate:()=>new Date('2026-11-10T04:00:00Z'),toMillis:()=>1794283200000};
const id=n=>n.toString(16).padStart(40,'0');
const product=n=>({name:'Synthetic '+n,status:'active',unit:'kg',catalogId:'catalog'+n,operationalCatalogVersion:'56-v1',trackExpiry:false});
let events=[],fallback=false;
const makeDoc=(path,data)=>({id:path.split('/').at(-1),exists:data!==undefined,data:()=>data,ref:new Ref(path,true)});
function document(path){
 if(path.startsWith('memberships/'))return {unitId:'isolated',role:'manager',status:'active',name:'Synthetic'};
 if(path.startsWith('productCatalog/'))return {unit:'kg',operationalUnit:'kg'};
 if(path.includes('/products/'))return product(Number.parseInt(path.split('/').at(-1),16));
 if(path.includes('/physicalBalances/'))return fallback?undefined:{unit:'kg',reserve:1,rotation:1,total:2,countedTotal:2,at:timestamp};
 if(path.includes('/operationalProfiles/'))return {};
 return undefined;
}
function rows(path){
 const name=path.split('/').at(-1);let n=0;
 if(['products','operationalProfiles','physicalBalances','v3PhysicalBalances','storageLinksV1'].includes(name))n=56;
 if(name==='productionRecipes')n=10;
 if(name==='productionRuns')n=40;
 if(name==='stockSignals')n=20;
 if(name==='purchaseOrdersV3')n=10;
 if(name==='items')n=25;
 if(name==='tasks')n=20;
 if(name==='storageSpacesV1')n=4;
 if(name==='storageCountsV1')n=56;
 if(['physicalReceipts','physicalCounts','physicalOutflows','physicalTransfers'].includes(name))n=fallback?500:40;
 return Array.from({length:n},(_,i)=>{
  const key=['products','operationalProfiles','physicalBalances','v3PhysicalBalances','storageLinksV1'].includes(name)?id(i+1):String(i+1);
  let d={name:'Synthetic',status:'open',at:timestamp,createdAt:timestamp,etaDate:'2026-11-10',unit:'kg',productId:id(1),productName:'Synthetic',actorName:'Synthetic',reserve:1,rotation:1,total:2,physicalQuantity:1,quantity:1};
  if(name==='physicalCounts'&&fallback)d={...d,at:{toDate:()=>new Date(1794283200000+i*1000),toMillis:()=>1794283200000+i*1000}};
  if(name==='products')d=product(i+1);
  if(name==='productionRecipes')d={...d,active:true,preparationConfig:{},lines:Array.from({length:6},(_,j)=>({productId:id((i*6+j)%56+1),quantity:1}))};
  if(name==='storageLinksV1')d={...d,productId:key,allowedStorageIds:['1']};
  return makeDoc(path+'/'+key,d);
 });
}
class Ref{
 constructor(path,doc=false,lim=Infinity,filters=[]){this.path=path;this.isDoc=doc;this.lim=lim;this.filters=filters;this.id=path.split('/').at(-1)}
 collection(k){return new Ref(this.path+'/'+k)}doc(k){return new Ref(this.path+'/'+k,true)}
 limit(n){return new Ref(this.path,this.isDoc,n,this.filters)}orderBy(){return this}
 startAfter(cursor){return new Ref(this.path,this.isDoc,this.lim,[...this.filters,['__after','==',cursor.id]])}
 where(...args){return new Ref(this.path,this.isDoc,this.lim,[...this.filters,args])}
 async get(){
  if(this.isDoc){events.push({type:'LOOKUP',path:this.path,docs:1});return makeDoc(this.path,document(this.path))}
  let docs=rows(this.path);for(const [k,op,v] of this.filters){if(op==='=='&&k==='productId')docs=docs.filter(d=>d.data()[k]===v);if(k==='__after')docs=docs.slice(docs.findIndex(d=>d.id===v)+1)}
  docs=docs.slice(0,this.lim);events.push({type:'QUERY',path:this.path,docs:docs.length,minimumReads:Math.max(1,docs.length),limit:Number.isFinite(this.lim)?this.lim:null});return {docs,size:docs.length,empty:!docs.length};
 }
}
const db={collection:k=>new Ref(k),doc:k=>new Ref(k,true),getAll:(...refs)=>Promise.all(refs.map(r=>r.get())),runTransaction:()=>{throw Error('WRITES_FORBIDDEN_IN_HARNESS')}};
const libPath=root+'/server/_lib.js';
const real=await import(pathToFileURL(libPath));
mock.module(libPath,{namedExports:{...real,getDb:()=>db,authenticate:async()=>({uid:'synthetic'}),membership:async uid=>{const s=await db.doc('memberships/'+uid).get();return s.data()},checkRequest:()=>true}});
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN_IN_HARNESS')};
const handlers={};for(const p of ['api/products/manage.js','api/operations/stock.js','api/production/manage.js','api/members/manage.js'])handlers[p]=(await import(pathToFileURL(root+'/'+p))).default;
const output=[],responses=new Map();
for(const [path,action,extra] of [
 ['api/products/manage.js','list',{}],['api/operations/stock.js','list',{}],['api/operations/stock.js','list',{preview:true,todayOnly:true}],
 ['api/production/manage.js','list',{}],['api/production/manage.js','list',{includeProducts:true}],['api/production/manage.js','dayList',{}],['api/members/manage.js','notifications',{}],
 ['api/operations/stock.js','v3Alerts',{}],['api/operations/stock.js','v3Dashboard',{}],['api/operations/stock.js','v3Conference',{}],
 ['api/operations/stock.js','storageList',{}],['api/operations/stock.js','summary',{productId:id(1)}],['api/operations/stock.js','lots',{productId:id(1)}],
 ['api/operations/stock.js','summary',{productId:id(1),fallback:true}],
 ['api/operations/stock.js','dailyReport',{productId:id(1),fallback:true}]
]){
 fallback=!!extra.fallback;events=[];let status,body;
 const res={setHeader(){},status(s){status=s;return this},json(b){body=b;return b}};
 await handlers[path]({body:{action,...extra},headers:{},method:'POST'},res);
 assert.equal(status,200,JSON.stringify({path,action,status,body}));
 responses.set(JSON.stringify([path,action,extra]),body);
 output.push({path,action,extra,status,queryCalls:events.filter(x=>x.type==='QUERY').length,queryDocuments:events.filter(x=>x.type==='QUERY').reduce((s,x)=>s+x.docs,0),lookupReads:events.filter(x=>x.type==='LOOKUP').length,estimatedDocumentReads:events.reduce((s,x)=>s+(x.minimumReads??x.docs),0),events});
}
const productsResponse=responses.get(JSON.stringify(['api/products/manage.js','list',{}]));
const productionResponse=responses.get(JSON.stringify(['api/production/manage.js','list',{}]));
const workspaceResponse=responses.get(JSON.stringify(['api/production/manage.js','list',{includeProducts:true}]));
if(workspaceResponse.products){
 assert.deepEqual(workspaceResponse.products,productsResponse.products,'workspace must preserve the catalogue response');
 const {products,...rest}=workspaceResponse;
 assert.deepEqual(rest,productionResponse,'recipe availability, review permissions and history must remain identical');
}
if(process.argv.includes('--session')){
 const {createApiFetch}=await import(pathToFileURL(root+'/src/api-fetch.js'));
 let clock=100000,requests=0;
 const api=createApiFetch(async(url,init)=>{
  requests++;let status,body;const res={setHeader(){},status(s){status=s;return this},json(b){body=b}};
  await handlers[url.replace(/^\//,'')+'.js']({body:JSON.parse(init.body),headers:{},method:'POST'},res);
  assert.equal(status,200);return new Response(JSON.stringify(body),{status});
 },{now:()=>clock,scope:()=> 'synthetic:isolated:manager:active'});
 api.observeLive?.('synthetic:isolated',{connected:true,data:{protocolVersion:2,revision:'initial',domains:{stock:'0',catalog:'0',production:'0',notifications:'0'}}});
 const call=(url,action,extra={})=>api(url,{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action,...extra})});
 events=[];fallback=false;
 await call('/api/members/manage','notifications');await call('/api/operations/stock','v3Alerts');
 const source=fs.readFileSync(root+'/src/Production.jsx','utf8');
 const expression=source.match(/const live=useUnitLive\(membership\?\.unitId,(.*),\{domains:\['stock','catalog','production'\]\}\);/)[1];
 const load=()=>source.includes("{includeProducts:true}")?call('/api/production/manage','list',{includeProducts:true}):Promise.all([call('/api/products/manage','list'),call('/api/production/manage','list')]);
 const loadTasks=()=>call('/api/production/manage','dayList');
 const callback=new Function('load','loadTasks','return ('+expression+')')(load,loadTasks);
 for(let i=0;i<98;i++){await callback(true,null);clock+=30000;}
 const session={test:'one synthetic user, provider once, 98 Production initial callbacks separated by 30s, zero writes',requests,queryCalls:events.filter(x=>x.type==='QUERY').length,queryDocuments:events.filter(x=>x.type==='QUERY').reduce((s,x)=>s+x.docs,0),lookupReads:events.filter(x=>x.type==='LOOKUP').length,estimatedDocumentReads:events.reduce((s,x)=>s+(x.minimumReads??x.docs),0)};
 if(workspaceResponse.products&&api.observeLive)assert.ok(session.estimatedDocumentReads<=3000,'unchanged-session read budget exceeded');
 events=[];fallback=true;requests=0;
 for(let i=0;i<34;i++){await call('/api/operations/stock','summary',{productId:id(1)});clock+=30000;}
 console.log(JSON.stringify([session,{test:'34 summary requests with missing accumulated balance, zero writes',requests,queryDocuments:events.filter(x=>x.type==='QUERY').reduce((s,x)=>s+x.docs,0),lookupReads:events.filter(x=>x.type==='LOOKUP').length,estimatedDocumentReads:events.reduce((s,x)=>s+(x.minimumReads??x.docs),0)}],null,2));
}else console.log(JSON.stringify(output,null,2));
