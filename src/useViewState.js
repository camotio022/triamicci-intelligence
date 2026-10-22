import {useEffect,useState} from 'react';
import {auth} from './firebase.js';
// Only UI preferences, scoped to this account and unit; never persists business data.
export function useViewState(name,unitId,initial){
 const key='triamicci-view:'+auth.currentUser?.uid+':'+unitId+':'+name;
 const [value,setValue]=useState(()=>{try{const stored=JSON.parse(sessionStorage.getItem(key));return typeof stored===typeof initial&&stored!==null?stored:initial}catch{return initial}});
 useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}},[key,value]);
 return [value,setValue];
}
