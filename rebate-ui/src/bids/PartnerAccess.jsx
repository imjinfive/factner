import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CaretRight, Package, PenNib, Stack, Storefront, X } from '@phosphor-icons/react';
import { Button } from '../BrandControls';
import CustomerAccount from './CustomerAccount';
import { MATCH_CATEGORIES } from '../matching-preview.js';
import { isPackagingPartner } from '../../../shared/partner-roles.js';
import { isPublicPost } from './post-visibility.js';
import '../member-portal.css';
import '../matching-flow.css';
import './access.css';

const kinds = {
  brand: ['패키징을 맡길 제작업체를 찾고 있어요', Storefront, '우리 제품의 포장을 만들어 줄 파트너를 살펴봐요.'],
  packaging: ['새로운 고객의 제작 의뢰를 찾고 있어요', Package, '우리 업체가 입찰할 수 있는 공고를 살펴봐요.'],
  design: ['디자이너', PenNib, '패키지·라벨 디자인'],
  both: ['디자인·패키징', Stack, '현재는 패키징 제작 공고에 제안할 수 있어요.']
};
const historyKey = 'bidAccessPick';
const dialogKey = 'bidAccessDialog';
const number = new Intl.NumberFormat('ko-KR');
function cleanPick(value = {}) {
  return {
    role: ['brand','supplier'].includes(value?.role) ? value.role : '',
    item: MATCH_CATEGORIES.some(item => item.value === value?.item) ? value.item : '',
    candidate: value?.role === 'brand' && typeof value.candidate === 'string' ? value.candidate : ''
  };
}
function readPick(mode, entry = history.state) {
  if (entry?.[historyKey]) return cleanPick(entry[historyKey]);
  const discovery = entry?.factnerRoute ? entry.factnerRoute === 'feed' : mode === 'discovery';
  return cleanPick({role:discovery && entry?.discoveryRole === 'supplier' ? 'supplier' : ''});
}
function writeEntry(entry, push = false) {
  history[push ? 'pushState' : 'replaceState'](entry, '', '/');
}
function DesignerSignupNotice({ children, defaultOpen = false }) {
  const [open,setOpen] = useState(() => history.state?.[dialogKey] === 'designer-notice');
  useLayoutEffect(() => {
    const restore = () => setOpen(history.state?.[dialogKey] === 'designer-notice');
    if (defaultOpen && history.state?.[dialogKey] !== 'designer-notice') {
      writeEntry({...history.state,[dialogKey]:'designer-notice'},true);
      setOpen(true);
    }
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  },[defaultOpen]);
  function change(next) {
    if (next && history.state?.[dialogKey] !== 'designer-notice') writeEntry({...history.state,[dialogKey]:'designer-notice'},true);
    if (!next && history.state?.[dialogKey] === 'designer-notice') history.back();
    setOpen(next);
  }
  return <Dialog.Root open={open} onOpenChange={change}>
    <Dialog.Trigger asChild>{children}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="modal-overlay"/>
      <Dialog.Content className="modal pa-notice">
        <header className="modal-heading"><div>
          <Dialog.Title>디자이너 회원가입은 준비 중입니다</Dialog.Title>
          <Dialog.Description>기존 계정은 이메일과 비밀번호로 로그인할 수 있습니다.</Dialog.Description>
        </div><Dialog.Close asChild><button type="button" className="button ghost icon-button" aria-label="닫기">
          <X size={20} aria-hidden="true"/></button></Dialog.Close></header>
        <footer><Dialog.Close asChild><button type="button" className="button primary">확인</button></Dialog.Close></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
function RoleCards({ selected, onSelect }) {
  return <div className="pa-role-grid" role="group" aria-label="회원 역할">
    {['brand','packaging','design'].map(key => {
      const [label, Icon, note] = kinds[key], notice = key === 'design';
      const button = <button key={key} type="button" className={'pa-role-card' + (notice ? ' pa-notice-card' : '')}
        aria-pressed={notice ? undefined : selected === key} onClick={notice ? undefined : event => onSelect(key,event.currentTarget)}>
        <span className="pa-role-icon"><Icon size={26} aria-hidden="true"/></span>
        <span className="pa-role-copy"><strong>{label}</strong><small>{note}</small></span>
        {notice ? <span className="pa-soon">준비 중</span> : <CaretRight className="pa-intent-caret" size={18} aria-hidden="true"/>}
      </button>;
      return notice ? <DesignerSignupNotice key={key}>{button}</DesignerSignupNotice> : button;
    })}
  </div>;
}
function Discovery({ pick, save, navigate, partners, posts }) {
  const role = ['brand','supplier'].includes(pick.role) ? pick.role : '';
  const {item,candidate} = pick;
  const section = useRef(null), timer=useRef(null), intentButton=useRef(null);
  const [loading,setLoading]=useState('');
  function cancelLoading(){clearTimeout(timer.current);setLoading('');}
  useEffect(()=>{
    window.addEventListener('popstate',cancelLoading);
    return ()=>{clearTimeout(timer.current);window.removeEventListener('popstate',cancelLoading);};
  },[]);
  useLayoutEffect(() => {
    const {discoveryScrollY,discoveryReturnId} = history.state || {};
    if (!Number.isFinite(discoveryScrollY)) return;
    const frame = requestAnimationFrame(() => {
      Array.from(section.current?.querySelectorAll('[data-brief]') || []).find(button => button.dataset.brief === discoveryReturnId)?.focus({preventScroll:true});
      window.scrollTo({top:discoveryScrollY,behavior:'instant'});
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const isBrand = role === 'brand';
  const allSuppliers = (partners || []).filter(partner => /^(?:[A-Z]|[1-9]\d*)업체$/.test(partner.alias) && isPackagingPartner(partner.kind));
  const suppliers = item ? allSuppliers.filter(partner => partner.items?.includes(item)) : allSuppliers;
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10);
  const briefs = (posts || []).filter(post => isPublicPost(post) && post.category === 'packaging' && (post.example === true || (post.status === 'open' && post.deadline >= today)));
  function selectRole(key,button) {
    const next = key === 'brand' ? 'brand' : 'supplier';
    if(role===next || loading)return;
    intentButton.current=button;setLoading(next);
    timer.current=setTimeout(()=>{save({role:next},true);setLoading('');},2000);
  }
  return <section ref={section} className="match-shell pa-discovery">
    <header className="pa-heading"><h1>어떤 파트너를 만나고 싶으세요?</h1>
      <p>지금 하려는 일을 골라주세요. 가입 전에 먼저 둘러볼 수 있어요.</p></header>
    <RoleCards selected={isBrand ? 'brand' : role === 'supplier' ? 'packaging' : ''} onSelect={selectRole}/>
    <Dialog.Root open={Boolean(loading)} onOpenChange={open=>{if(!open)cancelLoading();}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="modal pa-searching" onCloseAutoFocus={event=>{event.preventDefault();intentButton.current?.focus({preventScroll:true});}}>
      <Package size={32} aria-hidden="true"/><Dialog.Title>{loading==='brand'?'제작 파트너를 찾고 있어요':'새 고객의 제작 의뢰를 찾고 있어요'}</Dialog.Title><Dialog.Description>{loading==='brand'?'제작 가능한 품목을 비교해 보세요.':'수량과 희망 단가가 맞는 공고를 골라보세요.'}</Dialog.Description><div className="pa-search-progress" aria-hidden="true"/>
      <Dialog.Close asChild><button type="button" className="button ghost">취소</button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    {role && <section className="pa-results" aria-label={isBrand ? '패키징 제작 파트너' : '브랜드 제작 공고'}>
      <header><div><h2>{isBrand ? '제작 파트너' : '브랜드 의뢰'}</h2>
        <span aria-live="polite">{isBrand ? suppliers.length + '곳' : briefs.length + '건'}</span></div>
        {isBrand && <select aria-label="제작 품목 필터" value={item} onChange={e => save({...pick,item:e.target.value})}>
          <option value="">전체 품목</option>
          {MATCH_CATEGORIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>}
      </header>
      {isBrand ? suppliers.length ? <div className="pa-list">{suppliers.map(partner =>
        <button key={partner.alias} type="button" className="pa-result" aria-pressed={candidate===partner.alias} onClick={() => save({...pick,candidate:partner.alias})}>
          <span className="pa-result-icon"><Package size={23} aria-hidden="true"/></span>
          <span className="pa-result-copy"><small>{partner.alias} · 패키징 제작{partner.example === true && <span className="pa-example">예시 업체</span>}</small><strong>{partner.title || partner.alias}</strong>
            {partner.description && <span>{partner.description}</span>}</span>
          <span className="pa-result-action">{candidate===partner.alias?'선택됨':'관심 업체 선택'}</span>
        </button>)}</div> : <div className="pa-empty"><p>{item ? '이 품목으로 등록된 제작 파트너가 아직 없어요.' : '등록된 제작 파트너가 아직 없어요.'}</p>
          {item && <button type="button" className="button outline" onClick={() => save({...pick,item:''})}>전체 보기</button>}</div>
        : briefs.length ? <div className="pa-list">{briefs.map(post =>
          <button type="button" key={post.id} data-brief={post.id} className="pa-result" onClick={() => navigate('feed/'+post.id)}>
            <span className="pa-result-icon"><Storefront size={23} aria-hidden="true"/></span>
            <span className="pa-result-copy"><small>{post.brandAlias || '브랜드'} · 패키징 제작{post.example === true && <span className="pa-example">예시 의뢰</span>}</small><strong>{post.title}</strong>
              <span>{number.format(post.quantity)}개 · 희망 {number.format(post.unitPrice)}원/개</span></span>
            <span className="pa-result-action">의뢰 보기</span>
          </button>)}</div> : <div className="pa-empty"><p>현재 모집 중인 패키징 제작 공고가 없습니다.</p></div>}
      <div className="pa-join"><div><strong>{isBrand?'제작 파트너와 실제로 연결하고 싶으세요?':'이 공고에 견적을 제안하고 싶으세요?'}</strong><p>회원가입을 신청하면 승인 후 매칭을 진행할 수 있어요.</p></div><Button onClick={()=>navigate('signup')}>회원가입 신청</Button></div>
    </section>}
  </section>;
}

export default function PartnerAccess({mode,navigationKey,session,posts,partners,onNavigate,onAuth,onExit,onMembers}) {
  const [pick,setPick] = useState(() => readPick(mode));
  const previousNavigation = useRef(navigationKey);
  const [accountError,setAccountError] = useState('');
  function save(value,push=false) {
    const next = cleanPick(value);
    if (push && !history.state?.[historyKey]) writeEntry({...history.state,[historyKey]:pick});
    setPick(next);writeEntry({...history.state,[historyKey]:next},push);
  }
  useEffect(() => {
    const restore = event => setPick(readPick(mode,event.state));
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  },[mode]);
  useLayoutEffect(() => {
    const fresh = previousNavigation.current !== navigationKey;
    previousNavigation.current = navigationKey;
    const next = mode === 'discovery' && fresh ? cleanPick() : readPick(mode);
    if (mode === 'discovery' && fresh) writeEntry({...history.state,[historyKey]:next});
    setPick(next);setAccountError('');
  },[mode,navigationKey]);
  if (mode === 'discovery') return <Discovery pick={pick} save={save} navigate={onNavigate} posts={posts} partners={partners}/>;
  if (mode === 'account' && session.user) return <section className="member-auth pa-access">
    <header className="member-auth-heading"><h1>내 계정</h1></header>
    <div className="member-card"><span className="member-tag">{{brand:'브랜드',packaging:'패키징 제작업체'}[session.user.kind] || kinds[session.user.kind]?.[0] || '운영팀'}</span>
      <h2 className="pa-section-title">{session.user.name}</h2>{session.user.email && <p className="member-hint">{session.user.email}</p>}
      <div className="pa-account-actions"><Button onClick={()=>onNavigate('contracts')}>계약함으로 이동</Button>
        {!session.demo && session.user.kind !== 'admin' && onMembers && <Button tone="outline" onClick={onMembers}>회원 정보·발주 확인</Button>}
        <Button tone="ghost" onClick={async()=>{try{await onExit();}catch(e){setAccountError(e.message);}}}>로그아웃</Button>
      </div>{accountError && <p className="member-error" role="alert">{accountError}</p>}
    </div></section>;
  const accountMode = ['signup','find-id','recover-password','reset-password'].includes(mode) ? mode : 'login';
  return <CustomerAccount key={accountMode === 'signup' ? session.registration?.consentVersion : undefined} mode={accountMode} session={session} SignupNotice={DesignerSignupNotice} onNavigate={onNavigate} onAuth={onAuth}/>;
}
