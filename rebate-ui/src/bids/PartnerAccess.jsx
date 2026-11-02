import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle, Package, PenNib, Stack, Storefront } from '@phosphor-icons/react';
import { Button } from '../BrandControls';
import ReviewConfirm from '../ReviewConfirm';
import { MATCH_CATEGORIES } from '../matching-preview.js';
import { isPackagingPartner } from '../../../shared/partner-roles.js';
import '../member-portal.css';
import '../matching-flow.css';
import './access.css';

const kinds = {
  brand: ['브랜드', Storefront, '포장을 맡길 제작 파트너를 찾아요.'],
  packaging: ['패키징 제작업체', Package, '제작할 수 있는 브랜드 공고를 찾아요.'],
  design: ['디자이너', PenNib, '패키지·라벨 디자인'],
  both: ['디자인·패키징', Stack, '현재는 패키징 제작 공고에 제안할 수 있어요.']
};
const areas = { design: '디자인', packaging: '패키징 제작' };
const pickKey = 'factner:bid-access-pick';
const historyKey = 'bidAccessPick';
const number = new Intl.NumberFormat('ko-KR');
function cleanPick(value = {}) {
  return {
    role: ['brand','supplier'].includes(value?.role) ? value.role : '',
    category: Object.hasOwn(areas, value?.category) ? value.category : '',
    item: MATCH_CATEGORIES.some(item => item.value === value?.item) ? value.item : '',
    kind: ['brand','packaging'].includes(value?.kind) ? value.kind : '',
    step: value?.step === 2 ? 2 : 0,
    candidate: typeof value?.candidate === 'string' && /^[A-Z]업체$/.test(value.candidate) ? value.candidate : '',
    postId: typeof value?.postId === 'string' && /^[\w-]{1,64}$/.test(value.postId) ? value.postId : ''
  };
}
function readPick() {
  if (history.state?.[historyKey]) return cleanPick(history.state[historyKey]);
  if (!location.hash || location.hash === '#feed') return cleanPick({role:history.state?.discoveryRole === 'supplier' ? 'supplier' : ''});
  try { return cleanPick(JSON.parse(sessionStorage.getItem(pickKey))); } catch { return cleanPick(); }
}
function RoleCards({ selected, onSelect, compact = false, notes = {} }) {
  return <div className={'pa-role-grid' + (compact ? ' pa-compact' : '')} role="group" aria-label="회원 역할">
    {['brand','packaging','design'].map(key => {
      const [label, Icon, note] = kinds[key], locked = key === 'design';
      return <button key={key} type="button" className="pa-role-card" aria-pressed={selected === key} disabled={locked}
        onClick={() => onSelect(key)}>
        <span className="pa-role-icon"><Icon size={compact ? 20 : 26} aria-hidden="true"/></span>
        <span className="pa-role-copy"><strong>{label}</strong>{!compact && <small>{notes[key] || note}</small>}</span>
        {locked ? <span className="pa-soon">오픈 준비 중</span> : !compact && (selected === key ? <CheckCircle weight="fill" aria-hidden="true"/> : <ArrowRight aria-hidden="true"/>)}
      </button>;
    })}
  </div>;
}
function Discovery({ pick, save, go, partners, posts }) {
  const {role, item} = pick;
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
  const allSuppliers = (partners || []).filter(partner => /^[A-Z]업체$/.test(partner.alias) && isPackagingPartner(partner.kind));
  const suppliers = item ? allSuppliers.filter(partner => partner.items?.includes(item)) : allSuppliers;
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10);
  const briefs = (posts || []).filter(post => post.category === 'packaging' && post.status === 'open' && post.deadline >= today);
  const roleNotes = {
    brand: Array.isArray(partners) ? `제작 파트너 ${allSuppliers.length}곳 보기` : '',
    packaging: Array.isArray(posts) ? `브랜드 제작 의뢰 ${briefs.length}건 보기` : ''
  };
  function selectRole(key) {
    const next = key === 'brand' ? 'brand' : 'supplier';
    if (role !== next) save({role:next},true);
    if (window.matchMedia('(max-width:640px)').matches) requestAnimationFrame(() => {
      const results = section.current?.querySelector('.pa-results');
      if (results && results.getBoundingClientRect().top > window.innerHeight * .6) {
        results.scrollIntoView({behavior:'instant',block:'start'});
      }
    });
  }
  return <section ref={section} className="match-shell pa-discovery">
    <header className="pa-heading"><span className="member-eyebrow">파트너 찾기</span><h1>바로 시작해볼까요?</h1>
      <p>가입 전에 제작 파트너와 브랜드의 의뢰 수량·희망 단가를 확인하세요.</p></header>
    <RoleCards selected={isBrand ? 'brand' : role === 'supplier' ? 'packaging' : ''} onSelect={selectRole} notes={roleNotes}/>
    {role && <section className="pa-results" aria-label={isBrand ? '패키징 제작 파트너' : '브랜드 제작 공고'}>
      <header><h2>{isBrand ? '패키징 제작 파트너' : '브랜드 제작 공고'}</h2>
        <span aria-live="polite">{isBrand ? suppliers.length + '곳' : briefs.length + '건'}</span></header>
      {isBrand && <div className="pa-filters" role="group" aria-label="제작 품목 필터">
        {[{value:'', label:'전체'},...MATCH_CATEGORIES].map(option => <button type="button" key={option.value}
          aria-pressed={item === option.value} onClick={() => save({...pick,item:option.value,candidate:''})}>{option.label}</button>)}
        <button type="button" disabled>디자인 · 준비 중</button>
      </div>}
      {isBrand ? suppliers.length ? <div className="pa-list">{suppliers.map(partner =>
        <button key={partner.alias} type="button" className="pa-result" onClick={() => go('signup',
          {...pick,kind:'brand',category:'packaging',candidate:partner.alias,step:2})}>
          <span className="pa-result-icon"><Package size={23} aria-hidden="true"/></span>
          <span className="pa-result-copy"><small>{partner.alias} · 패키징 제작</small><strong>{partner.title || partner.alias}</strong>
            {partner.description && <span>{partner.description}</span>}</span>
          <span className="pa-result-action">선택하고 가입 <ArrowRight size={17}/></span>
        </button>)}</div> : <div className="pa-empty"><p>{item ? '이 품목으로 등록된 제작 파트너가 아직 없어요.' : '등록된 제작 파트너가 아직 없어요.'}</p>
          {item && <button type="button" className="button outline" onClick={() => save({...pick,item:''})}>전체 보기</button>}</div>
        : briefs.length ? <div className="pa-list">{briefs.map(post =>
          <button type="button" key={post.id} data-brief={post.id} className="pa-result" onClick={() => go('feed/'+post.id,
            {...pick,role:'supplier',kind:'packaging',category:'packaging',postId:post.id,step:2})}>
            <span className="pa-result-icon"><Storefront size={23} aria-hidden="true"/></span>
            <span className="pa-result-copy"><small>{post.brandAlias || '브랜드'} · 패키징 제작</small><strong>{post.title}</strong>
              <span>{number.format(post.quantity)}개 · 희망 {number.format(post.unitPrice)}원/개</span></span>
            <span className="pa-result-action">공고 보기 <ArrowRight size={17}/></span>
          </button>)}</div> : <div className="pa-empty"><p>현재 모집 중인 패키징 제작 공고가 없습니다.</p></div>}
    </section>}
  </section>;
}

export default function PartnerAccess({ mode, session, posts, partners, sourcePost, onNavigate, onAuth, onExit, ops = false }) {
  const [pick, setPick] = useState(readPick);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [demoKind, setDemoKind] = useState(isPackagingPartner(session.user?.kind) ? 'packaging' : 'brand');
  const [demoEmail, setDemoEmail] = useState('');
  const selectedPost = (sourcePost?.id === pick.postId ? sourcePost : null) || posts?.find(post => post.id === pick.postId);
  const sourceLocked = sourcePost?.category === 'design';
  function save(value, push = false) {
    const next = cleanPick(value);
    if (push && !history.state?.[historyKey]) history.replaceState({...history.state,[historyKey]:pick},'');
    setPick(next);
    try { sessionStorage.setItem(pickKey, JSON.stringify(next)); } catch { /* History keeps the current tab's non-sensitive choices. */ }
    history[push ? 'pushState' : 'replaceState']({ ...history.state, [historyKey]: next }, '');
  }
  function go(target, next = pick) {
    onNavigate(target);
    save(next);
  }
  useEffect(() => {
    const restore = () => { setPick(readPick()); setPending(null); setError(''); };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useLayoutEffect(() => { setPick(readPick()); setError(''); setPending(null); }, [mode]);
  useEffect(() => {
    if (['login','signup'].includes(mode) && sourcePost?.id && sourcePost.category === 'packaging') {
      const stored = readPick();
      if (stored.postId !== sourcePost.id || stored.role !== 'supplier' || stored.kind !== 'packaging') {
        save({ role:'supplier',kind:'packaging',category:'packaging',postId:sourcePost.id,step:2 });
      }
    }
  }, [mode, sourcePost?.id, sourcePost?.category]);
  const context = {role:pick.role,category:pick.category,item:pick.item,postId:pick.postId,candidate:pick.candidate};
  async function act(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await action();
      setPending(null);
      try { sessionStorage.removeItem(pickKey); } catch { /* Form choices are optional storage. */ }
    }
    catch (e) { setError(e.message || '처리하지 못했어요. 입력 내용을 확인해주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (mode === 'discovery') return <Discovery pick={pick} save={save} go={go} posts={posts} partners={partners}/>;
  const signup = mode === 'signup';
  const demo = mode === 'demo';
  const account = mode === 'account' && session.user;
  const infoStep = pick.step === 2 && Boolean(pick.kind);
  const loginRole = pick.role === 'supplier' ? 'packaging' : pick.role;
  const accounts = (session.accounts || []).filter(a => demoKind === 'brand' ? a.kind === 'brand' : isPackagingPartner(a.kind));
  const selectedAccount = accounts.find(a => a.email === demoEmail) || accounts[0];
  const itemLabel = MATCH_CATEGORIES.find(item => item.value === pick.item)?.label;
  const title = account ? '내 계정' : demo ? '체험할 계정을 선택하세요' :
    signup ? infoStep ? '조금만 알려주세요' : '어떤 일을 하고 계신가요?' : '다시 만나 반가워요';
  function chooseAccountRole(key, signUp = false) {
    const role = key === 'brand' ? 'brand' : 'supplier';
    save({...((pick.role === role) ? pick : {}),role,category:'packaging',kind:key,step:signUp ? 2 : pick.step},signUp);
    setError('');
  }
  return <section className="member-auth pa-access">
    <header className="member-auth-heading"><span className="member-eyebrow">FACTNER ACCOUNT</span><h1>{title}</h1>
      <p>{account ? '이 탭에서 사용 중인 계정을 확인해요.' : demo ? '다른 탭에서 역할을 바꿔 같은 공고를 체험해보세요.' :
        signup ? '가입하고 공고 등록과 견적 제안을 시작하세요.' : '패키징부터 다음 발주까지, 한곳에서.'}</p></header>
    <div className="member-card">
      {!account && <div className="member-tabs" role="tablist" aria-label="계정">
        {Object.entries({login:'로그인', signup:'회원가입'}).map(([route,label]) =>
          <button type="button" role="tab" key={route} aria-selected={(mode === 'account' ? 'login' : mode) === route} onClick={() => go(route)} disabled={busy}>{label}</button>)}</div>}
      {account ? <>
        <span className="member-tag">{kinds[session.user.kind]?.[0] || '운영팀'}</span>
        <h2 className="pa-section-title">{session.user.name}</h2>{session.user.email && <p className="member-hint">{session.user.email}</p>}
        <div className="pa-account-actions">
          <Button onClick={() => onNavigate('contracts')}>계약함으로 이동</Button>
          {session.demo && <Button tone="outline" onClick={() => go('demo')}>다른 체험 계정으로 전환</Button>}
          <Button tone="ghost" disabled={busy} onClick={() => act(onExit)}>로그아웃</Button>
        </div></> : demo ? <>
        <RoleCards compact selected={demoKind} onSelect={key => {setDemoKind(key);setDemoEmail('');}}/>
        <label className="member-field"><span>체험 계정</span><select value={selectedAccount?.email || ''} onChange={e => setDemoEmail(e.target.value)}>
          {accounts.map(a => <option key={a.email} value={a.email}>{a.name} · {a.email}</option>)}</select></label>
        {selectedAccount && <p className="member-hint">체험 이메일 · {selectedAccount.email}<br/>공통 데모 비밀번호 · <code>Factner-Demo-2026!</code></p>}
        <div className="pa-account-actions"><Button className="member-full" disabled={!selectedAccount || busy} onClick={() => act(() => onAuth('/demo', { email:selectedAccount.email }, context))}>이 계정으로 시작 <ArrowRight size={18}/></Button>
          {ops && session.demo && <Button tone="outline" disabled={busy} onClick={() => act(() => onAuth('/demo', { role:'admin' }, context))}>운영팀으로 입장</Button>}
        </div></> : signup ? <>
        <div className="member-steps" aria-label={`회원가입 ${infoStep ? 2 : 1}단계`}>
          <span className={!infoStep ? 'current' : ''}>1. 활동 선택</span><span className={infoStep ? 'current' : ''}>2. 정보 입력</span>
        </div>
        {(pick.candidate || selectedPost) && <div className="member-pilot">
          <strong>{selectedPost ? '선택한 공고 · '+selectedPost.title : '선택한 제작 파트너 · '+pick.candidate}</strong>
          <p>{itemLabel ? '선택 품목 · '+itemLabel : '분야 · 패키징 제작'}</p>
        </div>}
        {sourceLocked ? <div className="pa-empty"><p>디자인 공고의 가입과 제안은 오픈 준비 중입니다.</p>
          <Button tone="outline" onClick={() => onNavigate('feed')}>파트너 찾기</Button>
        </div> : !infoStep ? <RoleCards compact selected={loginRole} onSelect={key => chooseAccountRole(key,true)}/> : <form key="signup" className="member-form" onSubmit={e => { e.preventDefault();setError('');const d=Object.fromEntries(new FormData(e.currentTarget));setPending({kind:pick.kind,name:d.name,email:d.email,password:d.password}); }}>
          <fieldset disabled={busy}><span className="member-tag">{kinds[pick.kind][0]}{pick.kind === 'brand' && pick.category ? ' · ' + areas[pick.category] : ''}</span>
            <label className="member-field"><span>{pick.kind === 'brand' ? '브랜드명' : '업체명 / 활동명'}</span><input name="name" required maxLength={60} autoComplete="off" placeholder="가상 이름을 입력해주세요"/></label>
            <label className="member-field"><span>이메일</span><input name="email" type="email" required maxLength={254} autoComplete="off" placeholder="brand@example.test"/></label>
            <label className="member-field"><span>비밀번호 · 8자 이상</span><input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password"/></label>
            <label className="member-check"><input type="checkbox" required/>가상 정보와 체험 전용 비밀번호를 사용합니다.</label>
            <Button type="submit" className="member-full">가입 내용 확인 <ArrowRight size={18}/></Button>
          </fieldset></form>}
        {infoStep && !sourceLocked && <button type="button" className="member-back" onClick={() => selectedPost ? onNavigate('feed/'+selectedPost.id) : save({...pick,step:0},true)}>{selectedPost ? '공고 다시 보기' : '활동 다시 선택'}</button>}
      </> : <form key="login" className="member-form" onSubmit={e => {
        e.preventDefault();
        if(!loginRole){setError('로그인할 역할을 선택해주세요.');return;}
        const d=new FormData(e.currentTarget);
        act(() => onAuth('/login',{email:d.get('email'),password:d.get('password'),role:loginRole},context));
      }}>
        <fieldset disabled={busy}><RoleCards compact selected={loginRole} onSelect={chooseAccountRole}/>
          <label className="member-field"><span>이메일</span><input name="email" type="email" autoComplete="username" maxLength={254} required/></label>
          <label className="member-field"><span>비밀번호</span><input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required/></label>
          <Button type="submit" className="member-full" disabled={!loginRole || busy}>로그인 <ArrowRight size={18}/></Button>
          <div className="member-recovery-links"><button type="button" onClick={() => onNavigate('feed')}>파트너 찾기</button>
            {session.hosted && <a href="/members/#account">기존 회원 로그인·계정 찾기</a>}</div>
        </fieldset></form>}
      {error && !pending && <p className="member-error" role="alert">{error}</p>}
      {!demo && !account && session.demo && <div className="member-recovery-links"><button type="button" onClick={() => go('demo')}>계정 체험</button></div>}
      {session.hosted && <p className="member-hint pa-limit">이 브라우저에서만 쓰는 체험 계정이에요. 실제 연락처나 거래 자료는 입력하지 마세요.</p>}
    </div>
    <ReviewConfirm open={Boolean(pending) && signup} onCancel={() => {setPending(null);setError('');}} title="가입 신청 정보를 확인해주세요"
      busy={busy} error={error} confirmLabel="확인하고 회원가입" onConfirm={() => act(() => onAuth('/register',pending,context))}>
      {pending && <dl><div><dt>활동</dt><dd>{kinds[pending.kind][0]}</dd></div><div><dt>이름</dt><dd>{pending.name}</dd></div>
        <div><dt>이메일</dt><dd>{pending.email}</dd></div>{(pick.candidate || selectedPost) && <div><dt>선택한 대상</dt><dd>{selectedPost?.title || pick.candidate}</dd></div>}
        {itemLabel && <div><dt>선택 품목</dt><dd>{itemLabel}</dd></div>}</dl>}
    </ReviewConfirm>
  </section>;
}
