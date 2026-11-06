// Um app Firebase nomeado mantém a autenticação secundária fora da chave
// persistente da conta principal. A sessão secundária pertence somente à aba.
export function authSession(search=''){
 const independent=new URLSearchParams(search).get('session')==='independent';
 return {independent,appName:independent?'triamicci-independent':'[DEFAULT]'};
}
