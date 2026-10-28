import React, {useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {AnimatePresence,MotionConfig,motion,useReducedMotion} from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import {ArrowRight,CheckCircle,X,Package,ClipboardText,CaretRight,Plus,Moon,Sun,Tray} from "@phosphor-icons/react";
import {readSaved} from "./model";
import {api,quoteStatuses} from "./api";
import ServiceIntro from "./ServiceIntro";
import MemberPortal from "./MemberPortal";
import MatchingFlow from "./MatchingFlow";
import {MATCH_CATEGORIES} from "./matching-preview.js";
import {pageFromHistory,matchingFromHistory} from "./navigation.js";
import OrderAlerts,{OrderAlertContext,OrderAlertNotice} from "./OrderAlerts";
import "./styles.css";
import "./funnel-shell.css";
const spring={type:"spring",stiffness:420,damping:30,mass:0.8};
const money=n=>new Intl.NumberFormat("ko-KR").format(n);
const navItems=[["intro","서비스 소개"],["request","파트너 찾기"],["guide","이용 안내"]];
function Button({ children, className = "", tone = "primary", ...props }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={`button ${tone} ${className}`}
      whileHover={reduce ? {} : { y: -2 }}
      whileTap={reduce ? {} : { scale: 0.96, y: 0 }}
      transition={spring}
      {...props}
    >
      {children}
    </motion.button>
  );
}
function Photo({ index, className = "", label }) {
  return (
    <div
      role="img"
      aria-label={label || "패키징 제작 사례 예시 이미지"}
      className={`product-photo photo-${index} ${className}`}
    />
  );
}
function PolicyDocument({kind}) {
  const [data,setData]=useState(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError("");api("policy").then(result=>{if(active)setData(result);}).catch(problem=>{if(active)setError(problem.message);});return()=>{active=false;};},[retry]);
  if(error)return <Empty title="안내를 불러오지 못했습니다" description={error} action={<Button onClick={()=>setRetry(value=>value+1)}>다시 시도</Button>}/>;
  if(!data)return <p role="status">안내를 불러오는 중입니다.</p>;
  return <div className="policy-document">{!data.published&&<p className="demo-note">운영 정보 확정 전 검토용 초안입니다.</p>}<p className="request-description">{kind==="privacy"?data.privacy:data.terms}</p><p className="helper-text">운영자: {data.operator||"미정"} · 문의: {data.contactEmail||"미정"}</p></div>;
}
function Modal({ open, onClose, title, description, children, wide = false }) {
  const reduce = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                document.querySelector("[data-return-focus]")?.focus();
              }}
            >
              <motion.div
                className={`modal ${wide ? "wide" : ""}`}
                initial={
                  reduce ? { opacity: 0 } : { opacity: 0, y: 35, scale: 0.97 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduce ? { opacity: 0 } : { opacity: 0, y: 25, scale: 0.98 }
                }
                transition={spring}
              >
                <OrderAlertNotice/>
                <div className="modal-heading">
                  <div>
                    <Dialog.Title>{title}</Dialog.Title>
                    <Dialog.Description>{description}</Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button
                      tone="ghost"
                      className="icon-button"
                      aria-label="닫기"
                    >
                      <X size={22} />
                    </Button>
                  </Dialog.Close>
                </div>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
function Empty({ title, description, action }) {
  return (
    <div className="empty">
      <Tray size={42} weight="duotone" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}


function Guide({onRequest}) {
 return <section className="shell inner-page revised-guide">
  <div className="page-heading"><h1>필요한 조건만 알려주세요.</h1><p>찾고, 비교하고, 연결하는 일은 팩트너가 함께합니다.</p></div>
  <ol className="funnel-guide-steps">{[
   ['가입 신청과 검증','가입 신청 후 운영팀이 업체와 자료를 확인하고 승인해요.'],
   ['업체 정보 준비','운영팀과 소통하며 실제 패키징 정보와 제작 조건을 등록해요.'],
   ['후보 비교와 연결 요청','필요한 품목을 선택하고, 원하는 파트너를 여러 곳 골라 요청하세요.'],
   ['거래 연결 후 발주','운영팀이 거래를 연결하면 승인된 패키징 정보로 발주할 수 있어요.']
  ].map(([title,copy],i)=><li key={title}><span>{i+1}</span><div><h2>{title}</h2><p>{copy}</p></div></li>)}</ol>
  <Button onClick={onRequest}>맞는 파트너 찾기 <ArrowRight size={20}/></Button>
  <h2 className="faq-title">궁금한 점</h2><div className="faq">{[
   ['아직 규격이나 수량을 몰라도 되나요?','운영팀과 먼저 제작 조건을 정할 수 있어요. 파트너 찾기는 품목을 기준으로 하며 지역 제한은 없어요.'],
   ['신청하면 바로 이용할 수 있나요?','가입 신청은 심사 대기로 접수됩니다. 운영팀의 승인 후 로그인할 수 있고, 발주는 거래 업체 연결 후 이용할 수 있어요.'],
   ['가입비는 얼마인가요?','가입비는 아직 미정이며 운영팀이 별도로 안내합니다. 정기 구독은 없고, 사이트에서 결제를 진행하지는 않아요.'],
   ['화면의 후보가 실제 업체인가요?','가입이 승인된 회원 중 운영팀이 정보를 등록하고 공개한 실제 후보입니다. 상호와 연락처는 공개하지 않으며, 운영팀 확인 후 거래를 연결해요.']
  ].map(([q,a])=><details key={q}><summary>{q}<Plus size={19}/></summary><p>{a}</p></details>)}</div>
 </section>;
}
function App(){
 const [member,setMember]=useState(null),[authLoading,setAuthLoading]=useState(true);
 const [page,setPage]=useState(()=>pageFromHistory(location.hash.slice(1)||history.state?.factnerPage)),[flowVisited,setFlowVisited]=useState(()=>pageFromHistory(location.hash.slice(1)||history.state?.factnerPage)==='request'),[signupContext,setSignupContext]=useState(null);
 const [requestedOrder,setRequestedOrder]=useState(null),[attentionRefresh,setAttentionRefresh]=useState(0),[orderAlertNotice,setOrderAlertNotice]=useState(null);
 const [requests,setRequests]=useState(()=>readSaved('factner:requests',[]));
 const [modal,setModal]=useState(null),[toast,setToast]=useState('');
 const [theme,setTheme]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
 const reduce=useReducedMotion(),toastTimer=useRef();
 useEffect(()=>{let active=true;api('member/me').then(data=>{if(active)setMember(data.member);}).catch(()=>{}).finally(()=>{if(active)setAuthLoading(false);});return()=>{active=false;};},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 useEffect(()=>{
  // Refresh and browser Back/Forward retain the current workflow destination.
  history.replaceState({...history.state,factnerPage:pageFromHistory(location.hash.slice(1)||history.state?.factnerPage)},'', '/');
  const sync=()=>{const next=pageFromHistory(location.hash.slice(1)||history.state?.factnerPage);setPage(next);if(next==='request')setFlowVisited(true);window.scrollTo({top:0,behavior:'instant'});};
  window.addEventListener('popstate',sync);window.addEventListener('hashchange',sync);
  return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync);};
 },[]);
 useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
 function notify(message){clearTimeout(toastTimer.current);setToast(message);toastTimer.current=setTimeout(()=>setToast(''),3400);}
 function navigate(next,entry={}){const state={...history.state,factnerPage:next,...(next==='request'?{matching:{...history.state?.matching,stage:'form',depth:0,selected:[]}}:{}),...entry};if(history.state?.factnerPage!==next)history.pushState(state,'','/');else if(Object.keys(entry).length){history.replaceState(state,'','/');window.dispatchEvent(new PopStateEvent('popstate',{state}));}if(next==='request')setFlowVisited(true);setPage(next);window.scrollTo({top:0,behavior:'instant'});}
 function openModal(value){if(!document.activeElement?.closest('.modal')){document.querySelector('[data-return-focus]')?.removeAttribute('data-return-focus');document.activeElement?.setAttribute('data-return-focus','');}setModal(value);}
 function openOrderAlert(id){if(modal){notify('입력 중인 창을 닫은 뒤 발주 알림을 확인해주세요.');return;}setRequestedOrder({id,key:Date.now()});navigate('account');}
 const startRequest=()=>navigate('request',{matching:matchingFromHistory(null,member)});
 const openAccount=()=>{setSignupContext(null);navigate('account',member?{}:{memberAuth:{mode:'login',step:0,role:'',legal:'',depth:0}});};
 const beginSignup=context=>{setSignupContext(context);navigate('account',{memberAuth:{mode:'signup',step:context?.role?1:0,role:context?.role||'',legal:'',depth:0}});};
  useEffect(() => {
    let cancelled=false;
    async function refresh() {
      const saved=readSaved("factner:requests",[]);
      if (!saved.length) return;
      const results=await Promise.allSettled(saved.map(async item=>({ ...item,
        ...await api(`quotes/${item.id}`,{headers:{Authorization:`Bearer ${item.receiptToken}`}})
      })));
      if(cancelled) return;
      const updates=new Map(results.map((result,i)=>[saved[i].id,result.status==="fulfilled"?result.value:
        result.reason?.status===404?{...saved[i],status:"expired",customer_message:"요청을 찾을 수 없습니다. 접수 번호로 운영팀에 문의해주세요."}:saved[i]]));
      // A request may have been submitted while this refresh was in flight.
      const latest=readSaved("factner:requests",[]);
      const next=latest.map(item=>updates.get(item.id)||item);
      setRequests(next);
      setModal(current=>current?.type==="requestDetail"&&updates.has(current.item.id)?{...current,item:updates.get(current.item.id)}:current);
      try { localStorage.setItem("factner:requests",JSON.stringify(next)); } catch {}
    }
    if(page==="activity") refresh();
    const timer=setInterval(()=>{if(page==="activity"&&document.visibilityState==="visible")refresh();},20000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[page]);
  async function viewRequest(item) {
    openModal({type:"requestDetail",item});
    try {
      const latest=await api(`quotes/${item.id}`,{headers:{Authorization:`Bearer ${item.receiptToken}`}});
      setModal(current=>current?.type==="requestDetail"&&current.item.id===item.id?{...current,item:{...item,...latest}}:current);
    } catch(error) { notify(error.message); }
  }

 return <OrderAlertContext.Provider value={member?.role==='supplier'&&orderAlertNotice?.memberId===member.id?orderAlertNotice:null}>
 <MotionConfig transition={spring} reducedMotion="user">
  <a href="#main" className="skip-link" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>본문 바로가기</a>
  <header className="site-header funnel-header"><div className="header-inner">
   <button className="logo" aria-label="팩트너 홈" onClick={()=>navigate('intro')}><Package size={28} weight="fill"/><span>factner<span className="logo-dot">.</span></span></button>
   <nav aria-label="주 메뉴">{navItems.map(([key,label])=><button key={key} onClick={()=>key==='request'?startRequest():navigate(key)} className={'nav-link '+(page===key?'active':'')} aria-current={page===key?'page':undefined}>{label}{page===key&&<motion.span className="nav-indicator" layoutId="nav-indicator"/>}</button>)}</nav>
   <div className="header-actions"><button className="member-login-link" onClick={openAccount}>{member?'마이페이지':'로그인'}</button></div>
  </div></header>
  <main id="main" tabIndex={-1}>
   {flowVisited&&<div hidden={page!=='request'}><MatchingFlow Button={Button} onSignup={beginSignup} onAccount={openAccount} member={member} authLoading={authLoading} active={page==='request'}/></div>}
   <AnimatePresence mode="wait"><motion.div key={page} initial={reduce?false:{opacity:0,y:page==='intro'?0:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.18}}>
    {page==='intro'&&<ServiceIntro Button={Button} Photo={Photo} onRequest={startRequest}/>}
    {page==='guide'&&<Guide onRequest={startRequest}/>}
    {page==='account'&&<>
     {!member&&signupContext&&<aside className="signup-context shell"><div><strong>{signupContext.role==='supplier'?'패키징 제작 업체':'브랜드'} 가입 신청</strong><p>{MATCH_CATEGORIES.find(item=>item.value===signupContext.category)?.label} · 가입 승인 후 실제 파트너를 확인할 수 있어요.</p></div><button onClick={()=>navigate('request')}>조건으로 돌아가기 <ArrowRight size={18}/></button></aside>}
     <MemberPortal member={member} onMember={setMember} authLoading={authLoading} Button={Button} Modal={Modal} signupContext={signupContext} onFindPartner={startRequest} onLegacy={()=>navigate('activity')} requestedOrder={requestedOrder} onOrderOpened={()=>setRequestedOrder(null)} onAttentionChange={()=>setAttentionRefresh(v=>v+1)}/>
    </>}
    {page==='activity'&&<section className="shell inner-page"><div className="page-heading"><h1>기존 견적 내역</h1><p>이 브라우저에서 접수한 견적을 확인할 수 있어요.</p></div>
     {requests.length?<div className="request-list">{requests.map(r=><button key={r.id} className="request-row" onClick={()=>viewRequest(r)}><span className="request-icon"><ClipboardText size={24}/></span><span><small>{new Date(r.createdAt).toLocaleDateString('ko-KR')}</small><strong>{r.brand}의 {r.category} 제작</strong><span>{money(r.quantity)}개</span></span><span className="request-status">{quoteStatuses[r.status]||'접수'}<CaretRight size={18}/></span></button>)}</div>:<Empty title="접수한 견적이 없어요" action={<Button onClick={startRequest}>견적 문의하기 <ArrowRight size={18}/></Button>}/>}
    </section>}
   </motion.div></AnimatePresence>
  </main>
  <footer className="site-footer shell"><div><button className="logo" onClick={()=>navigate('intro')}><Package size={24} weight="fill"/><span>factner.</span></button><small>© {new Date().getFullYear()} factner.</small></div><div className="footer-right"><button onClick={()=>navigate('guide')}>이용 안내</button><button onClick={()=>navigate('activity')}>기존 견적 조회</button><button onClick={()=>openModal({type:'policy',kind:'privacy'})}>개인정보처리방침</button><button onClick={()=>openModal({type:'policy',kind:'terms'})}>이용약관</button><Button tone="ghost" className="icon-button" aria-label={theme==='light'?'다크 모드로 전환':'라이트 모드로 전환'} onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</Button><p>소개 이미지는 연출입니다.</p></div></footer>
  {member?.role==='supplier'&&<OrderAlerts key={member.id} member={member} refreshKey={attentionRefresh} onNotice={setOrderAlertNotice} onOpen={openOrderAlert} onSessionExpired={()=>setMember(null)}/>}
  <div className="toast-region" role="status" aria-live="polite"><AnimatePresence>{toast&&<motion.div className="toast" key={toast} initial={{y:16,opacity:0}} animate={{y:0,opacity:1}} exit={{opacity:0}}><CheckCircle size={21} weight="fill"/>{toast}</motion.div>}</AnimatePresence></div>
  <Modal open={modal?.type==='policy'} onClose={()=>setModal(null)} title={modal?.kind==='privacy'?'개인정보처리방침':'이용약관'} description="팩트너 서비스 운영 안내">{modal?.type==='policy'&&<PolicyDocument kind={modal.kind}/>}</Modal>
      <Modal
        open={modal?.type === "requestDetail"}
        onClose={() => setModal(null)}
        title="작성한 요청서"
        description="서버에 접수된 견적 요청"
      >
        {modal?.type === "requestDetail" && (
          <div className="request-detail">
            <dl>
              {[
                ["접수 번호", modal.item.id],
                ["진행 상태", quoteStatuses[modal.item.status] || "접수"],
                ["브랜드", modal.item.brand],
                [
                  "요청 방식",
                  modal.item.supplier
                    ? `직접 매칭 / ${modal.item.supplier}`
                    : "비교 견적",
                ],
                ["패키징", modal.item.category],
                ["수량", `${money(modal.item.quantity)}개`],
                ["희망 규격", modal.item.size || "상담 후 결정"],
                ["희망 납기", modal.item.deadline || "협의 가능"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>요청 내용</h3>
            <p className="request-description">{modal.item.description || "접수 내용을 불러오고 있습니다."}</p>
            <h3>운영팀 안내</h3>
            <p className="request-description">{modal.item.customer_message || "운영팀에서 내용을 확인 중입니다."}</p>
          </div>
        )}
      </Modal>
</MotionConfig></OrderAlertContext.Provider>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
