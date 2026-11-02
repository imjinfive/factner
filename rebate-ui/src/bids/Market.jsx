import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Bag, Bell, CaretRight, Cube, Gift, ListMagnifyingGlass, MagnifyingGlass, Package, PencilRuler, Plus, Radio, Tag, Tray, X } from '@phosphor-icons/react';
import ReviewConfirm from '../ReviewConfirm';
import './market.css';

const types = { design: '디자인', packaging: '패키징 제작' };
const number = new Intl.NumberFormat('ko-KR');
const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' });
const dayMs = 86400000;

function koreanDay() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function daysLeft(post) {
  return (Date.parse(post.deadline) - Date.parse(koreanDay())) / dayMs;
}

function acceptsProposals(post) {
  return post.category === 'packaging' && post.status === 'open' && daysLeft(post) >= 0;
}

function statusText(post) {
  if (post.status === 'awarded') return '선정 완료';
  const days = daysLeft(post);
  if (post.status !== 'open' || days < 0) return '접수 종료';
  if (post.category === 'design') return '준비 중';
  return days === 0 ? '오늘 마감' : `D−${days}`;
}

function elapsed(iso) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return date.format(new Date(iso));
}

const productIcons = [
  [/라벨|스티커/, Tag],
  [/쇼핑백|봉투|파우치/, Bag],
  [/트레이|받침/, Tray],
  [/슬리브|선물|기프트/, Gift],
  [/상자|박스|골판지|메일러/, Cube]
];

function ProductIcon({ post }) {
  const Icon = post.category === 'design' ? PencilRuler :
    (productIcons.find(([pattern]) => pattern.test(post.title))?.[1] ?? Package);
  return <span className="bm-product-icon" aria-hidden="true"><Icon size={28} weight="duotone" /></span>;
}

const allFilters = { category: 'all', query: '', activeOnly: false };
const packagingFilters = { ...allFilters, category: 'packaging' };
function historyFilters(fallback) {
  const saved = history.state?.bidMarketFilters;
  return saved && (saved.category === 'all' || Object.hasOwn(types, saved.category)) &&
    typeof saved.query === 'string' && typeof saved.activeOnly === 'boolean' ? saved : fallback;
}

function matchesFilters(post, { category, query, activeOnly }) {
  if (category !== 'all' && post.category !== category) return false;
  if (activeOnly && !acceptsProposals(post)) return false;
  const term = query.trim().toLocaleLowerCase('ko');
  return !term || [post.title, post.description, post.size].some(value => value?.toLocaleLowerCase('ko').includes(term));
}

function BoardHeader({ mine, posts, brand, onNew }) {
  const open = posts.filter(acceptsProposals);
  return <header className="bm-cover">
    <div className="bm-cover-main">
      <span className="bm-live"><i/> 실시간 업데이트{!mine && <small>예시 공고 포함</small>}</span>
      <h1>{mine ? (brand ? '내 공고' : '내 제안') : '파트너 찾기'}</h1>
      <p>{mine ? (brand ? '등록한 공고와 파트너가 보낸 제안을 확인하세요.' : '보낸 제안과 파트너 선정 결과를 확인하세요.') : '브랜드의 제작 조건을 확인하고 패키징 견적을 제안하세요.'}</p>
      {brand && <button type="button" className="button primary bm-cover-cta" onClick={onNew}><Plus size={17} /> 공고 등록</button>}
    </div>
    <dl className="bm-stats">
      <div><dt>접수 중</dt><dd>{number.format(open.length)}건</dd></div>
      <div><dt>오늘 마감</dt><dd>{number.format(open.filter(post => daysLeft(post) === 0).length)}건</dd></div>
    </dl>
  </header>;
}

function ReviewRows({ rows }) {
  return <dl className="bm-review-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function NewPost({ mutate, onDone, onCancel, initialCategory, selectedPartner }) {
  const category = 'packaging';
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitLock = useRef(false);
  function preview(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.delete('type');
    const data = Object.fromEntries(form);
    const candidate = { ...data, category, quantity: Number(data.quantity), unitPrice: Number(data.unitPrice) };
    if (!data.title.trim() || !data.description.trim()) { setError('제목과 제작 조건을 입력해 주세요.'); return; }
    if (candidate.quantity * candidate.unitPrice > 1e12) { setError('수량과 단가의 합계는 1조원 이하여야 합니다.'); return; }
    setError('');
    setDraft(candidate);
  }
  async function publish() {
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try { const result = await mutate('/posts', draft); onDone(result.id); }
    catch (err) { setError(err.message?.replaceAll('입찰', '제안') || '등록하지 못했습니다. 다시 시도해 주세요.'); }
    finally { submitLock.current = false; setBusy(false); }
  }
  return <section className="bm-compose"><div className="bm-compose-intro">
    <h1>새 공고 등록</h1>
    <p>패키징 제작업체가 견적을 낼 수 있도록 수량, 규격, 희망 납기를 알려주세요.</p>
    {selectedPartner?.alias && <p className="bm-selected-partner">
      <strong>관심 업체 {selectedPartner.alias}</strong>{selectedPartner.title && selectedPartner.title !== selectedPartner.alias && ` · ${selectedPartner.title}`}. 이 의뢰는 공개되어 다른 제작업체도 제안할 수 있어요.
    </p>}
  </div><form className="bm-form bm-post-form" onSubmit={preview}>
    <fieldset className="bm-fieldset"><legend>발주 분야</legend><div className="bm-type-select">
      <label><input type="radio" name="type" value="packaging" checked readOnly />패키징 제작</label>
      <label><input type="radio" name="type" value="design" disabled />디자인 <small>준비 중</small></label>
    </div>{initialCategory === 'design' && <p className="bm-hint">디자인 의뢰 등록은 준비 중입니다. 현재는 패키징 제작 의뢰를 등록할 수 있어요.</p>}</fieldset>
    <label>공고 제목<input name="title" required maxLength={100} placeholder="예: 화장품 단상자 인쇄·제작" /></label>
    <div className="bm-two"><label>요청 수량 (개)<input name="quantity" type="number" min="1" max="100000000" step="1" required placeholder="5,000" /></label>
      <label>희망 개당 단가 (원)<input name="unitPrice" type="number" min="1" max="1000000000" step="1" required placeholder="450" /></label></div>
    <div className="bm-two"><label>규격 <small>선택</small><input name="size" maxLength={160} placeholder="예: 60 × 35 × 110 mm" /></label>
      <label>제안 마감일<input type="date" name="deadline" required min={koreanDay()} /></label></div>
    <label>제작 조건<textarea name="description" required rows={5} maxLength={2000} placeholder="희망 납기, 재질, 인쇄·후가공 조건 등을 적어주세요." /></label>
    <p className="bm-hint">공개 공고입니다. 업체명, 연락처, 외부 링크는 입력하지 마세요.</p>
    {error && !draft && <p role="alert" className="bm-error">{error}</p>}
    <div className="bm-actions"><button type="button" onClick={onCancel}>취소</button><button type="submit" className="bm-primary">공고 확인 <ArrowRight size={16}/></button></div>
  </form>{draft && <ReviewConfirm open title="이 내용으로 공고를 등록할까요?" busy={busy} error={error} onCancel={() => { setDraft(null); setError(''); }} onConfirm={publish} confirmLabel="공고 등록">
    <ReviewRows rows={[[ '분야', types[draft.category] ], ['제목', draft.title], ['수량 · 단가', `${number.format(draft.quantity)}개 · ${number.format(draft.unitPrice)}원`],
      ['규격', draft.size || '미입력'], ['제안 마감', draft.deadline], ['제작 조건', draft.description]]} />
  </ReviewConfirm>}</section>;
}

function QuoteForm({ post, mutate, onDone }) {
  const [tiers, setTiers] = useState([{ key: 1, quantity: String(post.quantity), unitPrice: '' }]);
  const nextKey = useRef(2);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  function update(key, field, value) {
    setTiers(rows => rows.map(row => row.key === key ? { ...row, [field]: value } : row));
  }
  function preview(event) {
    event.preventDefault();
    const values = tiers.map(row => ({ quantity: Number(row.quantity), unitPrice: Number(row.unitPrice) }));
    if (new Set(values.map(row => row.quantity)).size !== values.length) { setError('각 조건의 수량을 다르게 입력해 주세요.'); return; }
    if (values.some(row => row.quantity * row.unitPrice > 1e12)) { setError('각 조건의 합계는 1조원 이하여야 합니다.'); return; }
    setError('');
    setDraft({ tiers: values, note: note.trim() });
  }
  async function send() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await mutate(`/posts/${encodeURIComponent(post.id)}/offers`, draft); onDone(); }
    catch (err) { setError(err.message?.replaceAll('입찰', '제안') || '제안을 보내지 못했습니다. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="bm-quote-form"><h3>수량별 견적 제안</h3>
    <form className="bm-form" onSubmit={preview}>
      <div className="bm-tier-labels" aria-hidden="true"><span>제작 수량 (개)</span><span>개당 단가 (원)</span></div>
      {tiers.map((row, index) => <div className="bm-tier-input" key={row.key}>
        <input type="number" min="1" max="100000000" step="1" required aria-label={`조건 ${index + 1} 수량 (개)`} value={row.quantity} onChange={e => update(row.key,'quantity',e.target.value)} />
        <input type="number" min="1" max="1000000000" step="1" required aria-label={`조건 ${index + 1} 개당 단가 (원)`} value={row.unitPrice} onChange={e => update(row.key,'unitPrice',e.target.value)} placeholder="단가 입력" />
        <button type="button" aria-label={`조건 ${index + 1} 삭제`} disabled={tiers.length === 1} onClick={() => setTiers(rows => rows.filter(r => r.key !== row.key))}><X size={15} /></button>
      </div>)}
      {tiers.length < 8 && <button className="bm-add" type="button" onClick={() => { const key = nextKey.current++; setTiers(rows => [...rows, {key, quantity: '', unitPrice: ''}]); }}><Plus size={15} />수량 조건 추가</button>}
      <label>견적 메모 <small>선택</small><textarea rows={2} value={note} maxLength={1200} onChange={e => setNote(e.target.value)} placeholder="납기, 후가공, 배송·세금 포함 여부" /></label>
      <p className="bm-hint">업체명과 연락처는 제외해 주세요. 공고마다 한 번 제안할 수 있어요.</p>
      {error && !draft && <p role="alert" className="bm-error">{error}</p>}
      <button type="submit" className="bm-primary">제안 내용 확인 <ArrowRight size={16} /></button>
    </form>
    {draft && <ReviewConfirm open title="이 조건으로 제안을 보낼까요?" busy={busy} error={error} confirmLabel="제안 보내기" onCancel={() => { setDraft(null); setError(''); }} onConfirm={send}>
      <ReviewRows rows={[[ '공고', post.title ], ...draft.tiers.map(t => [`${number.format(t.quantity)}개`, `개당 ${number.format(t.unitPrice)}원 · 총 ${number.format(t.quantity * t.unitPrice)}원`]), ['메모', draft.note || '없음']]} />
    </ReviewConfirm>}
  </div>;
}

function Offer({ offer, post, onSelect, allowSelect }) {
  const [choice, setChoice] = useState(0);
  const tier = offer.tiers[choice];
  const alias = offer.alias;
  return <article className="bm-offer">
    <div className="bm-offer-head"><strong>{offer.isMine ? '내 제안' : alias}</strong><span>수량 조건 {offer.tiers.length}개</span></div>
    <div className="bm-offer-tiers">
      {offer.tiers.map((t, i) => <label key={t.quantity} className={allowSelect && choice === i ? 'chosen' : ''}>
        {allowSelect && <input aria-label={`${alias} ${t.quantity}개 조건 선택`} type="radio" name={`tier-${offer.id}`} checked={choice === i} onChange={() => setChoice(i)} />}
        <span>{number.format(t.quantity)}개</span><span>개당 {number.format(t.unitPrice)}원</span>
        <strong>총 {number.format(t.quantity * t.unitPrice)}원</strong>
      </label>)}
    </div>
    {offer.note && <p className="bm-note">{offer.note}</p>}
    {allowSelect && tier && <button type="button" className="bm-secondary" onClick={() => onSelect(offer, post, tier)}>이 조건으로 업체 선택 <ArrowUpRight size={15} /></button>}
  </article>;
}

function PostDetail({ post, offers, user, mutate, onSelect, onSignup, onSent, standalone = false }) {
  const design = post.category === 'design';
  const open = acceptsProposals(post);
  const ownOffer = offers.find(o => o.isMine);
  const canBid = user?.kind === 'both' || user?.kind === 'packaging';
  const Heading = standalone ? 'h1' : 'h2';
  const Subheading = standalone ? 'h2' : 'h3';
  return <section className="bm-detail" aria-label={standalone ? '브랜드 의뢰 상세' : '선택한 공고 상세'}>
    <div className="bm-detail-head"><span className="bm-kind">{types[post.category]}</span><span className="bm-status">{statusText(post)}</span></div>
    <div className="bm-detail-title"><div><Heading>{post.title}</Heading><span>{standalone ? '브랜드 의뢰' : '공고 상세'}</span></div>
      <ProductIcon post={post} /></div>
    <dl className="bm-specs"><div><dt>요청 수량</dt><dd>{number.format(post.quantity)}개</dd></div><div><dt>희망 단가</dt><dd>{number.format(post.unitPrice)}원<span> / 개</span></dd></div>
      <div><dt>규격</dt><dd>{post.size || '미지정'}</dd></div><div><dt>제안 마감</dt><dd>{post.deadline}</dd></div></dl>
    <div className="bm-detail-copy"><Subheading>제작 조건</Subheading><p>{post.description}</p></div>
    {design && <p className="bm-info">디자인 파트너 참여는 준비 중입니다. 현재는 패키징 제작 의뢰에 제안할 수 있어요.</p>}
    {user && post.isMine ? <section className="bm-offer-section"><h3>받은 제안 <span>{offers.length}</span></h3>
      {offers.length ? offers.map(o => <Offer key={o.id} offer={o} post={post} allowSelect={!design && post.status === 'open'} onSelect={onSelect} />) : <p className="bm-hint">아직 들어온 제안이 없습니다.</p>}
    </section> : ownOffer ? <Offer offer={ownOffer} post={post} /> : design ? null : open && !user ?
      <button className="bm-primary" type="button" onClick={() => onSignup(post)}>가입하고 제안하기 <ArrowRight size={16}/></button> :
      open && canBid ? <QuoteForm post={post} mutate={mutate} onDone={onSent} /> :
      <div className="bm-info">{!open ? '제안 접수가 끝났습니다.' : '이 공고는 패키징 제작업체의 제안을 받고 있어요.'}</div>}
  </section>;
}

function PublicBrief({ state, postId, onDiscoveryBack, onView, onSignup = () => onView('signup/' + postId) }) {
  const post = state?.posts?.find(item => item.id === postId);
  const section = useRef(null);
  useLayoutEffect(() => {
    section.current?.focus({ preventScroll: true });
  }, [postId]);
  return <section className="bm bm-public-brief" ref={section} tabIndex={-1} aria-label="브랜드 의뢰">
    <button type="button" className="bm-back bm-public-back" onClick={() => onDiscoveryBack ? onDiscoveryBack(postId) : onView('feed')}>
      <ArrowLeft size={16} aria-hidden="true"/> 브랜드 의뢰로 돌아가기
    </button>
    {!state ? <p role="status">브랜드 의뢰를 불러오고 있습니다.</p> : post ? <PostDetail post={post} offers={[]} onSignup={onSignup} standalone /> :
      <div className="bm-empty"><ListMagnifyingGlass size={34} aria-hidden="true" weight="light" />
        <h1>의뢰를 찾을 수 없습니다</h1><p>브랜드 의뢰 목록에서 다른 의뢰를 확인해 주세요.</p></div>}
  </section>;
}

export default function Market(props) {
  if (!props.user && props.view === 'feed' && props.postId) return <PublicBrief {...props}/>;
  return <WorkBoard {...props}/>;
}

function WorkBoard({ state, user, view, onView, mutate, onSelect, onLogin, onSignup = onLogin, postId, onChoosePost, initialCategory, selectedPartner }) {
  const defaultFilters = view === 'feed' && (user?.kind === 'packaging' || user?.kind === 'both') ? packagingFilters : allFilters;
  const [filters, setFilters] = useState(() => historyFilters(defaultFilters));
  const { category, query, activeOnly } = filters;
  const [notice, setNotice] = useState('');
  const known = useRef(null);
  const mountedAt = useRef(Date.now());
  const detail = useRef(null);
  const list = useRef(null);
  const posts = state?.posts ?? [], offers = state?.offers ?? [];
  const mine = view === 'mine', brand = user?.kind === 'brand';
  useEffect(() => {
    if (!state?.posts) return;
    const previous = known.current;
    known.current = new Set(posts.map(p => p.id));
    if (!previous) return;
    const arrived = posts.filter(p => !previous.has(p.id) && !p.isMine && Date.parse(p.createdAt) >= mountedAt.current);
    if (arrived.length) setNotice(arrived.length === 1 ? `새 공고 · ${arrived[0].title}` : `새 공고 ${arrived.length}건이 도착했습니다.`);
  }, [state?.posts]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  const mineIds = new Set(offers.filter(o => o.isMine).map(o => o.postId));
  const scope = mine ? posts.filter(p => brand ? p.isMine : mineIds.has(p.id)) : posts;
  const rows = scope.filter(post => matchesFilters(post, filters)).sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const selected = postId ? scope.find(post => post.id === postId) : rows[0];
  useLayoutEffect(() => {
    const restored = historyFilters(defaultFilters);
    setFilters(postId && selected && !matchesFilters(selected, restored) ? allFilters : restored);
    if (!['feed', 'mine'].includes(view)) return;
    if (!window.matchMedia('(max-width: 900px)').matches) {
      if (postId) detail.current?.scrollTo(0, 0);
      return;
    }
    if (postId) {
      detail.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else {
      const previous = history.state?.bidListReturn;
      if (previous?.view === view && list.current) {
        const button = [...list.current.querySelectorAll('[data-post]')].find(row => row.dataset.post === previous.id);
        button?.focus({ preventScroll: true });
        window.scrollTo(0, previous.y);
      }
    }
  }, [view, postId, defaultFilters]);
  function rememberFilters(next, extra = {}) {
    history.replaceState({ ...history.state, ...extra, bidMarketFilters: next }, '');
  }
  function updateFilters(changes) {
    if (postId) {
      if (onChoosePost) onChoosePost(null);
      else onView(view);
    }
    const next = { ...filters, ...changes };
    rememberFilters(next);
    setFilters(next);
  }
  const choose = id => {
    if (id === postId) { detail.current?.scrollTo(0, 0); return; }
    if (!postId) rememberFilters(filters, { bidListReturn: { id, view, y: window.scrollY } });
    if (onChoosePost) onChoosePost(id);
    else onView(view + '/' + id);
    rememberFilters(filters, { bidFromList: !postId });
  };
  function returnToList() {
    if (history.state?.bidFromList) { history.back(); return; }
    if (onChoosePost) onChoosePost(null);
    else onView(view);
    rememberFilters(filters);
    window.scrollTo(0, 0);
  }
  const afterPost = id => { setNotice('공고를 등록했습니다.'); onView('mine/' + id); };
  const sent = () => setNotice('제안을 보냈습니다. 내 제안에서 다시 확인할 수 있어요.');
  if (view === 'new' && brand) return <section className="bm"><NewPost key={initialCategory} initialCategory={initialCategory} selectedPartner={selectedPartner} mutate={mutate} onDone={afterPost} onCancel={() => onView('feed')} /></section>;
  if ((mine && !user) || (view === 'new' && !brand)) return <section className="bm"><div className="bm-empty">
    <h1>{view === 'new' ? '브랜드 회원 전용입니다' : '로그인이 필요합니다'}</h1>
    <button type="button" className="bm-primary" onClick={user ? () => onView('feed') : onLogin}>{user ? '파트너 찾기' : '로그인'} <ArrowRight size={15} /></button></div></section>;
  return <section className={postId ? 'bm bm-reading' : 'bm'}>
    <BoardHeader mine={mine} posts={scope} brand={brand} onNew={() => onView('new')} />
    <div className="bm-toolbar"><div className="bm-tabs" aria-label="공고 분야">
      {Object.entries({all:'전체 공고', packaging:types.packaging, design:'디자인 · 준비 중'}).map(([key,label]) => <button type="button" key={key} aria-pressed={category === key} onClick={() => { if (key !== category) updateFilters({category:key}); }}>{label}</button>)}
    </div><label className="bm-search"><MagnifyingGlass size={16}/><input aria-label="공고 검색" value={query} onChange={e => updateFilters({query:e.target.value})} placeholder="공고명·제작 조건 검색" />{query && <button type="button" onClick={() => updateFilters({query:''})} aria-label="검색어 지우기"><X size={14}/></button>}</label></div>
    <div className="bm-layout">
      <section className="bm-ledger" aria-label="공고 목록" ref={list}>
        <div className="bm-ledger-head"><h2>{mine ? (brand ? '내 발주 공고' : '제안을 보낸 공고') : '공고 목록'} <span>{rows.length}</span></h2><div>
          <label className="bm-active-toggle"><input type="checkbox" checked={activeOnly} onChange={e => updateFilters({activeOnly:e.target.checked})} />접수 중만</label>
          <span className="bm-sort"><ArrowDown size={12}/>최신순</span></div></div>
        {rows.length > 0 ? <div className="bm-rows">{rows.map(post => <button className={`bm-row ${selected?.id === post.id ? 'is-current' : ''}`} type="button" key={post.id}
          data-post={post.id} aria-current={post.id === postId ? 'true' : undefined} onClick={() => choose(post.id)}>
          <ProductIcon post={post} /><span className="bm-row-text"><span className="bm-row-meta">{types[post.category]}<i/> {elapsed(post.createdAt)}</span>
          <strong>{post.title}</strong><span className="bm-row-figures">{number.format(post.quantity)}개 <i/> 희망 {number.format(post.unitPrice)}원/개</span></span>
          <span className="bm-row-right"><span className={acceptsProposals(post) && daysLeft(post) <= 2 ? 'urgent' : ''}>{statusText(post)}</span><small>제안 {post.offerCount ?? 0}건</small></span>
          <CaretRight size={14} className="bm-chevron" /></button>)}</div> :
          <div className="bm-empty"><ListMagnifyingGlass size={34} weight="light"/><h3>{scope.length ? '조건에 맞는 공고가 없습니다' : mine ? (brand ? '아직 등록한 공고가 없습니다' : '아직 보낸 제안이 없습니다') : '아직 등록된 공고가 없습니다'}</h3>
            <p>{scope.length ? '검색어나 분야를 바꾸어 보세요.' : mine ? (brand ? '첫 발주 조건을 등록해 보세요.' : '파트너를 찾는 브랜드의 공고를 살펴보세요.') : '브랜드가 공고를 등록하면 이곳에 표시됩니다.'}</p>
            {scope.length ? <button type="button" className="bm-secondary" onClick={() => updateFilters(allFilters)}>조건 초기화</button> : mine && <button type="button" className="bm-secondary" onClick={() => onView(brand ? 'new' : 'feed')}>{brand ? '공고 등록' : '파트너 찾기'}</button>}</div>}
      </section>
      <aside className="bm-side" tabIndex={-1} ref={detail}>
        {postId && <button type="button" className="bm-back" onClick={returnToList}><ArrowLeft size={15}/> 공고 목록</button>}
        {selected ? <PostDetail key={selected.id} post={selected} offers={offers.filter(o => o.postId === selected.id)} user={user} mutate={mutate} onSelect={onSelect} onSignup={onSignup} onSent={sent} /> :
          <div className={postId ? 'bm-idle bm-missing' : 'bm-idle'}><Radio size={31} weight="light"/><strong>{postId ? '공고를 찾을 수 없습니다' : '공고 상세'}</strong><p>목록에서 공고를 선택하면 수량, 단가와 제작 조건을 확인할 수 있어요.</p></div>}
      </aside>
    </div>
    <div role="status" aria-live="polite" className={notice ? 'bm-notice' : 'bm-silent'}>{notice && <><Bell size={16} />{notice}</>}</div>
  </section>;
}
