import React,{useCallback,useEffect,useRef,useState} from 'react';
import { CaretDown, Moon, Sun, ArrowRight, SquaresFour } from '@phosphor-icons/react';
import {MotionConfig,motion} from 'motion/react';
import {BrandMark,Button,Photo} from '../BrandControls';
import ServiceIntro from '../ServiceIntro';
import {partnerDestination} from '../partner-destination.js';
import Market from './Market';
import PartnerAccess from './PartnerAccess';
import {BidLoading,initialBidTheme,saveBidTheme} from './BidLoading';
import {DealDesk,SelectDialog} from './DealDesk';
import './shell.css';

const tokenKey='factner-bid-review-token';
const roomStorageKey='factner-bid-review-room';
const roomFormat=/^[0-9a-f]{64}$/;
function readToken(){return sessionStorage.getItem(tokenKey)||'';}
function hasSavedSession(){
  try { return Boolean(readToken()); } catch { return true; }
}
async function reviewRoom(){
  function readOrCreate(){
    const existing=localStorage.getItem(roomStorageKey);
    if(roomFormat.test(existing))return existing;
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const key=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(roomStorageKey,key);
    return key;
  }
  try{
    const existing=localStorage.getItem(roomStorageKey);
    if(roomFormat.test(existing))return existing;
    return navigator.locks ? await navigator.locks.request(roomStorageKey,readOrCreate) : readOrCreate();
  }catch{
    throw new Error('체험 공간을 열 수 없습니다. 브라우저의 사이트 저장소 사용을 허용해주세요.');
  }
}
async function request(path,payload,token=readToken()){
  const headers={'X-Factner-Review':await reviewRoom()};if(token)headers.Authorization='Bearer '+token;
  if(payload!==undefined)headers['Content-Type']='application/json';
  const response=await fetch('/api/bid'+path,{method:payload===undefined?'GET':'POST',headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store',credentials:'omit',redirect:'error'});
  let result;
  try{result=await response.json();}catch{throw new Error('공고 정보를 불러오지 못했습니다. 다시 시도해 주세요.');}
  if(!response.ok)throw new Error(result.error||'요청을 처리하지 못했습니다.');
  return result;
}

const accessViews = ['login','signup','demo','account'];
const routes = new Set(['intro','feed','mine','new','contracts',...accessViews]);
const titles={intro:'서비스 소개',feed:'파트너 찾기',mine:'내 활동',new:'공고 등록',contracts:'계약함',login:'로그인',signup:'회원가입',demo:'계정 체험',account:'내 계정'};
function currentRoute(ops) {
  const fragment=location.hash.slice(1), [view,detail]=fragment.split('/');
  if(view==='preview')return 'feed';
  if(!routes.has(view))return ops?'contracts':'intro';
  return /^[\w-]{1,64}$/.test(detail||'') ? view+'/'+detail : view;
}

export default function BidApp(){
  const ops=location.pathname.replace(/\/+$/,'')==='/ops';
  const [route,setRoute]=useState(()=>currentRoute(ops));
  const [view,detail]=route.split('/'), intro=view==='intro', access=accessViews.includes(view);
  const marketNeeded=(!intro&&!access)||['signup','login'].includes(view)||Boolean(detail&&access);
  const [session,setSession]=useState(null),[state,setState]=useState(null),[error,setError]=useState('');
  const [theme,setTheme]=useState(initialBidTheme),[select,setSelect]=useState(null);
  const seq=useRef(0),channel=useRef(null);
  useEffect(()=>{document.title=titles[view]+' · 팩트너';},[view]);
  useEffect(()=>{
    const sync=()=>{
      if(location.hash==='#preview')history.replaceState(history.state,'','#feed');
      setSelect(null);setRoute(currentRoute(ops));
    };
    sync();
    window.addEventListener('popstate',sync);window.addEventListener('hashchange',sync);
    return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync);};
  },[ops]);

  const refresh=useCallback(async(full=false)=>{
    if(!marketNeeded&&!full)return;
    const num=++seq.current;
    try{
      const token=readToken();
      const [data,me]=await Promise.all([marketNeeded?request('/state',undefined,token):null,full?request('/session',undefined,token):null]);
      if(token!==readToken())return;
      // A newer board poll must not discard the response that establishes the account.
      if(me)setSession(me);
      if(num!==seq.current)return;
      if(data)setState(data);
      setError('');
    }catch(e){if(num===seq.current)setError(e.message);}
  },[marketNeeded]);
  useEffect(()=>{
    refresh(true);const focus=()=>refresh(true);
    window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);
  },[refresh]);
  useEffect(()=>{
    if(!marketNeeded||!session||access)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},2400);
    return()=>clearInterval(timer);
  },[marketNeeded,Boolean(session),access,refresh]);
  useEffect(()=>{
    if(!marketNeeded||access||!session?.demo)return;
    if(session.hosted){
      if(!window.BroadcastChannel)return;
      let active=true,localChannel;
      reviewRoom().then(room=>{
        if(!active)return;
        localChannel=new BroadcastChannel('factner-bid-review-'+room);
        localChannel.onmessage=e=>{if(e.data==='refresh')refresh();};
        channel.current=localChannel;
      }).catch(()=>{}); // Timed refresh still works if browser messaging is unavailable.
      return()=>{active=false;localChannel?.close();if(channel.current===localChannel)channel.current=null;};
    }
    const stream=new EventSource('/api/bid/events');
    stream.onmessage=()=>{if(document.visibilityState==='visible')refresh();};
    return()=>stream.close();
  },[marketNeeded,access,session?.demo,session?.hosted,refresh]);

  function go(target,{replace=false,scroll=true,entry={}}={}){
    if(ops&&!['contracts','demo','login','account'].includes(target.split('/')[0])){location.assign('/#'+target);return;}
    const same=location.hash==='#'+target;
    if(!same)history[replace?'replaceState':'pushState'](entry,'','#'+target);
    setSelect(null);setRoute(target);
    if(scroll){
      window.scrollTo({top:0,behavior:'instant'});
      if(!same)requestAnimationFrame(()=>document.getElementById('bid-work')?.focus({preventScroll:true}));
    }
  }
  const navigate=target=>{
    if(!session?.user && ['mine','new','account'].includes(target.split('/')[0]))target='login';
    // Keep the selected public brief when moving between signup and login.
    if(detail&&['signup','login'].includes(view)&&['signup','login'].includes(target))target+='/'+detail;
    if(view==='feed'&&!detail&&!session?.user&&target.startsWith('feed/')){
      const id=target.slice(5);
      history.replaceState({...history.state,discoveryScrollY:window.scrollY,discoveryReturnId:id},'');
      go(target,{entry:{fromPartnerDiscovery:true}});
      return;
    }
    go(target);
  };
  function backToBrandRequests(){
    if(history.state?.fromPartnerDiscovery){history.back();return;}
    go('feed',{replace:true,entry:{discoveryRole:'supplier'}});
  }
  const authenticate=async(path,body,context={})=>{
    const data=await request(path,body);++seq.current;
    sessionStorage.setItem(tokenKey,data.token);setState(null);setError('');setSelect(null);setSession(s=>({...s,user:data.user}));
    const postId=['signup','login'].includes(view)?detail||(path==='/register'?context.postId:null):null;
    const category=state?.posts.find(p=>p.id===postId)?.category||(path==='/register'?context.category:null);
    const target=partnerDestination(data.user.kind,{postId,category});
    const selectedPartner=['/register','/login'].includes(path)&&data.user.kind==='brand' && state?.partners?.find(p=>p.alias===context.candidate);
    if(ops&&data.user.kind!=='admin'){location.assign('/#'+target);return;}
    if(!ops&&data.user.kind==='admin'){location.assign('/ops');return;}
    const entry=selectedPartner?{selectedPartner:{alias:selectedPartner.alias,title:selectedPartner.title}}:{};
    go(target,{replace:true,entry});await refresh(true);
  };
  const logout=async()=>{
    await request('/logout',{});++seq.current;sessionStorage.removeItem(tokenKey);setState(null);setSelect(null);
    setSession(s=>({...s,user:null}));go(ops?'demo':'feed',{replace:true});await refresh(true);
  };
  const mutate=async(path,data)=>{const result=await request(path,data);channel.current?.postMessage('refresh');await refresh();return result;};
  const user=session?.user;
  const links=ops||user?.kind==='admin'?[['contracts','계약 관리']]:[
    ['intro','서비스 소개'],['feed','파트너 찾기'],...(user?[['mine',user.kind==='brand'?'내 공고':'내 제안'],['contracts','계약함']]:[])
  ];
  const missing=!session||(marketNeeded&&!state);
  const discovery = view==='feed'&&!detail&&!user;
  const accessMode = discovery?'discovery':view;
  const loadingView = discovery && (session || !hasSavedSession()) ? 'discovery' : view;
  const themeToggle=()=>{const next=theme==='light'?'dark':'light';saveBidTheme(next);setTheme(next);};
  return <MotionConfig reducedMotion="user"><div className="bx-shell">
    <a className="skip-link" href="#bid-work" onClick={e=>{e.preventDefault();document.getElementById('bid-work')?.focus();}}>본문 바로가기</a>
    <header className="site-header funnel-header"><div className="header-inner">
      <button className="logo" aria-label="팩트너 홈" onClick={()=>go('intro')}><BrandMark/></button>
      <nav aria-label="주 메뉴">{links.map(([key,label])=><button key={key} className={'nav-link '+(view===key?'active':'')} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{label}{view===key&&<motion.span className="nav-indicator" layoutId="partner-navigation"/>}</button>)}</nav>
      <div className="header-actions bx-account">{!session?<span className="bx-account-placeholder" aria-label="계정 확인 중"/>:user?<button className="member-login-link bx-user" onClick={()=>go('account')}><span>{user.name}</span><CaretDown size={15}/></button>:<button className="member-login-link" onClick={()=>navigate('login')}>로그인</button>}</div>
    </div></header>
    <main id="bid-work" tabIndex={-1}>
      {error&&<div role="alert" className="bx-alert">{error} <button onClick={()=>refresh(true)}>다시 연결</button></div>}
      {intro?<ServiceIntro Button={Button} Photo={Photo} onRequest={()=>navigate('feed')}/>:missing?(error?null:<BidLoading view={loadingView}/>):access||discovery?
        <PartnerAccess mode={accessMode} session={session} partners={state?.partners||[]} posts={state?.posts||[]} sourcePost={detail&&(state?.posts||[]).find(p=>p.id===detail)} onNavigate={navigate} onAuth={authenticate} onExit={logout} ops={ops}/>:
        view==='contracts'&&(ops?user?.kind!=='admin':!user)?<section className="bx-authgate"><SquaresFour size={35}/><h1>{ops?'계약 운영실':'계약함'}</h1><p>{ops?'양측 서명을 확인하고 거래 당사자를 소개합니다.':'로그인하면 진행 중인 계약을 확인할 수 있어요.'}</p><Button onClick={()=>navigate(ops?'demo':'login')}>{ops?'운영팀 계정으로 입장':'로그인'} <ArrowRight size={16}/></Button></section>:
        view==='contracts'?<DealDesk state={state} user={user} mutate={mutate}/>:
        <Market key={user?.id||'guest'} state={state} user={user} view={view} postId={['feed','mine'].includes(view)?detail:null} initialCategory={view==='new'?detail:null} selectedPartner={view==='new'?history.state?.selectedPartner:null} onChoosePost={id=>go(id?view+'/'+id:view,{scroll:false})} onView={navigate} mutate={mutate} onSelect={(offer,post,tier)=>setSelect({offer,post,tier})} onLogin={()=>navigate('login')} onSignup={post=>navigate('signup/'+post.id)} onDiscoveryBack={backToBrandRequests}/>}
    </main>
    <footer className="site-footer shell"><div><button className="logo" aria-label="팩트너 홈" onClick={()=>go('intro')}><BrandMark size={24}/></button><small>© {new Date().getFullYear()} factner.</small></div>
      <div className="footer-right"><button onClick={()=>navigate('feed')}>파트너 찾기</button>{session?.demo&&<button onClick={()=>go('demo')}>계정 체험</button>}{session?.demo&&!ops&&<a href="/ops">운영실</a>}{session?.hosted&&<a href="/members/">기존 회원 서비스</a>}
        <Button tone="ghost" className="icon-button" aria-label={theme==='light'?'다크 모드로 전환':'라이트 모드로 전환'} onClick={themeToggle}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</Button>
        <p>{intro?'소개 이미지는 연출입니다.':'체험용 서비스 · 실제 결제는 발생하지 않습니다.'}</p></div></footer>
    {select&&<SelectDialog {...select} user={user} mutate={mutate} onClose={()=>setSelect(null)} onComplete={()=>navigate('contracts')}/>}
  </div></MotionConfig>;
}
