// Return to the brief a visitor can actually respond to with their chosen account.
export function partnerDestination(kind, {postId, category} = {}) {
  if(kind==='admin')return 'contracts';
  if(kind==='brand')return category==='design'?'new/design':'new';
  return /^[\w-]{1,64}$/.test(postId||'') && (kind==='both'||kind===category) ? 'feed/'+postId : 'feed';
}
