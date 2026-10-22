import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {initializeApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
import {getAuth,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
import '../src/styles.css';
import '../src/kitchen.css';
import '../src/responsive-system.css';
import '../src/v4-foundation.css';

// This fixture cannot reach the production Firebase project.
const app=initializeApp({projectId:'demo-triamicci-v31',apiKey:'local-test',appId:'local-test'});
connectFirestoreEmulator(getFirestore(app),'127.0.0.1',8080);
const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
await signInAnonymously(auth);
const [{FeedbackProvider},{default:Mural},{default:Production},{default:Inventory},{default:Leave},{default:Profile},{default:Attendance},{default:Kitchen}]=await Promise.all([import('../src/FeedbackProvider.jsx'),import('../src/TeamMural.jsx'),import('../src/Production.jsx'),import('../src/DailyInventory.jsx'),import('../src/LeaveRequests.jsx'),import('../src/MyProfessionalProfile.jsx'),import('../src/MyAttendanceV31.jsx'),import('../src/KitchenHome.jsx')]);
const membership={unitId:'qa-unit',role:'admin'};
function Fixture(){const [screen,setScreen]=useState('Mural');return <FeedbackProvider><main style={{maxWidth:1120,margin:'auto',padding:12,boxSizing:'border-box'}}><nav aria-label="Telas de teste" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>{['Mural','Produção','Inventário','Folgas','Minha ficha','Cozinha'].map(s=><button key={s} type="button" onClick={()=>setScreen(s)}>{s}</button>)}</nav>{screen==='Mural'?<Mural membership={membership}/>:screen==='Produção'?<Production membership={membership}/>:screen==='Inventário'?<Inventory membership={membership}/>:screen==='Folgas'?<Leave membership={membership}/>:screen==='Minha ficha'?<Profile membership={membership} attendance={<Attendance unitId={membership.unitId}/>}/>:<Kitchen membership={membership} navigate={()=>{}}/>}</main></FeedbackProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
