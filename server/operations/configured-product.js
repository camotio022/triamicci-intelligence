import {conferenceProfile} from './conference-profile.js';
// The unit profile is the operational configuration, independent of central suggestions.
export function configuredProduct(product,override){
 const profile=conferenceProfile(product,override);
 if(!profile)return product;
 const unit=profile.countUnit;
 return {...product,name:profile.displayName?.trim()||product.name,
  aliases:[...new Set([...(product.aliases||[]),...(profile.aliases||[]),product.name].filter(Boolean))],
  profile,...(unit?{unit,operationalUnitOverride:unit}:{})};
}
export const productMatches=(product,query)=>[product.name,product.category,product.profile?.displayName,...(product.aliases||[]),...(product.profile?.aliases||[])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'));
