// Somente imagens do perfil; nunca devolve os demais campos pessoais.
export function profileAvatar(personal,googlePhoto){
 if(personal&&Object.hasOwn(personal,'avatar')){
  const value=personal.avatar;
  return typeof value==='string'&&value.length<=180000&&/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)?value:null;
 }
 if(typeof googlePhoto!=='string'||googlePhoto.length>2048)return null;
 try{const u=new URL(googlePhoto);return u.protocol==='https:'&&(u.hostname==='googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'))?u.href:null}catch{return null}
}
export function attachProfileAvatars(members,personalDocs,profiles){
 const byId=new Map(personalDocs.filter(d=>d.exists).map(d=>[d.id,d.data()]));
 let remaining=2000000;
 return members.map(member=>{const avatar=profileAvatar(byId.get(member.uid),profiles.get(member.uid)?.photoURL);const size=avatar?.length||0;const accepted=size<=remaining?avatar:null;if(accepted)remaining-=size;return {...member,avatar:accepted}});
}
