import React,{useCallback,useEffect,useRef,useState} from 'react';
import { CaretDown, ArrowRight, SquaresFour } from '@phosphor-icons/react';
import {MotionConfig,motion} from 'motion/react';
import {BrandMark,Button,Photo} from '../BrandControls';
import ServiceIntro from '../ServiceIntro';
import PolicyDocument,{policyTitles} from '../PolicyDocument';
import SiteFooter from '../SiteFooter';
import {normalizeSiteEntry,siteNavigationEvent,writeSiteEntry} from '../site-history.js';
import Market from './Market';
import PartnerAccess from './PartnerAccess';
import {BidLoading,initialBidTheme,saveBidTheme} from './BidLoading';
import {Connections,ConnectionDialog,DealDesk,SelectDialog} from './DealDesk';
import './shell.css';

const tokenKey='factner-bid-review-token';
const roomStorageKey='factner-bid-review-room';
const roomFormat=/^[0-9a-f]{64}$/;
function readToken(){try{return sessionStorage.getItem(tokenKey)||'';}catch{return '';}}
function savedRoom(){try{const room=localStorage.getItem(roomStorageKey);return roomFormat.test(room)?room:'';}catch{return '';}}
function activeRoom(){
  try{
    const room=sessionStorage.getItem(roomStorageKey);
    if(roomFormat.test(room))return room;
    // Sessions created by previous versions kept their room only in localStorage.
    const legacy=readToken() && savedRoom();
    if(legacy)sessionStorage.setItem(roomStorageKey,legacy);
    return legacy;
  }catch{return '';}
}
function hasSavedSession(){try{return Boolean(readToken()||sessionStorage.getItem('factner-account-active'));}catch{return false;}}
async function request(path,payload,token=readToken()){
  const headers={};
  if(token&&path!=='/login'&&path!=='/register')headers.Authorization='Bearer '+token;
  const room=path==='/login'?savedRoom():headers.Authorization?activeRoom():'';
  if(room)headers['X-Factner-Review']=room;
  if(payload!==undefined)headers['Content-Type']='application/json';
  const response=await fetch('/api/bid'+path,{method:payload===undefined?'GET':'POST',headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store',credentials:'same-origin',redirect:'error'});
  let result;
  try{result=await response.json();}catch{throw new Error('공고 정보를 불러오지 못했습니다. 다시 시도해 주세요.');}
  if(!response.ok)throw Object.assign(new Error(result.error||'요청을 처리하지 못했습니다.'),{httpStatus:response.status,status:result.status,note:result.note,support:result.support});
  return result;
}

const accessViews = ['login','signup','account','find-id','recover-password','reset-password'];
const titles={intro:'서비스 소개',feed:'파트너 찾기',mine:'내 활동',new:'공고 등록',contracts:'계약함',login:'로그인',signup:'회원가입',account:'내 계정','find-id':'아이디 찾기','recover-password':'비밀번호 찾기','reset-password':'비밀번호 재설정',...policyTitles};

export default function BidApp({surface='market'}){
  const ops=surface==='ops';
  const [route,setRoute]=useState(()=>normalizeSiteEntry().route);
  const [navRevision,setNavRevision]=useState(0);
  const [view,detail]=route.split('/'), intro=view==='intro', access=accessViews.includes(view);
  const policy=Object.hasOwn(policyTitles,view);
  const marketNeeded=!intro&&!access&&!policy;
  const [session,setSession]=useState(null),[state,setState]=useState(null),[error,setError]=useState('');
  const [theme,setTheme]=useState(initialBidTheme),[select,setSelect]=useState(null);
  const seq=useRef(0),authRevision=useRef(0),channel=useRef(null);
  useEffect(()=>{document.title=titles[view]+' · 팩트너';},[view]);
  useEffect(()=>{
    const sync=()=>{
      const next=normalizeSiteEntry();
      if(next.surface===surface){setSelect(null);setRoute(next.route);}
    };
    sync();
    const events=['popstate','hashchange',siteNavigationEvent];
    events.forEach(event=>window.addEventListener(event,sync));
    return()=>events.forEach(event=>window.removeEventListener(event,sync));
  },[surface]);

  const refresh=useCallback(async(full=false)=>{
    if(!marketNeeded&&!full)return;
    const num=++seq.current,revision=authRevision.current;
    try{
      let token=readToken();
      const load=(key,withUser)=>Promise.all([marketNeeded?request('/state',undefined,key):null,withUser?request('/session',undefined,key):null]);
      let values;
      try{values=await load(token,full);}catch(e){
        if(!token||![401,410].includes(e.httpStatus)||token!==readToken()||revision!==authRevision.current)throw e;
        if(e.httpStatus===410 && activeRoom()===savedRoom())localStorage.removeItem(roomStorageKey);
        sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roomStorageKey);
        token='';values=await load(token,true);
      }
      const [data,me]=values;
      if(token!==readToken()||revision!==authRevision.current)return;
      // A newer board poll must not discard the response that establishes the account.
      if(me){
        setSession(me);
        try{if(me.user)sessionStorage.setItem('factner-account-active','1');else sessionStorage.removeItem('factner-account-active');}catch{}
      }
      if(num!==seq.current)return;
      if(data)setState(data);
      setError('');
    }catch(e){if(num===seq.current&&revision===authRevision.current)setError(e.message);}
  },[marketNeeded]);
  useEffect(()=>{
    refresh(true);const focus=()=>refresh(true);
    window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);
  },[refresh,route]);
  useEffect(()=>{
    if(!marketNeeded||!session||access)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},session.user?5000:30000);
    return()=>clearInterval(timer);
  },[marketNeeded,Boolean(session),Boolean(session?.user),access,refresh]);
  useEffect(()=>{
    if(!marketNeeded||access||!session?.demo)return;
    if(session.hosted){
      if(!window.BroadcastChannel)return;
      const room=activeRoom();if(!room)return;
      const localChannel=new BroadcastChannel('factner-bid-review-'+room);
      localChannel.onmessage=e=>{if(e.data==='refresh')refresh();};
      channel.current=localChannel;
      return()=>{localChannel.close();if(channel.current===localChannel)channel.current=null;};
    }
    const stream=new EventSource('/api/bid/events');
    stream.onmessage=()=>{if(document.visibilityState==='visible')refresh();};
    return()=>stream.close();
  },[marketNeeded,access,session?.demo,session?.hosted,refresh]);

  function go(target,{replace=false,scroll=true,entry={},force=false,targetSurface}={}){
    const destination=targetSurface || (ops&&!['contracts','login','account'].includes(target.split('/')[0])?'market':surface);
    const same=destination===surface && target===route;
    if(!same||force)writeSiteEntry(destination,target,{replace,entry});
    setSelect(null);
    if(scroll){
      window.scrollTo({top:0,behavior:'instant'});
      if(!same)requestAnimationFrame(()=>document.getElementById('bid-work')?.focus({preventScroll:true}));
    }
  }
  function openSection(target){
    const details=history.state || {};
    const hasChoices=Boolean(details.bidAccessPick?.role || details.bidMarketFilters?.query ||
      details.bidMarketFilters?.activeOnly || (details.bidMarketFilters?.category && details.bidMarketFilters.category!=='all'));
    go(target,{force:true,replace:route===target&&!hasChoices});
    setNavRevision(value=>value+1);
    if(marketNeeded)refresh(true);
  }
  function openMembers(){
    writeSiteEntry('members','account');
    window.scrollTo({top:0,behavior:'instant'});
  }
  const navigate=target=>{
    if(!session?.user && ['mine','new','account'].includes(target.split('/')[0]))target='login';
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
  const authenticate=async(path,body)=>{
    const data=await request(path,body);
    if(path==='/register')return data;
    ++seq.current;++authRevision.current;
    if(data.token){
      if(!roomFormat.test(data.reviewRoom))throw new Error('로그인 세션을 확인하지 못했습니다.');
      sessionStorage.setItem(roomStorageKey,data.reviewRoom);sessionStorage.setItem(tokenKey,data.token);
      if(data.user.id.startsWith('seed-'))localStorage.setItem(roomStorageKey,data.reviewRoom);
    }else{try{sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roomStorageKey);}catch{}}
    setState(null);setError('');setSelect(null);setSession(s=>({...s,user:data.user,demo:Boolean(data.token)}));
    if(data.user.legacyOnly){writeSiteEntry('members','account',{replace:true});return;}
    const target=data.user.kind==='admin'?'contracts':data.user.kind==='brand'?'new':'feed';
    go(target,{replace:true,targetSurface:data.user.kind==='admin'?'ops':'market'});
  };
  const logout=async()=>{
    await request('/logout',{});++seq.current;++authRevision.current;try{sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roomStorageKey);sessionStorage.removeItem('factner-account-active');}catch{}
    setState(null);setSelect(null);
    setSession(s=>({...s,user:null}));go(ops?'login':'feed',{replace:true});await refresh(true);
  };
  const mutate=async(path,data)=>{
    const result=await request(path,data);
    if(path!=='/posts' && (!path.endsWith('/withdraw')||result.visibilityChanged))channel.current?.postMessage('refresh');
    await refresh();return result;
  };
  const legacyMember=Boolean(session?.user?.legacyOnly);
  const user=legacyMember?null:session?.user;
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
      <button className="logo" aria-label="팩트너 홈" onClick={()=>openSection('intro')}><BrandMark/></button>
      <nav aria-label="주 메뉴">{links.map(([key,label])=><button key={key} className={'nav-link '+(view===key?'active':'')} aria-current={view===key?'page':undefined} onClick={()=>openSection(key)}>{label}{view===key&&<motion.span className="nav-indicator" layoutId="partner-navigation"/>}</button>)}</nav>
      <div className="header-actions bx-account">{!session?<span className="bx-account-placeholder" aria-label="계정 확인 중"/>:session.user?<button className="member-login-link bx-user" onClick={()=>legacyMember?openMembers():go('account')}><span>{session.user.name}</span><CaretDown size={15}/></button>:<>
        <button className="member-login-link" onClick={()=>navigate('login')}>로그인</button>
        {!ops && <button className="member-login-link bx-signup" onClick={()=>navigate('signup')}>회원가입</button>}
      </>}</div>
    </div></header>
    <main id="bid-work" tabIndex={-1}>
      {error&&<div role="alert" className="bx-alert">{error} <button onClick={()=>refresh(true)}>다시 연결</button></div>}
      {intro?<ServiceIntro Button={Button} Photo={Photo} onRequest={()=>navigate('feed')}/>:policy?<article className="shell bx-policy"><span className="member-eyebrow">팩트너 이용 안내</span><h1>{titles[view]}</h1><PolicyDocument key={view} kind={view}/></article>:missing?(error?null:<BidLoading view={loadingView}/>):access||discovery?
        <PartnerAccess key={navRevision} navigationKey={navRevision} mode={accessMode} session={session} partners={state?.partners||[]} posts={state?.posts||[]} onNavigate={navigate} onMembers={openMembers} onAuth={authenticate} onExit={logout}/>:
        view==='contracts'&&(ops?user?.kind!=='admin':!user)?<section className="bx-authgate"><SquaresFour size={35}/><h1>{ops?'계약 운영실':'계약함'}</h1><p>{ops?'계약 운영은 관리자 전용입니다.':'로그인하면 진행 중인 계약을 확인할 수 있어요.'}</p>{!ops&&<Button onClick={()=>navigate('login')}>로그인 <ArrowRight size={16}/></Button>}</section>:
        view==='contracts'?(session.demo?<DealDesk state={state} user={user} mutate={mutate}/>:<Connections connections={state.connections} onMembers={openMembers}/>):
        <Market key={(user?.id||'guest')+':'+navRevision} state={state} user={user} isDemo={Boolean(session?.demo)} reviewRoomKey={session?.demo?activeRoom():null} view={view} postId={['feed','mine'].includes(view)?detail:null} initialCategory={view==='new'?detail:null} onChoosePost={id=>go(id?view+'/'+id:view,{scroll:false})} onView={navigate} mutate={mutate} onSelect={(offer,post,tier)=>setSelect({offer,post,tier})} onLogin={()=>navigate('login')} onDiscoveryBack={backToBrandRequests}/>}
    </main>
    <SiteFooter onHome={()=>go('intro')} onSection={openSection} active={view} theme={theme} onTheme={themeToggle}/>
    {select&&(session?.demo?<SelectDialog {...select} user={user} mutate={mutate} onClose={()=>setSelect(null)} onComplete={()=>navigate('contracts')}/>:<ConnectionDialog {...select} mutate={mutate} onClose={()=>setSelect(null)} onComplete={()=>navigate('contracts')}/>)}
  </div></MotionConfig>;
}
