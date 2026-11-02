import React,{useCallback,useEffect,useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, CaretDown, Moon, Sun, X, SlidersHorizontal, Storefront, PenNib, Package, Stack, SquaresFour, SignOut } from '@phosphor-icons/react';
import {MotionConfig,motion} from 'motion/react';
import {BrandMark,Button,Photo} from '../BrandControls';
import ServiceIntro from '../ServiceIntro';
import Market from './Market';
import {DealDesk,SelectDialog} from './DealDesk';
import './shell.css';

const KINDS={brand:['브랜드',Storefront],design:['개인 디자이너',PenNib],packaging:['패키징 제작',Package],both:['디자인·패키징',Stack]};
const EMPTY={posts:[],offers:[],contracts:[]};
const tokenKey='factner-bid-review-token';
const roomStorageKey='factner-bid-review-room';
const roomFormat=/^[0-9a-f]{64}$/;
function readToken(){return sessionStorage.getItem(tokenKey)||'';}
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
  try{result=await response.json();}catch{throw new Error('입찰 서버에 연결하지 못했습니다. 다시 시도해 주세요.');}
  if(!response.ok)throw new Error(result.error||'요청을 처리하지 못했습니다.');
  return result;
}
function AccountDialog({open,onClose,initial,session,onAuth,onExit,ops}){
  const [mode,setMode]=useState(initial),[kind,setKind]=useState(KINDS[session.user?.kind]?session.user.kind:'brand'),[selected,setSelected]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const accounts=session.accounts||[];
  async function act(path,data){
    if(busy)return;
    setBusy(true);setErr('');
    try{await onAuth(path,data);onClose();}catch(e){setErr(e.message);}finally{setBusy(false);}
  }
  const selectMode=(v)=>{setMode(v);setErr('');};
  const shown=accounts.filter(a=>a.kind===kind);
  const active=shown.find(a=>a.email===selected)||shown[0];
  return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal><Dialog.Overlay className="bx-overlay"/><Dialog.Content className="bx-dialog">
    <Dialog.Close asChild><button className="bx-close" aria-label="닫기"><X size={18}/></button></Dialog.Close>
    <div className="bx-dialog-icon"><Package size={25} weight="fill"/></div>
    <Dialog.Title className="bx-dialog-title">{mode==='demo'?'체험할 계정을 선택하세요':mode==='register'?(session.hosted?'체험 계정 만들기':'팩트너 회원가입'):'계정 로그인'}</Dialog.Title>
    <Dialog.Description className="bx-sub">{mode==='demo'?'역할을 바꾸며 같은 공고의 거래 과정을 확인할 수 있습니다.':mode==='register'?'어떤 역할로 입찰에 참여할지 선택하세요.':'가입한 이메일로 입찰 보드에 들어갑니다.'}</Dialog.Description>
    {session.hosted&&<p className="bx-room-note">{mode==='register'
      ?'이 계정은 현재 브라우저의 체험 공간에만 등록됩니다. 가상의 상호·이메일과 체험용 비밀번호를 입력해주세요.'
      :'같은 브라우저의 다른 탭에서 역할을 바꿔볼 수 있습니다. 운영팀도 이 체험 공간의 가상 거래만 볼 수 있습니다.'}</p>}
    <div className="bx-tabs">{(session.demo?['demo','login','register']:['login','register']).map(m=><button type="button" key={m} aria-pressed={mode===m} onClick={()=>selectMode(m)}>{({demo:'체험 계정',login:'로그인',register:'회원가입'})[m]}</button>)}</div>
    {mode!=='login'&&<div className="bx-kinds" role="group" aria-label="회원 유형">{Object.entries(KINDS).map(([k,[label,Icon]])=><button key={k} type="button" aria-pressed={kind===k} onClick={()=>{setKind(k);setSelected('');}}><Icon size={18}/>{label}</button>)}</div>}
    {mode==='demo' ? <div className="bx-form">
      <label>체험 계정<select value={active?.email||''} onChange={e=>setSelected(e.target.value)}>{shown.map(a=><option key={a.email} value={a.email}>{a.name} · {a.email}</option>)}</select></label>
      <button className="bx-primary" disabled={!active||busy} onClick={()=>act('/demo',{email:active.email})}>이 계정으로 시작 <ArrowRight size={16}/></button>
      {ops&&<button className="bx-link" disabled={busy} onClick={()=>act('/demo',{role:'admin'})}><SlidersHorizontal size={15}/> 운영팀으로 입장</button>}
    </div>:<form className="bx-form" onSubmit={e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));act(mode==='login'?'/login':'/register',{...fields,kind});}}>
      {mode==='register'&&<label>{session.hosted?'가상 이름 또는 상호':'이름 또는 상호'}<input name="name" required maxLength={60} placeholder={session.hosted?'예: 연습 브랜드':undefined} autoComplete={session.hosted?'off':'organization'}/></label>}
      <label>이메일<input name="email" type="email" placeholder={session.hosted?'brand@example.test':'name@company.com'} required autoComplete={session.hosted?'off':'username'}/></label>
      <label>비밀번호<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode==='register'?'new-password':'current-password'}/></label>
      <button className="bx-primary" disabled={busy}>{mode==='register'?'가입하고 시작하기':'로그인'} <ArrowRight size={16}/></button>
    </form>}
    {err&&<p role="alert" className="bx-error">{err}</p>}
    {session.user&&<button className="bx-link" onClick={async()=>{try{await onExit();onClose();}catch(e){setErr(e.message);}}}><SignOut size={14}/>현재 계정 로그아웃</button>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
const allowed=new Set(['intro','feed','mine','new','contracts']);
function initialView(){const v=location.hash.slice(1);return allowed.has(v)?v:'intro';}
export default function BidApp(){
  const ops=location.pathname.replace(/\/+$/,'')==='/ops';
  const [session,setSession]=useState({user:null,accounts:[],demo:false}),[state,setState]=useState(EMPTY),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [view,setView]=useState(ops?'contracts':initialView),[dialog,setDialog]=useState(''),[select,setSelect]=useState(null);
  const [theme,setTheme]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  const seq=useRef(0);
  const channel=useRef(null);
  const intro=view==='intro'&&!ops;
  const refresh=useCallback(async(full=false)=>{
    if(intro&&!full)return;
    const num=++seq.current;
    try{
      const token=readToken();
      const [data,me]=await Promise.all([intro?null:request('/state',undefined,token),full?request('/session',undefined,token):null]);
      if(token!==readToken())return;
      if(me)setSession(me);
      if(num!==seq.current)return;
      if(data)setState(data);
      setError('');setReady(true);
    }catch(e){if(num===seq.current){setError(e.message);setReady(true);}}
  },[intro]);
  useEffect(()=>{refresh(true);
    const focus=()=>refresh(true);window.addEventListener('focus',focus);
    return()=>window.removeEventListener('focus',focus);},[refresh]);
  useEffect(()=>{
    if(intro||!ready)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},2400);
    return()=>clearInterval(timer);
  },[intro,ready,refresh]);
  useEffect(()=>{
    if(intro||!session.demo)return;
    if(session.hosted){
      if(!window.BroadcastChannel)return;
      let active=true,localChannel;
      reviewRoom().then(room=>{
        if(!active)return;
        localChannel=new BroadcastChannel('factner-bid-review-'+room);
        localChannel.onmessage=event=>{if(event.data==='refresh')refresh();};
        channel.current=localChannel;
      }).catch(()=>{}); // Polling remains available when cross-tab messaging is unavailable.
      return()=>{active=false;localChannel?.close();if(channel.current===localChannel)channel.current=null;};
    }
    const stream=new EventSource('/api/bid/events');
    stream.onmessage=()=>{if(document.visibilityState==='visible')refresh();};
    return()=>stream.close();
  },[intro,session.demo,session.hosted,refresh]);
  useEffect(()=>{const handle=()=>setView(ops?'contracts':initialView());window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[ops]);
  const navigate=v=>{if(ops&&v!=='contracts'){location.assign('/#'+v);return;}
    if(!session.user&&!['feed','intro'].includes(v)){setDialog(session.demo?'demo':'login');return;}
    setView(v);location.hash=v;window.scrollTo(0,0);};
  const authenticate=async(path,body)=>{const data=await request(path,body);++seq.current;sessionStorage.setItem(tokenKey,data.token);setState(EMPTY);setSelect(null);setSession(s=>({...s,user:data.user}));setReady(false);
    const v=data.user.kind==='admin'?'contracts':data.user.kind==='brand'?'new':'feed';
    if(ops && data.user.kind!=='admin'){location.assign('/#'+v);return;}
    if(!ops && data.user.kind==='admin'){location.assign('/ops');return;}
    setView(v);location.hash=v;await refresh(true);};
  const logout=async()=>{await request('/logout',{});++seq.current;sessionStorage.removeItem(tokenKey);setState(EMPTY);setSelect(null);setSession(s=>({...s,user:null}));setView(ops?'contracts':'intro');location.hash=ops?'contracts':'intro';await refresh(true);};
  const mutate=async(path,data)=>{const result=await request(path,data);channel.current?.postMessage('refresh');await refresh();return result;};
  const login=()=>setDialog(session.demo?'demo':'login');
  const links=session.user?.kind==='admin'||ops?[['contracts','계약 관리']]:[
    ['intro','서비스 소개'],['feed','입찰 전광판'],...(session.user?[['mine',session.user.kind==='brand'?'내 공고':'내 입찰'],['contracts','계약함']]:[])
  ];
  return <MotionConfig reducedMotion="user"><div className="bx-shell">
  <a className="skip-link" href="#bid-work" onClick={e=>{e.preventDefault();document.getElementById('bid-work')?.focus();}}>본문 바로가기</a>
  <header className="site-header funnel-header"><div className="header-inner">
    <button className="logo" aria-label="팩트너 홈" onClick={()=>navigate('intro')}><BrandMark/></button>
    <nav aria-label="주 메뉴">{links.map(([key,label])=><button key={key} className={'nav-link '+(view===key?'active':'')} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{label}{view===key&&<motion.span className="nav-indicator" layoutId="bid-navigation"/>}</button>)}</nav>
    <div className="header-actions bx-account">{session.user ? <button className="member-login-link bx-user" onClick={login}><span>{session.user.name}</span><CaretDown size={15}/></button>:<>
    <button className="member-login-link" onClick={()=>setDialog('login')}>로그인</button>{session.demo&&<Button className="bx-try" tone="soft" onClick={login}>계정 체험 <ArrowRight size={15}/></Button>}</>}</div>
  </div></header>
  {session.hosted&&!intro&&<aside className="bx-room-strip" aria-label="공개 체험 안내"><div className="shell">
    <strong>브라우저 전용 체험</strong><span>가상 자료만 사용해주세요. 서명과 결제는 모의 기록입니다.</span>
  </div></aside>}
  <main id="bid-work" tabIndex={-1}>{error&&<div role="alert" className="bx-alert">{error} <button onClick={()=>refresh(true)}>다시 연결</button></div>}
    {view==='intro'&&!ops?<ServiceIntro Button={Button} Photo={Photo} onRequest={()=>navigate('feed')}/>:!ready?<p className="bx-loading" role="status">입찰 공고를 불러오고 있습니다.</p>:ops&&session.user?.kind!=='admin'?<div className="bx-authgate"><SquaresFour size={35}/><h1>계약 운영실</h1><p>양측 서명이 끝난 계약을 확인하고 당사자 정보를 공개합니다.</p><button className="bx-primary" onClick={login}>운영팀 계정으로 입장 <ArrowRight size={15}/></button></div>:
    view==='contracts'&&session.user?<DealDesk state={state} user={session.user} mutate={mutate}/>:<Market key={session.user?.id||'guest'} state={state} user={session.user} view={view==='contracts'?'feed':view} onView={navigate} mutate={mutate} onSelect={(offer,post,tier)=>setSelect({offer,post,tier})} onLogin={login}/>}
  </main>
  <footer className="site-footer shell"><div><button className="logo" aria-label="팩트너 홈" onClick={()=>navigate('intro')}><BrandMark size={24}/></button><small>© {new Date().getFullYear()} factner.</small></div>
    <div className="footer-right"><button onClick={()=>navigate('feed')}>입찰 전광판</button>{session.demo&&!ops&&<a href="/ops">운영실</a>}
      {session.hosted&&<a href="/members/">기존 회원 서비스</a>}
      <Button tone="ghost" className="icon-button" aria-label={theme==='light'?'다크 모드로 전환':'라이트 모드로 전환'} onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</Button>
      <p>소개 이미지는 연출입니다.</p></div></footer>
  {dialog&&<AccountDialog open initial={dialog} session={session} onClose={()=>setDialog('')} onAuth={authenticate} onExit={logout} ops={ops}/>}
  {select&&<SelectDialog {...select} user={session.user} mutate={mutate} onClose={()=>setSelect(null)} onComplete={()=>navigate('contracts')}/>}
  </div></MotionConfig>;
}
