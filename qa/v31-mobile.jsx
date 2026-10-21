import React from 'react';
import {createRoot} from 'react-dom/client';
import {FeedbackProvider} from '../src/FeedbackProvider.jsx';
import PublishedRoster from '../src/PublishedRoster.jsx';
import KitchenV3Workflows from '../src/KitchenV3Workflows.jsx';
import KitchenV3Loss from '../src/KitchenV3Loss.jsx';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
import '../src/kitchen.css';
import '../src/operations-planning.css';
import '../src/people-hub.css';

const today=restaurantDay();
const roster={period:today.slice(0,7),entries:[
 {uid:'worker-1',date:today,type:'work',name:'Funcionário de exemplo'},
 {uid:'worker-2',date:today,type:'off',name:'Colega de exemplo'}
]};
const products=[{id:'a'.repeat(40),name:'Produto de exemplo',status:'active',
 profile:{displayName:'Produto de exemplo',controlMode:'quantitative',countUnit:'un',origin:'supplier',locations:['reserva','giro']}}];
function Fixture(){return <main style={{maxWidth:'100%',padding:12,boxSizing:'border-box',margin:'0 auto'}}>
 <h1>Inspeção de layout · V3.1</h1>
 <PublishedRoster schedule={roster} presence={{'worker-1':'working'}}/>
 <KitchenV3Workflows kind="receive" products={products} orders={[]} membership={{role:'cook'}}/>
 <KitchenV3Loss products={products} membership={{role:'cook'}}/>
 </main>}
createRoot(document.getElementById('root')).render(<FeedbackProvider><Fixture/></FeedbackProvider>);
