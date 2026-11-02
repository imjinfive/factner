// Built-in examples may predate review metadata. Every real post needs an explicit approval.
export const isPublicPost=post=>post.reviewStatus==='approved'||(post.example===true&&post.reviewStatus==null);

export function roomReviewUrl(isDemo,user,post,key,hostname) {
  if (!isDemo || user?.kind!=='brand' || !post.isMine || post.reviewStatus!=='pending' ||
      !/^[a-f0-9]{64}$/.test(key||'') || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(post.id)) return null;
  const admin=['localhost','127.0.0.1'].includes(hostname)?'http://localhost:4181':'https://admin.factner.com';
  return admin+'/#review-room/'+key+'/'+post.id;
}
