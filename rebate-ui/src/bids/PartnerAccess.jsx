import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Factory, Gift, Package, PenNib, Stack, Storefront } from '@phosphor-icons/react';
import { Button } from '../BrandControls';
import ReviewConfirm from '../ReviewConfirm';
import { MATCH_CAPACITIES, MATCH_CATEGORIES, previewCandidates } from '../matching-preview.js';
import '../member-portal.css';
import '../matching-flow.css';
import './access.css';

const kinds = {
  brand: ['브랜드', Storefront, '제품에 맞는 파트너를 찾아요.'],
  design: ['개인 디자이너', PenNib, '디자인 공고에 제안해요.'],
  packaging: ['패키징 제작', Package, '패키징 제작 공고에 제안해요.'],
  both: ['디자인·패키징', Stack, '두 분야의 공고에 제안해요.']
};
const areas = { design: '디자인', packaging: '패키징 제작' };
const previewItems = [...MATCH_CATEGORIES, {value:'design', label:'디자인', detail:'그래픽·라벨·패키지 디자인'}];
const itemIcons = {box:Package, packaging:Gift, supplies:Stack, design:PenNib};
const pickKey = 'factner:bid-access-pick';
const historyKey = 'bidAccessPick';
const number = new Intl.NumberFormat('ko-KR');

function cleanPick(value = {}) {
  return {
    role: ['brand', 'supplier'].includes(value?.role) ? value.role : '',
    category: Object.hasOwn(areas, value?.category) ? value.category : '',
    item: previewItems.some(item => item.value === value?.item) ? value.item : '',
    capacity: MATCH_CAPACITIES.some(item => item.value === value?.capacity) ? value.capacity : '',
    kind: Object.hasOwn(kinds, value?.kind) ? value.kind : '',
    results: value?.results === true,
    step: [1, 2].includes(value?.step) ? value.step : 0,
    candidate: typeof value?.candidate === 'string' && /^[A-D](업체|브랜드)$/.test(value.candidate) ? value.candidate : '',
    postId: typeof value?.postId === 'string' && /^[\w-]{1,100}$/.test(value.postId) ? value.postId : ''
  };
}
function readPick() {
  if (history.state?.[historyKey]) return cleanPick(history.state[historyKey]);
  try { return cleanPick(JSON.parse(sessionStorage.getItem(pickKey))); } catch { return cleanPick(); }
}
function samples(role, item) {
  if (item !== 'design') {
    return previewCandidates(role, item).map(item => ({
      label: item.label.split(' · ')[0], title: item.title, detail: item.quantity + ' · ' + item.schedule
    }));
  }
  return (role === 'brand' ? [
    ['A업체', '제품 라벨 디자인', '인쇄용 원본과 색상 시안을 준비해요.'],
    ['B업체', '패키징 그래픽 디자인', '단상자 칼선에 맞춘 지기 디자인을 제안해요.']
  ] : [
    ['A브랜드', '신제품 패키지 디자인', '단상자 그래픽과 라벨 디자인이 필요해요.'],
    ['B브랜드', '기존 라벨 디자인 변경', '인쇄용 규격과 디자인 시안이 필요해요.']
  ]).map(([label, title, detail]) => ({ label, title, detail }));
}
function Choice({ icon: Icon, name, note, onClick }) {
  return <button type="button" className="member-choice" onClick={onClick}>
    <span className="member-symbol"><Icon size={30}/></span><span><strong>{name}</strong><small>{note}</small></span><ArrowRight size={22}/>
  </button>;
}
function Filter({ group, value, checked, icon: Icon, name, note, onChange }) {
  return <label className={'match-choice ' + (group === 'role' ? 'match-role ' : 'match-category ') + (checked ? 'is-selected' : '')}>
    <input type="radio" name={group} value={value} checked={checked} onChange={onChange} required/>
    {group === 'role' ? <span className="match-symbol"><Icon size={28}/></span> : <Icon size={28}/>}<strong>{name}</strong><span>{note}</span>
    <span className="match-check"><Check size={17} weight="bold"/></span>
  </label>;
}
function Preview({ pick, save, go, posts }) {
  const { role, category, item, capacity, results } = pick;
  const itemLabel = previewItems.find(choice => choice.value === item)?.label;
  const capacityLabel = MATCH_CAPACITIES.find(choice => choice.value === capacity)?.label;
  const isBrand = role === 'brand';
  const startSignup = (candidate = '', postId = '') => go(postId ? 'signup/' + postId : 'signup', {
    ...pick, candidate, postId, step: 2, kind: isBrand ? 'brand' : category
  });
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const openPosts = posts.filter(post => post.category === category && post.status === 'open' && post.deadline >= today).slice(0, 3);
  const showResults = results && role && item && category;
  return <section className="match-shell pa-preview">
    <div className="match-topline"><span>파트너 맛보기</span><span>{showResults ? '2 / 2' : '1 / 2'}</span></div>
    <header className="match-heading"><h1>{showResults ? '우리 조건에 맞는 파트너' : '어떤 파트너를 찾으세요?'}</h1>
      <p>{showResults ? '익명 예시를 고르면 선택한 조건으로 바로 가입할 수 있어요.' : '활동과 분야를 고르면 가입 전에 익명 파트너 예시를 볼 수 있어요.'}</p></header>
    {showResults ? <>
      <button type="button" className="match-back" onClick={() => save({ ...pick, results: false }, true)}><ArrowLeft/>조건 다시 선택 <span>{isBrand ? '브랜드' : '공급자'} · {itemLabel}</span></button>
      {!isBrand && category === 'packaging' && <div className="match-filter-summary"><span>월 제작 가능 수량 · {capacityLabel}</span></div>}
      <h2 className="pa-section-title">익명 파트너 예시</h2>
      <div className="match-results">{samples(role, item).map(example =>
        <button key={example.label} type="button" className="match-candidate is-preview pa-example" onClick={() => startSignup(example.label)}>
          <span className="match-symbol">{isBrand ? <Factory size={28}/> : <Storefront size={28}/>}</span>
          <span className="match-candidate-description"><strong>{example.label} · 미리보기 예시</strong>
            <span className="match-candidate-title">{example.title}</span><small>{example.detail}</small></span>
          <span className="match-select-label">선택하고 가입 <ArrowRight size={18}/></span>
        </button>)}</div>
      {!isBrand && openPosts.length > 0 && <section className="pa-posts"><h2>{areas[category]} 분야의 공개 공고</h2>
        {category === 'packaging' && <p className="member-hint">패키징 전체 분야의 공고예요. 품목과 수량은 각 공고에서 확인해주세요.</p>}
        {openPosts.map(post => <button type="button" key={post.id} onClick={() => startSignup('', post.id)}>
          <span><strong>{post.title}</strong><small>{number.format(post.quantity)}개 · 희망 {number.format(post.unitPrice)}원/개</small></span><ArrowRight size={19}/>
        </button>)}</section>}
      <div className="match-result-bottom"><p>견적 제안과 공고 등록은 가입 후 진행해요.</p><Button onClick={() => startSignup()}>이 조건으로 바로 회원가입 <ArrowRight size={19}/></Button></div>
    </> : <form className="match-form" onSubmit={e => { e.preventDefault(); if (role && item) save({ ...pick, results: true }, true); }}>
      <fieldset><legend>어느 쪽이신가요?</legend><div className="match-role-grid">
        <Filter group="role" value="brand" checked={isBrand} icon={Storefront} name="브랜드" note="디자인이나 제작 업체를 찾아요." onChange={() => save({ ...pick, role: 'brand', capacity:'', kind: '', candidate: '', postId: '' })}/>
        <Filter group="role" value="supplier" checked={role === 'supplier'} icon={Factory} name="공급자" note="디자인·제작 의뢰를 찾아요." onChange={() => save({ ...pick, role: 'supplier', capacity:category === 'packaging' ? '30000' : '', kind: '', candidate: '', postId: '' })}/>
      </div></fieldset>
      {role && <fieldset><legend>어떤 품목인가요?</legend><div className="match-category-grid">
        {previewItems.map(choice => <Filter key={choice.value} group="category" value={choice.value} checked={item === choice.value}
          icon={itemIcons[choice.value]} name={choice.label} note={choice.detail}
          onChange={() => save({ ...pick, item:choice.value, category:choice.value === 'design' ? 'design' : 'packaging',
            capacity:!isBrand && choice.value !== 'design' ? capacity || '30000' : '', kind: '', candidate: '', postId: '' })}/>)}</div></fieldset>}
      {!isBrand && role && category === 'packaging' && <fieldset className="match-capacity"><label className="match-field">월 제작 가능 수량
        <select value={capacity || '30000'} onChange={e => save({...pick,capacity:e.target.value})}>{MATCH_CAPACITIES.map(choice =>
          <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label></fieldset>}
      <div className="match-form-bottom"><p>이미 가입하셨다면 로그인해주세요.</p><div className="match-actions">
        <Button tone="outline" onClick={() => go('login')}>로그인</Button><Button type="submit" disabled={!role || !item}>파트너 미리보기 <ArrowRight size={19}/></Button>
      </div></div>
    </form>}
  </section>;
}

export default function PartnerAccess({ mode, session, posts = [], sourcePost, onNavigate, onAuth, onExit, ops = false }) {
  const [pick, setPick] = useState(readPick);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [demoKind, setDemoKind] = useState(Object.hasOwn(kinds,session.user?.kind) ? session.user.kind : 'brand');
  const [demoEmail, setDemoEmail] = useState('');
  const selectedPost = (sourcePost?.id === pick.postId ? sourcePost : null) || posts.find(post => post.id === pick.postId);
  function save(value, push = false) {
    const next = cleanPick(value);
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
  useEffect(() => { setError(''); setPending(null); }, [mode]);
  useEffect(() => {
    if (mode === 'signup' && sourcePost?.id && Object.hasOwn(areas,sourcePost.category)) {
      const stored = readPick();
      if (stored.postId !== sourcePost.id || stored.role !== 'supplier' || ![sourcePost.category,'both'].includes(stored.kind)) {
        save({ role: 'supplier', kind: sourcePost.category, category: sourcePost.category, item:sourcePost.category === 'design' ? 'design' : '', postId: sourcePost.id, step: 2 });
      }
    }
  }, [mode, sourcePost?.id, sourcePost?.category]);
  const context = { role: pick.role, category: pick.category, item:pick.item, capacity:pick.capacity, postId: pick.postId, candidate: pick.candidate };
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
  if (mode === 'preview') return <Preview pick={pick} save={save} go={go} posts={posts}/>;
  const signup = mode === 'signup';
  const demo = mode === 'demo';
  const account = mode === 'account' && session.user;
  const step = pick.step === 2 && pick.kind ? 2 : pick.step >= 1 && pick.role ? 1 : 0;
  const accounts = (session.accounts || []).filter(a => a.kind === demoKind);
  const selectedAccount = accounts.find(a => a.email === demoEmail) || accounts[0];
  const itemLabel = previewItems.find(item => item.value === pick.item)?.label;
  const capacityLabel = MATCH_CAPACITIES.find(item => item.value === pick.capacity)?.label;
  const areaChoices = selectedPost ? [selectedPost.category, 'both'] : pick.role === 'brand' ? ['design','packaging'] : ['design','packaging','both'];
  const title = account ? '내 계정' : demo ? '체험할 계정을 선택하세요' :
    signup ? ['어떤 일을 하고 계신가요?', '활동 분야를 선택해주세요', '조금만 알려주세요'][step] : '다시 만나 반가워요';
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
        <div className="pa-demo-kinds">{Object.entries(kinds).map(([key,[label,Icon]]) =>
          <button key={key} type="button" aria-pressed={demoKind === key} onClick={() => {setDemoKind(key);setDemoEmail('');}}>
            <Icon size={20}/>{label}</button>)}</div>
        <label className="member-field"><span>체험 계정</span><select value={selectedAccount?.email || ''} onChange={e => setDemoEmail(e.target.value)}>
          {accounts.map(a => <option key={a.email} value={a.email}>{a.name} · {a.email}</option>)}</select></label>
        <div className="pa-account-actions"><Button className="member-full" disabled={!selectedAccount || busy} onClick={() => act(() => onAuth('/demo', { email:selectedAccount.email }, context))}>이 계정으로 시작 <ArrowRight size={18}/></Button>
          {ops && session.demo && <Button tone="outline" disabled={busy} onClick={() => act(() => onAuth('/demo', { role:'admin' }, context))}>운영팀으로 입장</Button>}
        </div></> : signup ? <>
        <div className="member-steps" aria-label={`회원가입 ${step + 1}단계`}>{['활동 선택','활동 분야','정보 입력'].map((s,i) => <span className={i === step ? 'current' : ''} key={s}>{i+1}. {s}</span>)}</div>
        {(itemLabel || pick.candidate || selectedPost) && <div className="member-pilot">
          <strong>{selectedPost ? '선택한 공고 · ' + selectedPost.title : pick.candidate ? '선택한 익명 예시 · ' + pick.candidate : '맛보기에서 선택한 조건'}</strong>
          <p>{itemLabel ? '선택 품목 · ' + itemLabel : '공고 분야 · ' + areas[pick.category]}
            {pick.role === 'supplier' && pick.category === 'packaging' && capacityLabel ? ' / 월 제작 가능 수량 · ' + capacityLabel : ''}</p>
        </div>}
        {step === 0 ? <div className="member-choice-list">
          {!selectedPost && <Choice icon={Storefront} name="브랜드" note="우리 제품에 맞는 파트너를 찾아요." onClick={() => save({...(pick.role === 'brand' ? pick : {}),role:'brand',step:1},true)}/>}
          <Choice icon={Factory} name="공급자" note="브랜드 공고에 견적을 제안해요." onClick={() => save({...(pick.role === 'supplier' ? pick : {}),role:'supplier',step:1},true)}/>
        </div> : step === 1 ? <div className="member-choice-list">
          {areaChoices.map(key => <Choice key={key} icon={kinds[key][1]}
            name={pick.role === 'brand' ? areas[key] : kinds[key][0]} note={pick.role === 'brand' ? '이 분야의 파트너를 찾아요.' : kinds[key][2]}
            onClick={() => save({...pick, ...(key !== 'both' && pick.category !== key ? {item:'',capacity:'',candidate:'',postId:''} : {}),
              category:Object.hasOwn(areas,key) ? key : pick.category, kind:pick.role === 'brand' ? 'brand' : key, step:2},true)}/>)}
        </div> : <form key="signup" className="member-form" onSubmit={e => { e.preventDefault();setError('');const d=Object.fromEntries(new FormData(e.currentTarget));setPending({kind:pick.kind,name:d.name,email:d.email,password:d.password}); }}>
          <fieldset disabled={busy}><span className="member-tag">{kinds[pick.kind][0]}{pick.kind === 'brand' && pick.category ? ' · ' + areas[pick.category] : ''}</span>
            <label className="member-field"><span>{pick.kind === 'brand' ? '브랜드명' : '업체명 / 활동명'}</span><input name="name" required maxLength={60} autoComplete="off" placeholder="가상 이름을 입력해주세요"/></label>
            <label className="member-field"><span>이메일</span><input name="email" type="email" required maxLength={254} autoComplete="off" placeholder="brand@example.test"/></label>
            <label className="member-field"><span>비밀번호 · 8자 이상</span><input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password"/></label>
            <label className="member-check"><input type="checkbox" required/>가상 정보와 체험 전용 비밀번호를 사용합니다.</label>
            <Button type="submit" className="member-full">가입 내용 확인 <ArrowRight size={18}/></Button>
          </fieldset></form>}
        {step > 0 && <button type="button" className="member-back" onClick={() => save({...pick,step:step-1},true)}><ArrowLeft size={18}/>이전 단계</button>}
      </> : <form key="login" className="member-form" onSubmit={e => {e.preventDefault(); const d=new FormData(e.currentTarget); act(() => onAuth('/login',{email:d.get('email'),password:d.get('password')},context));}}>
        <fieldset disabled={busy}><label className="member-field"><span>이메일</span><input name="email" type="email" autoComplete="username" maxLength={254} required/></label>
          <label className="member-field"><span>비밀번호</span><input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required/></label>
          <Button type="submit" className="member-full">로그인 <ArrowRight size={18}/></Button>
          <div className="member-recovery-links"><button type="button" onClick={() => go('preview')}>파트너 맛보기</button>
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
        {itemLabel && <div><dt>선택 품목</dt><dd>{itemLabel}{capacityLabel ? ' · 월 ' + capacityLabel : ''}</dd></div>}</dl>}
    </ReviewConfirm>
  </section>;
}
