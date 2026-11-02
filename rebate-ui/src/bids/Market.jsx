import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CaretRight, ListMagnifyingGlass, MagnifyingGlass, Plus, Radio, X } from '@phosphor-icons/react';
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

function statusText(post) {
  if (post.status === 'awarded') return '선정 완료';
  const days = daysLeft(post);
  if (days < 0) return '접수 종료';
  return days === 0 ? '오늘 마감' : `D−${days}`;
}

function elapsed(iso) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return date.format(new Date(iso));
}

function ProductPhoto({ post }) {
  let index = post.category === 'design' ? 2 : 0;
  if (/택배|배송|보냉|골판지|메일러/.test(post.title)) index = 1;
  else if (/선물|쇼핑백|기프트|슬리브/.test(post.title)) index = 2;
  return <span className={`bm-product-photo product-photo photo-${index}`} aria-hidden="true"/>;
}

function BoardHeader({ mine, posts, brand, onNew }) {
  const open = posts.filter(post => post.status === 'open' && daysLeft(post) >= 0);
  return <header className="bm-cover">
    <div className="bm-cover-main">
      <span className="bm-live"><i/> 실시간 업데이트</span>
      <h1>{mine ? (brand ? '내 공고' : '내 입찰') : '입찰 전광판'}</h1>
      <p>{mine ? (brand ? '등록한 공고와 들어온 견적을 확인해요.' : '제출한 견적과 선정 상태를 확인해요.') : '내게 맞는 디자인·패키징 공고를 찾고 견적을 제안하세요.'}</p>
      <dl className="bm-stats">
        <div><dt>접수 중</dt><dd>{number.format(open.length)}건</dd></div>
        <div><dt>오늘 마감</dt><dd>{number.format(open.filter(post => daysLeft(post) === 0).length)}건</dd></div>
      </dl>
      {brand && <button type="button" className="button primary bm-cover-cta" onClick={onNew}><Plus size={17} /> 공고 등록</button>}
    </div>
    <img className="bm-cover-photo" src="/images/packaging-hero.png" alt="" width="1536" height="1024" />
  </header>;
}

function ReviewRows({ rows }) {
  return <dl className="bm-review-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function NewPost({ mutate, onDone, onCancel }) {
  const [category, setCategory] = useState('packaging');
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
    catch (err) { setError(err.message || '등록하지 못했습니다. 다시 시도해 주세요.'); }
    finally { submitLock.current = false; setBusy(false); }
  }
  return <section className="bm-compose"><div className="bm-compose-intro">
    <h1>새 공고 등록</h1>
    <p>공급사가 견적을 낼 수 있도록 수량, 규격, 필요한 납기를 알려주세요.</p>
  </div><form className="bm-form bm-post-form" onSubmit={preview}>
    <fieldset className="bm-fieldset"><legend>발주 분야</legend><div className="bm-type-select">{Object.entries(types).map(([id, label]) =>
      <label key={id}><input type="radio" name="type" value={id} checked={category === id} onChange={() => setCategory(id)} />{label}</label>)}</div></fieldset>
    <label>공고 제목<input name="title" required maxLength={100} placeholder="예: 화장품 단상자 인쇄·제작" /></label>
    <div className="bm-two"><label>요청 수량 (개)<input name="quantity" type="number" min="1" max="100000000" step="1" required placeholder="5,000" /></label>
      <label>희망 개당 단가 (원)<input name="unitPrice" type="number" min="1" max="1000000000" step="1" required placeholder="450" /></label></div>
    <div className="bm-two"><label>규격 <small>선택</small><input name="size" maxLength={160} placeholder="예: 60 × 35 × 110 mm" /></label>
      <label>입찰 접수 마감일<input type="date" name="deadline" required min={koreanDay()} /></label></div>
    <label>제작 조건<textarea name="description" required rows={5} maxLength={2000} placeholder="희망 납기, 재질, 인쇄·후가공, 디자인 범위 등을 적어주세요." /></label>
    <p className="bm-hint">공개 공고입니다. 업체명, 연락처, 외부 링크는 입력하지 마세요.</p>
    {error && !draft && <p role="alert" className="bm-error">{error}</p>}
    <div className="bm-actions"><button type="button" onClick={onCancel}>취소</button><button type="submit" className="bm-primary">공고 확인 <ArrowRight size={16}/></button></div>
  </form>{draft && <ReviewConfirm open title="이 내용으로 공고를 등록할까요?" busy={busy} error={error} onCancel={() => { setDraft(null); setError(''); }} onConfirm={publish} confirmLabel="공고 등록">
    <ReviewRows rows={[[ '분야', types[draft.category] ], ['제목', draft.title], ['수량 · 단가', `${number.format(draft.quantity)}개 · ${number.format(draft.unitPrice)}원`],
      ['규격', draft.size || '미입력'], ['입찰 마감', draft.deadline], ['제작 조건', draft.description]]} />
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
    catch (err) { setError(err.message || '입찰을 제출하지 못했습니다. 다시 시도해 주세요.'); }
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
      <p className="bm-hint">업체명과 연락처는 제외해 주세요. 공고마다 한 번 입찰할 수 있습니다.</p>
      {error && !draft && <p role="alert" className="bm-error">{error}</p>}
      <button type="submit" className="bm-primary">입찰 내용 확인 <ArrowRight size={16} /></button>
    </form>
    {draft && <ReviewConfirm open title="이 조건으로 입찰할까요?" busy={busy} error={error} confirmLabel="입찰 제출" onCancel={() => { setDraft(null); setError(''); }} onConfirm={send}>
      <ReviewRows rows={[[ '공고', post.title ], ...draft.tiers.map(t => [`${number.format(t.quantity)}개`, `개당 ${number.format(t.unitPrice)}원 · 총 ${number.format(t.quantity * t.unitPrice)}원`]), ['메모', draft.note || '없음']]} />
    </ReviewConfirm>}
  </div>;
}

function Offer({ offer, post, onSelect, allowSelect }) {
  const [choice, setChoice] = useState(0);
  const tier = offer.tiers[choice];
  return <article className="bm-offer">
    <div className="bm-offer-head"><strong>{offer.isMine ? '내 견적' : offer.alias}</strong><span>수량 조건 {offer.tiers.length}개</span></div>
    <div className="bm-offer-tiers">
      {offer.tiers.map((t, i) => <label key={t.quantity} className={allowSelect && choice === i ? 'chosen' : ''}>
        {allowSelect && <input aria-label={`${offer.alias} ${t.quantity}개 조건 선택`} type="radio" name={`tier-${offer.id}`} checked={choice === i} onChange={() => setChoice(i)} />}
        <span>{number.format(t.quantity)}개</span><span>개당 {number.format(t.unitPrice)}원</span>
        <strong>총 {number.format(t.quantity * t.unitPrice)}원</strong>
      </label>)}
    </div>
    {offer.note && <p className="bm-note">{offer.note}</p>}
    {allowSelect && tier && <button type="button" className="bm-secondary" onClick={() => onSelect(offer, post, tier)}>이 조건으로 업체 선택 <ArrowUpRight size={15} /></button>}
  </article>;
}

function PostDetail({ post, offers, user, mutate, onSelect, onLogin, onSent }) {
  const closed = post.status !== 'open' || daysLeft(post) < 0;
  const ownOffer = offers.find(o => o.isMine);
  const canBid = user?.kind === 'both' || user?.kind === post.category;
  return <section className="bm-detail" aria-label="선택한 공고 상세">
    <div className="bm-detail-head"><span className="bm-kind">{types[post.category]}</span><span className="bm-status">{statusText(post)}</span></div>
    <div className="bm-detail-title"><div><h2>{post.title}</h2><span>공고 상세</span></div>
      <div className="bm-detail-photo"><ProductPhoto post={post} /><span>품목 예시</span></div></div>
    <dl className="bm-specs"><div><dt>요청 수량</dt><dd>{number.format(post.quantity)}개</dd></div><div><dt>희망 단가</dt><dd>{number.format(post.unitPrice)}원<span> / 개</span></dd></div>
      <div><dt>규격</dt><dd>{post.size || '미지정'}</dd></div><div><dt>입찰 마감</dt><dd>{post.deadline}</dd></div></dl>
    <div className="bm-detail-copy"><h3>제작 조건</h3><p>{post.description}</p></div>
    {post.isMine ? <section className="bm-offer-section"><h3>받은 견적 <span>{offers.length}</span></h3>
      {offers.length ? offers.map(o => <Offer key={o.id} offer={o} post={post} allowSelect={post.status === 'open'} onSelect={onSelect} />) : <p className="bm-hint">아직 제출된 견적이 없습니다.</p>}
    </section> : ownOffer ? <Offer offer={ownOffer} post={post} /> : !closed && !user ?
      <button className="bm-primary" type="button" onClick={onLogin}>로그인하고 입찰 <ArrowRight size={16}/></button> :
      !closed && canBid ? <QuoteForm post={post} mutate={mutate} onDone={onSent} /> :
      <div className="bm-info">{closed ? '신규 입찰 접수가 끝났습니다.' : `${types[post.category]} 공급사 계정으로 입찰할 수 있습니다.`}</div>}
  </section>;
}

export default function Market({ state, user, view, onView, mutate, onSelect, onLogin }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
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
  function clearFilters() { setCategory('all'); setQuery(''); setActiveOnly(false); }
  const mineIds = new Set(offers.filter(o => o.isMine).map(o => o.postId));
  const scope = mine ? posts.filter(p => brand ? p.isMine : mineIds.has(p.id)) : posts;
  const term = query.trim().toLocaleLowerCase('ko');
  const rows = scope.filter(p => (category === 'all' || p.category === category) &&
    (!activeOnly || (p.status === 'open' && daysLeft(p) >= 0)) &&
    (!term || [p.title, p.description, p.size].some(text => text?.toLocaleLowerCase('ko').includes(term))))
    .sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const selected = rows.find(p => p.id === selectedId) || rows[0];
  const choose = id => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => {
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    else detail.current?.scrollTo(0, 0);
  };
  function returnToList() {
    const current = list.current?.querySelector('.is-current');
    current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  const afterPost = id => { clearFilters(); setSelectedId(id); setNotice('공고를 등록했습니다.'); onView('mine'); };
  const sent = () => setNotice('입찰을 제출했습니다. 내 입찰에서 다시 볼 수 있습니다.');
  if (view === 'new' && brand) return <section className="bm"><NewPost mutate={mutate} onDone={afterPost} onCancel={() => onView('feed')} /></section>;
  if ((mine && !user) || (view === 'new' && !brand)) return <section className="bm"><div className="bm-empty">
    <h1>{view === 'new' ? '브랜드 회원 전용입니다' : '로그인이 필요합니다'}</h1>
    <button type="button" className="bm-primary" onClick={user ? () => onView('feed') : onLogin}>{user ? '전광판 보기' : '로그인'} <ArrowRight size={15} /></button></div></section>;
  return <section className="bm">
    <BoardHeader mine={mine} posts={scope} brand={brand} onNew={() => onView('new')} />
    <div className="bm-toolbar"><div className="bm-tabs" aria-label="공고 분야">
      {Object.entries({all:'전체 공고', ...types}).map(([key,label]) => <button type="button" key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}
    </div><label className="bm-search"><MagnifyingGlass size={16}/><input aria-label="공고 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="공고명·제작 조건 검색" />{query && <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={14}/></button>}</label></div>
    <div className="bm-layout">
      <section className="bm-ledger" aria-label="공고 목록" ref={list}>
        <div className="bm-ledger-head"><h2>{mine ? (brand ? '내 발주 공고' : '내가 입찰한 공고') : '공고 목록'} <span>{rows.length}</span></h2><div>
          <label className="bm-active-toggle"><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />접수 중만</label>
          <span className="bm-sort"><ArrowDown size={12}/>최신순</span></div></div>
        {rows.length > 0 ? <div className="bm-rows">{rows.map(post => <button className={`bm-row ${selected?.id === post.id ? 'is-current' : ''}`} type="button" key={post.id}
          aria-pressed={selected?.id === post.id} onClick={() => choose(post.id)}>
          <ProductPhoto post={post} /><span className="bm-row-text"><span className="bm-row-meta">{types[post.category]}<i/> {elapsed(post.createdAt)}</span>
          <strong>{post.title}</strong><span className="bm-row-figures">{number.format(post.quantity)}개 <i/> 희망 {number.format(post.unitPrice)}원/개</span></span>
          <span className="bm-row-right"><span className={post.status === 'open' && daysLeft(post) >= 0 && daysLeft(post) <= 2 ? 'urgent' : ''}>{statusText(post)}</span><small>입찰 {post.offerCount ?? 0}</small></span>
          <CaretRight size={14} className="bm-chevron" /></button>)}</div> :
          <div className="bm-empty"><ListMagnifyingGlass size={34} weight="light"/><h3>{scope.length ? '조건에 맞는 공고가 없습니다' : mine ? (brand ? '아직 등록한 공고가 없습니다' : '아직 제출한 입찰이 없습니다') : '아직 등록된 공고가 없습니다'}</h3>
            <p>{scope.length ? '검색어나 분야를 바꾸어 보세요.' : mine ? (brand ? '첫 발주 조건을 등록해 보세요.' : '전광판에서 관심 있는 공고를 찾아보세요.') : '브랜드가 공고를 등록하면 이곳에 표시됩니다.'}</p>
            {scope.length ? <button type="button" className="bm-secondary" onClick={clearFilters}>조건 초기화</button> : mine && <button type="button" className="bm-secondary" onClick={() => onView(brand ? 'new' : 'feed')}>{brand ? '공고 등록' : '전광판 보기'}</button>}</div>}
      </section>
      <aside className="bm-side" tabIndex={-1} ref={detail}>
        {selected && <button type="button" className="bm-back" onClick={returnToList}><ArrowLeft size={15}/> 공고 목록으로</button>}
        {selected ? <PostDetail key={selected.id} post={selected} offers={offers.filter(o => o.postId === selected.id)} user={user} mutate={mutate} onSelect={onSelect} onLogin={onLogin} onSent={sent} /> :
          <div className="bm-idle"><Radio size={31} weight="light"/><strong>공고 상세</strong><p>선택한 공고의 조건과 입찰 내용을 확인할 수 있습니다.</p></div>}
      </aside>
    </div>
    <div role="status" aria-live="polite" className={notice ? 'bm-notice' : 'bm-silent'}>{notice && <><Bell size={16} />{notice}</>}</div>
  </section>;
}
