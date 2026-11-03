import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Package, PenNib, Stack, Storefront, X } from '@phosphor-icons/react';
import { Button } from '../BrandControls';
import CustomerAccount from './CustomerAccount';
import { MATCH_CATEGORIES } from '../matching-preview.js';
import { isPackagingPartner } from '../../../shared/partner-roles.js';
import { isPublicPost } from './post-visibility.js';
import '../member-portal.css';
import '../matching-flow.css';
import './access.css';

const kinds = {
  brand: ['브랜드', Storefront, '포장을 맡길 제작 파트너를 찾아요.'],
  packaging: ['패키징 제작업체', Package, '제작할 수 있는 브랜드 공고를 찾아요.'],
  design: ['디자이너', PenNib, '패키지·라벨 디자인'],
  both: ['디자인·패키징', Stack, '현재는 패키징 제작 공고에 제안할 수 있어요.']
};
const historyKey = 'bidAccessPick';
const dialogKey = 'bidAccessDialog';
const number = new Intl.NumberFormat('ko-KR');
function cleanPick(value = {}) {
  return {
    role: ['brand','supplier'].includes(value?.role) ? value.role : '',
    item: MATCH_CATEGORIES.some(item => item.value === value?.item) ? value.item : ''
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
function RoleCards({ selected, onSelect, notes }) {
  return <div className="pa-role-grid" role="group" aria-label="회원 역할">
    {['brand','packaging','design'].map(key => {
      const [label, Icon, note] = kinds[key], notice = key === 'design';
      const button = <button key={key} type="button" className={'pa-role-card' + (notice ? ' pa-notice-card' : '')}
        aria-pressed={notice ? undefined : selected === key} onClick={notice ? undefined : () => onSelect(key)}>
        <span className="pa-role-icon"><Icon size={26} aria-hidden="true"/></span>
        <span className="pa-role-copy"><strong>{label}</strong><small>{notes[key] || note}</small></span>
        {notice && <span className="pa-soon">준비 중</span>}
      </button>;
      return notice ? <DesignerSignupNotice key={key}>{button}</DesignerSignupNotice> : button;
    })}
  </div>;
}
function Discovery({ pick, save, navigate, partners, posts }) {
  const role = ['brand','supplier'].includes(pick.role) ? pick.role : '';
  const item = pick.item;
  const section = useRef(null);
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
  const roleNotes = {
    brand: Array.isArray(partners) ? `제작 파트너 ${allSuppliers.length}곳 보기` : '제작 파트너 보기',
    packaging: Array.isArray(posts) ? `브랜드 제작 의뢰 ${briefs.length}건 보기` : '브랜드 제작 의뢰 보기'
  };
  function selectRole(key) {
    const next = key === 'brand' ? 'brand' : 'supplier';
    if (role !== next) save({role:next},true);
  }
  return <section ref={section} className="match-shell pa-discovery">
    <header className="pa-heading"><h1>파트너 찾기</h1>
      <p>브랜드는 제작업체를, 제작업체는 브랜드의 제작 의뢰를 볼 수 있습니다.</p></header>
    <RoleCards selected={isBrand ? 'brand' : role === 'supplier' ? 'packaging' : ''} onSelect={selectRole} notes={roleNotes}/>
    {role && <section className="pa-results" aria-label={isBrand ? '패키징 제작 파트너' : '브랜드 제작 공고'}>
      <header><div><h2>{isBrand ? '제작 파트너' : '브랜드 의뢰'}</h2>
        <span aria-live="polite">{isBrand ? suppliers.length + '곳' : briefs.length + '건'}</span></div>
        {isBrand && <select aria-label="제작 품목 필터" value={item} onChange={e => save({...pick,item:e.target.value})}>
          <option value="">전체 품목</option>
          {MATCH_CATEGORIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>}
      </header>
      {isBrand ? suppliers.length ? <div className="pa-list">{suppliers.map(partner =>
        <button key={partner.alias} type="button" className="pa-result" onClick={() => navigate('signup')}>
          <span className="pa-result-icon"><Package size={23} aria-hidden="true"/></span>
          <span className="pa-result-copy"><small>{partner.alias} · 패키징 제작{partner.example === true && <span className="pa-example">예시 업체</span>}</small><strong>{partner.title || partner.alias}</strong>
            {partner.description && <span>{partner.description}</span>}</span>
          <span className="pa-result-action">회원가입</span>
        </button>)}</div> : <div className="pa-empty"><p>{item ? '이 품목으로 등록된 제작 파트너가 아직 없어요.' : '등록된 제작 파트너가 아직 없어요.'}</p>
          {item && <button type="button" className="button outline" onClick={() => save({...pick,item:''})}>전체 보기</button>}</div>
        : briefs.length ? <div className="pa-list">{briefs.map(post =>
          <button type="button" key={post.id} data-brief={post.id} className="pa-result" onClick={() => navigate('feed/'+post.id)}>
            <span className="pa-result-icon"><Storefront size={23} aria-hidden="true"/></span>
            <span className="pa-result-copy"><small>{post.brandAlias || '브랜드'} · 패키징 제작{post.example === true && <span className="pa-example">예시 의뢰</span>}</small><strong>{post.title}</strong>
              <span>{number.format(post.quantity)}개 · 희망 {number.format(post.unitPrice)}원/개</span></span>
            <span className="pa-result-action">의뢰 보기</span>
          </button>)}</div> : <div className="pa-empty"><p>현재 모집 중인 패키징 제작 공고가 없습니다.</p></div>}
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
    <div className="member-card"><span className="member-tag">{kinds[session.user.kind]?.[0] || '운영팀'}</span>
      <h2 className="pa-section-title">{session.user.name}</h2>{session.user.email && <p className="member-hint">{session.user.email}</p>}
      <div className="pa-account-actions"><Button onClick={()=>onNavigate('contracts')}>계약함으로 이동</Button>
        {!session.demo && session.user.kind !== 'admin' && onMembers && <Button tone="outline" onClick={onMembers}>회원 정보·발주 확인</Button>}
        <Button tone="ghost" onClick={async()=>{try{await onExit();}catch(e){setAccountError(e.message);}}}>로그아웃</Button>
      </div>{accountError && <p className="member-error" role="alert">{accountError}</p>}
    </div></section>;
  const accountMode = ['signup','find-id','recover-password','reset-password'].includes(mode) ? mode : 'login';
  return <CustomerAccount mode={accountMode} session={session} SignupNotice={DesignerSignupNotice} onNavigate={onNavigate} onAuth={onAuth}/>;
}
