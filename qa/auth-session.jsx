import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {connectAuthEmulator,onAuthStateChanged,signInAnonymously,signOut} from 'firebase/auth';
import {auth,isIndependentSession} from '../src/firebase.js';
if(auth.app.options.projectId!=='demo-triamicci-v31')throw Error('Esta tela exige o projeto fictício local; não autentica em produção.');
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
function Fixture(){const [uid,setUid]=useState('carregando');useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||'sem conta')),[]);return <main><h1>{isIndependentSession?'Conta secundária':'Conta principal'}</h1><p role="status">{uid}</p><button onClick={()=>signInAnonymously(auth)}>Entrar com conta fictícia</button><button onClick={()=>signOut(auth)}>Sair</button></main>}
createRoot(document.getElementById('root')).render(<Fixture/>);
