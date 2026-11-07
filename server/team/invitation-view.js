export const invitationLabels={pending:'Pendente',accepted:'Aceito',revoked:'Revogado',expired:'Expirado',delivery_failed:'Falha no envio'};
export function invitationState(item,now=Date.now()){
 if(item.status==='pending'&&item.expiresAt&&Number.isFinite(Date.parse(item.expiresAt))&&Date.parse(item.expiresAt)<=now)return 'expired';
 return Object.hasOwn(invitationLabels,item.status)?item.status:'unknown';
}
export const invitationPending=item=>['pending','delivery_failed'].includes(invitationState(item));
