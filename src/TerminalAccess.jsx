import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth,sessionAuth} from './firebase.js';
import AuthGate from './AuthGate.jsx';
import {setApiScope} from './api-fetch.js';
import {clearViewCache} from './fastCache.js';
import {clearTerminalState,emitTerminalLive,setTerminalUser} from './terminal-state.js';
import {DEVICE_KEY,SESSION_KEY,storedDevice,randomKey,terminalCall,terminalStream} from './terminal-client.js';
import {isManagement} from '../server/permissions/v31-policy.js';
import './terminal-access.css';

function Frame({title,children}){return <main className="ti-terminal-page"><section className="ti-terminal-card"><p className="eyebrow">TRIAMICCI · ACESSO SEGURO</p><h1>{title}</h1>{children}</section></main>}
const personalCall=async(action,payload={})=>{const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Entre com sua conta individual.');return terminalCall(action,payload,token)};
export function TerminalApproval({approval,membership,onClose}){
 const [details,setDetails]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 useEffect(()=>{let active=true;personalCall('pairDetails',approval).then(d=>{if(active)setDetails(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[approval]);
 const approve=async()=>{if(busy)return;setBusy(true);setError('');try{await personalCall('pairApprove',{...approval,confirm:true,code:details.code});setDone(true)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <Frame title={done?'Entrada autorizada':'Autorizar entrada no caixa'}>{done?<><p>Confira o computador. Ele entrará com as suas permissões. Bloqueie a sessão ao se afastar.</p><button onClick={onClose}>Voltar ao meu aplicativo</button></>:<>{!details&&!error&&<p role="status">Verificando o terminal…</p>}{details&&<><dl><dt>Terminal</dt><dd>{details.terminalName}</dd><dt>Unidade</dt><dd>{details.unitId}</dd><dt>Pessoa</dt><dd>{details.name}</dd><dt>Perfil</dt><dd>{details.role}</dd></dl><p>Confira se este código aparece no computador:</p><strong className="ti-terminal-code">{details.code}</strong><p>Autorize somente se você está entrando neste caixa. O código expira em 60 segundos.</p><button onClick={approve} disabled={busy||membership.status!=='active'}>{busy?'Autorizando…':'Autorizar entrada'}</button></>}{error&&<p role="alert">{error}</p>}<button className="secondary" onClick={onClose}>Cancelar</button></>}</Frame>;
}
export function TerminalManagement({membership,onRegistered}){
 const [open,setOpen]=useState(false),[name,setName]=useState('Caixa 01'),[devices,setDevices]=useState([]),[sessions,setSessions]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const manager=isManagement(membership.role);
 const refresh=async()=>{const [own,all]=await Promise.all([personalCall('sessions'),manager?personalCall('devices'):Promise.resolve({terminals:[]})]);setSessions(own.sessions);setDevices(all.terminals)};
 const show=async()=>{setOpen(true);setError('');setBusy(true);try{await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const register=async e=>{e.preventDefault();setBusy(true);setError('');try{const d=await personalCall('register',{name});await onRegistered(d.terminal)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const revoke=async(action,id)=>{setBusy(true);setError('');try{await personalCall(action,{id});await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <aside className="ti-terminal-personal"><button type="button" onClick={show}>Terminais e minhas sessões</button>{open&&<section className="ti-terminal-panel" aria-label="Terminais e sessões"><header><h2>Terminais e sessões</h2><button onClick={()=>setOpen(false)} aria-label="Fechar terminais">Fechar</button></header>{error&&<p role="alert">{error}</p>}<h3>Minhas sessões no caixa</h3>{sessions.length?sessions.map(s=><p key={s.id}>{s.terminalName} · {new Date(s.createdAt).toLocaleString('pt-BR')} <button disabled={busy} onClick={()=>revoke('revokeSession',s.id)}>Encerrar sessão</button></p>):<p>Nenhuma sessão ativa encontrada nesta consulta.</p>}{manager&&<><h3>Terminais da unidade {membership.unitId}</h3>{devices.filter(d=>d.state==='active').map(d=><p key={d.id}>{d.name} <button disabled={busy} onClick={()=>revoke('revokeDevice',d.id)}>Revogar terminal {d.name}</button></p>)}<form onSubmit={register}><h3>Configurar este navegador como caixa</h3><p>Use esta opção somente no computador compartilhado da unidade. Sua sessão pessoal será encerrada.</p><label>Nome do terminal<input value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={60} required/></label><button disabled={busy}>Cadastrar este navegador como caixa</button></form></>}</section>}</aside>;
}
export function TerminalPortal({device,onSession,onForget}){
 const [pair,setPair]=useState(null),[image,setImage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expired,setExpired]=useState(false);
 const controller=useRef(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort()}},[]);
 const generate=async()=>{
  if(busy)return;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setExpired(false);setPair(null);setImage('');
  const requestId=randomKey(),browserSecret=randomKey(),scanSecret=randomKey();
  try{
   const d=await terminalCall('pairStart',{terminalId:device.id,deviceSecret:device.secret,requestId,browserSecret,scanSecret},null,abort.signal);
   const link=window.location.origin+'/#terminalApprove='+requestId+'.'+scanSecret;
   const QRCode=await import('qrcode');const url=await QRCode.toDataURL(link,{width:280,margin:2,errorCorrectionLevel:'M'});
   if(!mounted.current||abort.signal.aborted)return;setPair({...d,link});setImage(url);setBusy(false);
   let approved=false;
   while(!abort.signal.aborted&&Date.now()<d.expiresAt&&!approved){
    await terminalStream('pairWatch',{requestId,browserSecret},null,event=>{if(event.state==='approved')approved=true;else if(event.state!=='pending')throw Error('QR Code expirado ou indisponível. Gere outro.')},abort.signal);
    if(!approved)await new Promise(r=>setTimeout(r,1000));
   }
   if(approved&&!abort.signal.aborted){const session=await terminalCall('pairRedeem',{requestId,browserSecret},null,abort.signal);onSession(session)}else if(mounted.current&&!abort.signal.aborted)setExpired(true);
  }catch(e){if(mounted.current&&!abort.signal.aborted){setError(e.message);setExpired(true)}}finally{if(mounted.current)setBusy(false)}
 };
 return <Frame title={device.name}><p>Unidade {device.unitId} · Terminal compartilhado</p><p>Autorize pelo seu celular para entrar com suas permissões.</p>{image&&!expired&&<><img src={image} width="280" height="280" alt="QR Code de autorização do caixa"/><p>Código de conferência: <strong className="ti-terminal-code">{pair.code}</strong></p><p>Expira em 60 segundos. Abra a câmera do celular e confira o terminal antes de autorizar.</p><details><summary>Usar link em vez da câmera</summary><p>Abra este link somente no seu celular. Não o compartilhe.</p><input aria-label="Link de autorização" value={pair.link} readOnly/></details></>}{expired&&<p role="status">Este QR Code não está mais disponível. Gere outro para entrar.</p>}{error&&<p role="alert">{error}</p>}<button onClick={generate} disabled={busy||!!pair&&!expired}>{busy?'Preparando…':pair?'Gerar novo QR Code':'Gerar QR Code para entrar'}</button><button className="secondary" onClick={onForget}>Sair do modo caixa e desvincular navegador</button></Frame>;
}
export function TerminalSession({credential,onEnd,children}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[connected,setConnected]=useState(false);
 const ending=useRef(false);
 const lastActivity=useRef(Date.now()),lastTouch=useRef(Date.now());
 const end=useCallback((message='Sessão bloqueada. Autorize novamente pelo celular.')=>{
  if(ending.current)return;ending.current=true;
  terminalCall('sessionEnd',{},credential).catch(()=>{});clearViewCache(sessionAuth.currentUser?.uid);clearTerminalState();setApiScope(null);try{sessionStorage.removeItem(SESSION_KEY)}catch{}onEnd(message);
 },[credential,onEnd]);
 useEffect(()=>{
  const abort=new AbortController();let alive=true,retry,renewalDeadline;
  const disconnect=()=>{emitTerminalLive({connected:false,data:{}});if(alive)setConnected(false)};
  const connect=async()=>{
   let plannedRenewal=false;
   try{await terminalStream('sessionWatch',{},credential,event=>{
    if(!alive||event.state==='keepalive')return;if(event.state==='renew'){plannedRenewal=true;return}if(event.state!=='active'){end();return}
    clearTimeout(renewalDeadline);
    const user={uid:event.uid,email:event.membership.email,displayName:event.membership.name,photoURL:null,terminalSessionId:credential.split('.')[1],getIdToken:async()=>credential};
    setTerminalUser(user);setApiScope(user.uid+':'+event.membership.unitId+':'+event.membership.role+':active');emitTerminalLive({connected:true,data:event.live});setState({...event,user});setError('');setConnected(true);
   },abort.signal);if(alive){if(plannedRenewal){renewalDeadline=setTimeout(disconnect,3000);retry=setTimeout(connect,0)}else{disconnect();retry=setTimeout(connect,1500)}}}
   catch(e){if(!alive)return;disconnect();if([401,403,410].includes(e.status)){end();return}setError(e.message);retry=setTimeout(connect,5000)}
  };
  connect();const offline=()=>{disconnect();abort.abort();end('Conexão perdida. Autorize novamente ao reconectar.')};window.addEventListener('offline',offline);
  return()=>{alive=false;clearTimeout(retry);clearTimeout(renewalDeadline);abort.abort();window.removeEventListener('offline',offline);clearTerminalState();setApiScope(null)};
 },[credential,end]);
 useEffect(()=>{
  const activity=()=>{if(document.visibilityState==='visible')lastActivity.current=Date.now()};
  const events=['pointerdown','keydown','wheel','touchstart'];for(const event of events)window.addEventListener(event,activity,{passive:true});
  const timer=setInterval(()=>{
   const now=Date.now();if(now-lastActivity.current>=180000){end();return}
   if(now-lastTouch.current>=60000&&lastActivity.current>lastTouch.current){lastTouch.current=now;terminalCall('sessionTouch',{},credential).catch(e=>{if([401,403].includes(e.status))end()})}
  },5000);
  return()=>{clearInterval(timer);for(const event of events)window.removeEventListener(event,activity)};
 },[credential,end]);
 if(!state||!connected)return <Frame title="Verificando sessão do caixa"><p role="status">Aguardando confirmação do servidor. {error}</p><button onClick={()=>end()}>Bloquear e trocar operador</button></Frame>;
 return <><aside className="ti-terminal-banner"><strong>{state.user.displayName||state.user.email} · {state.membership.role}</strong><span>{state.terminal.name} · {state.terminal.unitId}</span><button onClick={()=>end()}>Bloquear / trocar operador</button></aside>{children({user:state.user,membership:state.membership,logout:()=>end()})}</>;
}
export default function TerminalAccess({children}){
 const [device,setDevice]=useState(storedDevice),[credential,setCredential]=useState(()=>{try{return sessionStorage.getItem(SESSION_KEY)||''}catch{return ''}}),[notice,setNotice]=useState(''),[chooseTerminal,setChooseTerminal]=useState(false);
 const [approval]=useState(()=>{try{const match=/^#terminalApprove=([A-Za-z0-9_-]{32,64})\.([A-Za-z0-9_-]{32,64})$/.exec(window.location.hash);return match?{requestId:match[1],scanSecret:match[2]}:null}catch{return null}});
 useEffect(()=>{if(approval)window.history.replaceState(null,'',window.location.pathname+window.location.search)},[approval]);
 const ended=useCallback(message=>{setCredential('');setNotice(message)},[]);
 const forget=async()=>{
  // Always provide a local escape even when Firebase or the network is unavailable.
  if(device)terminalCall('forgetDevice',{terminalId:device.id,deviceSecret:device.secret}).catch(()=>{});
  if(credential)terminalCall('sessionEnd',{},credential).catch(()=>{});
  clearViewCache(sessionAuth.currentUser?.uid);clearTerminalState();setApiScope(null);try{localStorage.removeItem(DEVICE_KEY);sessionStorage.removeItem(SESSION_KEY)}catch{}setCredential('');setDevice(null);setChooseTerminal(false);setNotice('Este navegador saiu do modo caixa.');
 };
 useEffect(()=>{const changed=e=>{if(e.key===DEVICE_KEY){clearTerminalState();setApiScope(null);try{sessionStorage.removeItem(SESSION_KEY)}catch{}setCredential('');setDevice(storedDevice())}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[]);
 if(approval)return <AuthGate>{({membership})=><TerminalApproval approval={approval} membership={membership} onClose={()=>window.location.reload()}/>}</AuthGate>;
 if(device&&credential)return <><TerminalSession credential={credential} onEnd={ended}>{children}</TerminalSession><button className="ti-terminal-escape" onClick={forget}>Desvincular este navegador</button></>;
 if(device)return <>{notice&&<p className="ti-terminal-notice" role="status">{notice}</p>}<TerminalPortal device={device} onSession={s=>{sessionStorage.setItem(SESSION_KEY,s.credential);setCredential(s.credential)}} onForget={forget}/></>;
 if(chooseTerminal)return <Frame title="Entrar pelo caixa"><p>Este navegador ainda não está cadastrado como terminal. Um gerente deve entrar com sua conta e abrir “Terminais e minhas sessões” para configurar o caixa desta unidade.</p><button onClick={()=>setChooseTerminal(false)}>Entrar com minha conta para configurar</button></Frame>;
 return <>{notice&&<p className="ti-terminal-notice" role="status">{notice}</p>}<div className="ti-access-options"><span>Conta individual</span><button onClick={()=>setChooseTerminal(true)}>Entrar pelo caixa</button></div><AuthGate>{session=><><TerminalManagement membership={session.membership} onRegistered={async d=>{localStorage.setItem(DEVICE_KEY,JSON.stringify(d));await session.logout();setDevice(d)}}/>{children(session)}</>}</AuthGate></>;
}
