export const isPublicPost=post=>post.reviewStatus==='approved';

export function livePosts(posts,now=Date.now()) {
  const today=new Date(now+9*3600000).toISOString().slice(0,10);
  return posts.filter(post=>isPublicPost(post)&&post.category==='packaging'&&post.status==='open'&&post.deadline>=today)
    .sort((a,b)=>Date.parse(b.reviewedAt||b.createdAt)-Date.parse(a.reviewedAt||a.createdAt));
}

export function roomReviewUrl(isDemo,user,post,key,hostname) {
  if (!isDemo || user?.kind!=='brand' || !post.isMine || post.reviewStatus!=='pending' ||
      !/^[a-f0-9]{64}$/.test(key||'') || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(post.id)) return null;
  const admin=['localhost','127.0.0.1'].includes(hostname)?'http://localhost:4181':'https://admin.factner.com';
  return admin+'/#review-room/'+key+'/'+post.id;
}
