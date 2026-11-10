import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {initializeApp} from 'firebase/app';import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
// Fixed demo project. This fixture never accesses a real Firebase project.
const app=initializeApp({projectId:'demo-triamicci-v31',apiKey:'local-test',appId:'local-test'}),auth=getAuth(app);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(getFirestore(app),'127.0.0.1',8080);
const [{default:TerminalAccess},{FeedbackProvider},{sessionAuth}]=await Promise.all([import('../src/TerminalAccess.jsx'),import('../src/FeedbackProvider.jsx'),import('../src/firebase.js')]);
const {useUnitLive}=await import('../src/useUnitLive.js');
const email=new URLSearchParams(location.search).get('email');
function Operation({user,membership,logout}){const [refreshes,setRefreshes]=useState(0);useUnitLive(membership.unitId,()=>{setRefreshes(n=>n+1);return true},{domains:['stock']});return <section><p data-testid="live-refreshes">{refreshes}</p><h1>Área operacional demo</h1><p role="status">{user.uid} · {membership.role} · {membership.unitId}</p><button onClick={logout}>Sair da operação</button><button onClick={async()=>{const token=await sessionAuth.currentUser.getIdToken();const res=await fetch('/api/products/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'list'})});document.querySelector('#api-result').textContent=String(res.status)}}>Consultar API real demo</button><p id="api-result"/></section>}
function Fixture(){return <FeedbackProvider>{email&&<button onClick={()=>signInWithEmailAndPassword(auth,email,'demo-terminal-password')}>Entrar conta demo</button>}<TerminalAccess>{session=><Operation {...session}/>}</TerminalAccess></FeedbackProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
