// Shared listener transport. Stores revision metadata only, never business data.
export function liveRevision(data={},domains=['all']){
 if(data.protocolVersion!==2||domains.includes('all'))return String(data.revision||'initial')+':'+String(data.updatedAt?.toMillis?.()||0);
 return JSON.stringify([data.allRevision||'',...domains.map(key=>data.domains?.[key]||'')]);
}
export function changedLiveDomains(previous,next,domains){
 if(!previous||previous.protocolVersion!==2||next.protocolVersion!==2||previous.allRevision!==next.allRevision||domains.includes('all'))return null;
 return domains.filter(key=>previous.domains?.[key]!==next.domains?.[key]);
}
export function createLiveHub(listen){
 const channels=new Map();
 return {subscribe(key,unitId,callback){
  let channel=channels.get(key);
  if(!channel){
   channel={subscribers:new Set(),last:null,stop:null};channels.set(key,channel);
   channel.stop=listen(unitId,event=>{channel.last=event;for(const subscriber of [...channel.subscribers])subscriber(event)});
  }
  channel.subscribers.add(callback);if(channel.last)callback(channel.last);
  return()=>{channel.subscribers.delete(callback);if(!channel.subscribers.size){channel.stop?.();channels.delete(key)}};
 }};
}
