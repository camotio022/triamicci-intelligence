// Read-only verification of the signed Cloudinary upload preset via Admin API.
// Does not print credentials, asset URLs, or unrelated preset names.
const cloud=process.env.CHECKLIST_CLOUDINARY_CLOUD_NAME;
const key=process.env.CHECKLIST_CLOUDINARY_API_KEY;
const secret=process.env.CHECKLIST_CLOUDINARY_API_SECRET;
const expected=process.env.CHECKLIST_CLOUDINARY_PRESET;
if(!cloud||!key||!secret||!expected)throw Error('Missing Cloudinary test configuration.');
const auth='Basic '+Buffer.from(key+':'+secret).toString('base64');
let response;
try{response=await fetch('https://api.cloudinary.com/v1_1/'+encodeURIComponent(cloud)+'/upload_presets?max_results=100',{headers:{Authorization:auth},redirect:'error',signal:AbortSignal.timeout(15000)});}
catch{throw Error('Cloudinary preset inspection unavailable');}
if(!response.ok){console.log(JSON.stringify({inspectionStatus:response.status,inspection:'DENIED_OR_UNAVAILABLE'}));process.exitCode=1;}
else {
 const data=await response.json();
 const presets=Array.isArray(data.presets)?data.presets:[];
 const found=presets.find(p=>p.name===expected);
 const close=presets.filter(p=>p.name?.startsWith('triamicci_checklist_')).map(p=>({matchesRequested:p.name===expected,isSigned:p.unsigned===false,assetType:p.type||null}));
 console.log(JSON.stringify({inspectionStatus:response.status,responseFields:Object.keys(data).slice(0,12),returnedPresets:presets.length,morePages:Boolean(data.next_cursor),presetFound:Boolean(found),requestedPresetSigned:found?found.unsigned===false:null,matchingPrefixCount:close.length,matchingPrefix:close,requestedLength:expected.length,detectedPrefixedPresets:presets.filter(p=>p.name?.startsWith('triamicci_checklist_')).map(p=>({name:p.name,length:p.name.length}))}));
 if(!found)process.exitCode=2;
}
