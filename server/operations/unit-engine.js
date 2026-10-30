// Motor puro de unidades. Não grava dados nem altera saldos legados.
// Quantidades físicas são sempre associadas à unidade e à origem da conversão.
const UNITS=Object.freeze({
 kg:{dimension:'mass',factor:1000,precision:3},
 g:{dimension:'mass',factor:1,precision:0},
 L:{dimension:'volume',factor:1000,precision:3},
 mL:{dimension:'volume',factor:1,precision:0},
 un:{dimension:'count',factor:1,precision:0},
 duzia:{dimension:'count',factor:12,precision:0}
});
export const PRESENTATIONS=Object.freeze(['pacote','caixa','bandeja','saco','fardo','pote','balde','garrafa','galao','lata','frasco','maco','cuba','porcao','peca','lote']);
const finitePositive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const safe=(n,p=3)=>Number(n.toFixed(p));
export function unitInfo(unit){return UNITS[unit]||null;}
export function isPresentation(unit){return PRESENTATIONS.includes(unit);}
export function convertPhysical({quantity,from,to}){
 if(!finitePositive(quantity)||!unitInfo(from)||!unitInfo(to))return {ok:false,reason:'INVALID_QUANTITY_OR_UNIT'};
 if(UNITS[from].dimension!==UNITS[to].dimension)return {ok:false,reason:'DIFFERENT_DIMENSIONS'};
 const value=quantity*UNITS[from].factor/UNITS[to].factor;
 if(!Number.isFinite(value)||value>1e9)return {ok:false,reason:'OUT_OF_RANGE'};
 if(UNITS[to].dimension==='count'&&!Number.isInteger(value))return {ok:false,reason:'FRACTIONAL_COUNT'};
 if(Math.abs(value-safe(value,UNITS[to].precision))>1e-9)return {ok:false,reason:'PRECISION_LOSS'};
 return {ok:true,quantity:value,unit:to,method:'EXACT_UNIT'};
}
export function convertPackage({quantity,presentation,packageRule,to}){
 if(!finitePositive(quantity)||!isPresentation(presentation))return {ok:false,reason:'INVALID_PRESENTATION'};
 if(!packageRule||packageRule.presentation!==presentation||packageRule.validated!==true||packageRule.fixed!==true||!finitePositive(packageRule.contentQuantity)||!unitInfo(packageRule.contentUnit)||typeof packageRule.version!=='string'||!packageRule.version.trim())
   return {ok:false,reason:'UNVERIFIED_OR_VARIABLE_PACKAGE'};
 const converted=convertPhysical({quantity:quantity*packageRule.contentQuantity,from:packageRule.contentUnit,to});
 return converted.ok?{...converted,method:'VALIDATED_PACKAGE',ruleVersion:packageRule.version}:{...converted};
}
export function packageState({sealed=0,opened=0,knownRemaining=null,remainingUnit=null}={}){
 if(!Number.isInteger(sealed)||sealed<0||!Number.isInteger(opened)||opened<0)return {ok:false,reason:'INVALID_PACKAGES'};
 if(knownRemaining===null)return {ok:true,sealed,opened,remaining:{status:'UNKNOWN',quantity:null,unit:null}};
 if(typeof knownRemaining!=='number'||!Number.isFinite(knownRemaining)||knownRemaining<0||!unitInfo(remainingUnit))return {ok:false,reason:'INVALID_REMAINING'};
 if(remainingUnit==='un'&&!Number.isInteger(knownRemaining))return {ok:false,reason:'FRACTIONAL_COUNT'};
 return {ok:true,sealed,opened,remaining:{status:'MEASURED',quantity:knownRemaining,unit:remainingUnit}};
}
