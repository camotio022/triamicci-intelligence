// Push-only worker: never cache authenticated pages or API responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 let url=new URL('/',self.location.origin);try{const target=new URL(data.url,self.location.origin);if(target.origin===self.location.origin)url=target}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Triamicci Intelligence',{body:data.body||'Você tem um novo aviso.',icon:'/favicon.svg',tag:data.tag||'triamicci',data:{url:url.href}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL(event.notification.data?.url||'/',self.location.origin);
  if(target.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===target.origin);
  if(existing){await existing.navigate(target.href);await existing.focus()}else await self.clients.openWindow(target.href);
 })());
});
