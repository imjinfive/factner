// Return to the brief a visitor can actually respond to with their chosen account.
import {isPackagingPartner} from '../../shared/partner-roles.js';

export function partnerDestination(kind, {postId, category} = {}) {
  if(kind==='admin')return 'contracts';
  if(kind==='brand')return 'new';
  return /^[\w-]{1,64}$/.test(postId||'') && isPackagingPartner(kind) && category==='packaging' ? 'feed/'+postId : 'feed';
}
