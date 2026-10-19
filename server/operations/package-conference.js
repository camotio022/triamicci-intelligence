export function validateConference({method,packages,closed,opened,presentation}){
 if(!method||method.kind!=='packages'||method.presentation!==presentation||
 !Array.isArray(packages)||!packages.some(p=>p.presentation===presentation)||
 !Number.isInteger(closed)||closed<0||closed>100000||
 !Number.isInteger(opened)||opened<0||opened>100000||
 (!method.trackOpen&&opened!==0))return {ok:false};
 return {ok:true,presentation,closed,opened};
}
