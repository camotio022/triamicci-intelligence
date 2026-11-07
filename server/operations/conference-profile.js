import {validateOperationalProfile} from './v3-catalog-policy.js';
// An explicit unit configuration takes precedence. Reviewed prepared products
// already carry the same validated operational profile in their catalog record.
export function conferenceProfile(product,override){
 if(override)return override;
 return validateOperationalProfile(product?.profile).ok?product.profile:null;
}
