// Terminal credentials belong to this tab, never to the phone's Firebase session.
let user=null,last=null;
const subscribers=new Set();
export const terminalUser=()=>user;
export function setTerminalUser(value){user=value}
export function emitTerminalLive(event){last=event;for(const subscriber of subscribers)subscriber(event)}
export function subscribeTerminalLive(callback){subscribers.add(callback);if(last)callback(last);return()=>subscribers.delete(callback)}
export function clearTerminalState(){user=null;last=null;for(const subscriber of subscribers)subscriber({connected:false,data:{}})}
