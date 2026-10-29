import {useEffect,useState} from 'react';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
export function useOperationDay(){
 const [today,setToday]=useState(()=>restaurantDay());
 useEffect(()=>{const update=()=>setToday(restaurantDay());const timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update)}},[]);
 return today;
}
