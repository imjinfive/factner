import {useEffect,useState} from 'react';
import {useReducedMotion} from 'motion/react';
import {livePosts} from './post-visibility.js';

export default function LivePosts({posts,onOpen}) {
  const rows=livePosts(posts);
  const [index,setIndex]=useState(0);
  const reduced=useReducedMotion();
  useEffect(()=>{
    if(reduced||rows.length<2)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')setIndex(value=>(value+1)%rows.length);},5000);
    return()=>clearInterval(timer);
  },[reduced,rows.length]);
  const post=rows[index%rows.length];
  if(!post)return null;
  return <section className="bx-live" aria-label="실시간 제작 공고">
    <span className="bx-live-label">실시간 공고</span>
    <button className="bx-live-post" onClick={()=>onOpen(post.id)} title={post.title}><span key={post.id}>{post.title}</span></button>
    {reduced&&rows.length>1&&<button className="bx-live-control" aria-label="다음 공고" onClick={()=>setIndex(value=>(value+1)%rows.length)}><span>{index%rows.length+1}/{rows.length}</span></button>}
  </section>;
}
