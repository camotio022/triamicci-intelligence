import React,{useEffect,useState} from 'react';
export default function ProfileAvatar({src,name='',large=false}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 const initials=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase('pt-BR')||'?';
 return <span className={'access-avatar'+(large?' access-avatar-large':'')}>{src&&!failed?<img src={src} alt={'Foto de '+(name||'perfil')} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{initials}</span>}</span>;
}
