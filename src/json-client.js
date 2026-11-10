// Pure transport factory: test without Firebase, keep token acquisition at call time.
export class ApiError extends Error{
 constructor(message,{status=0,data=null,cause}={}){super(message,{cause});this.name='ApiError';this.status=status;this.data=data;this.code=data?.code||null;}
}
export function createJsonClient({getUser,fetcher}){
 return async function requestJson(path,payload,{sessionMessage='Faça login novamente.',errorMessage='Não foi possível concluir a operação.',formatError,signal,cache}={}){
  const user=getUser();if(!user)throw new ApiError(sessionMessage,{status:401});
  const token=await user.getIdToken();if(!token)throw new ApiError(sessionMessage,{status:401});
  const response=await fetcher(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),...(signal?{signal}:{}),...(cache?{cache}:{})});
  let data;try{data=await response.json()}catch(cause){throw new ApiError(errorMessage,{status:response.status,cause})}
  if(!response.ok)throw new ApiError(formatError?.(data)||data?.message||errorMessage,{status:response.status,data});
  return data;
 };
}
