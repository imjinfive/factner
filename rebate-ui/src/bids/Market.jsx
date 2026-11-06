import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Bag, Bell, Cube, Gift, ListMagnifyingGlass, MagnifyingGlass, Package, PencilRuler, Plus, Radio, Tag, Tray, X } from '@phosphor-icons/react';
import { isPackagingPartner } from '../../../shared/partner-roles.js';
import { isPublicPost, roomReviewUrl } from './post-visibility.js';
import { packagingSize, positiveInteger } from './market-input.js';
import ElectronicAgreement from '../ElectronicAgreement';
import ReviewConfirm from '../ReviewConfirm';
import {clearOnboardingDraft,onboardingPostDraft,normalizeOnboardingDraft} from './onboarding-data.js';
import {initialPostRequest,completedPostRequests,completePostRequest} from './post-request.js';
import OnboardingSurvey from './OnboardingSurvey';
import NumericInput from './NumericInput';
import './market.css';

const types = { design: '이전 의뢰', packaging: '패키징 제작' };
const number = new Intl.NumberFormat('ko-KR');
const requestedQuantity = value => value == null ? '수량 협의' : `${number.format(value)}개`;
const requestedPrice = value => value == null ? '단가 제안 요청' : `${number.format(value)}원/개`;
const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' });
const dayMs = 86400000;

function koreanDay() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function daysLeft(post) {
  return (Date.parse(post.deadline) - Date.parse(koreanDay())) / dayMs;
}

function acceptsProposals(post) {
  return isPublicPost(post) && post.category === 'packaging' && post.status === 'open' && daysLeft(post) >= 0;
}

function statusText(post, archived = false) {
  if (post.reviewStatus === 'pending') return '심사 대기';
  if (post.reviewStatus === 'rejected') return '심사 반려';
  if (post.reviewStatus === 'withdrawn') return '삭제됨';
  if (post.status === 'awarded') return '선정 완료';
  const days = daysLeft(post);
  if (post.status !== 'open' || days < 0) return '접수 종료';
  if (post.category === 'design') return archived ? '열람 전용' : '준비 중';
  return days === 0 ? '오늘 마감' : `D-${days}`;
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

const allFilters = { category: 'all', query: '', activeOnly: false, includeRemoved: false };
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

function BoardHeader({ mine, posts, brand, archived, onNew }) {
  const open = posts.filter(acceptsProposals);
  const title = mine ? (brand ? '내 공고와 받은 입찰' : '내가 입찰한 공고') : (archived ? '이전 의뢰' : brand ? '공개 공고' : '제작 공고');
  return <header className="bm-cover">
    <div className="bm-cover-main">
      <h1>{title}</h1>
      {archived ? <p>{mine ? '기존 제안과 선정 결과를 확인하세요.' : '보관된 의뢰와 제안 기록입니다.'}</p> :
        <p>{mine ? (brand ? '공고 심사 결과와 제작업체별 입찰 조건을 확인하세요.' : '내가 제출한 수량별 단가와 선정 결과를 확인하세요.') : brand ? '다른 브랜드의 공개된 제작 의뢰를 둘러보세요. 내 공고에서 받은 입찰을 비교할 수 있어요.' : '제작 가능한 공고를 고르고, 수량별로 단가를 제안하세요.'}</p>}
      {brand && <button type="button" className="button primary bm-cover-cta" onClick={onNew}><Plus size={17} /> 공고 등록</button>}
    </div>
    <dl className="bm-stats">
      {mine && brand ? <><div><dt>심사 대기</dt><dd>{number.format(posts.filter(post=>post.reviewStatus==='pending').length)}건</dd></div>
        <div><dt>입찰 접수 중</dt><dd>{number.format(open.length)}건</dd></div></> : archived ? <div><dt>{mine ? '저장된 제안' : '등록된 의뢰'}</dt><dd>{number.format(posts.length)}건</dd></div> : <>
        <div><dt>접수 중</dt><dd>{number.format(open.length)}건</dd></div>
        <div><dt>오늘 마감</dt><dd>{number.format(open.filter(post => daysLeft(post) === 0).length)}건</dd></div>
      </>}
    </dl>
  </header>;
}

function ReviewRows({ rows }) {
  return <dl className="bm-review-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function NewPostFlow({mutate,onDone,onCancel,user,posts,isDemo}) {
  function restore() {
    const entry=history.state||{};
    const next=initialPostRequest(user,posts,entry,completedPostRequests(user.id));
    if(entry.postRequest?.id!==next.id)history.replaceState({...entry,postRequest:next,postSurvey:null,onboardingDraft:null},'');
    return next;
  }
  const [flow,setFlow]=useState(restore);
  useEffect(()=>{
    const back=()=>setFlow(restore);
    window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);
  },[user.id,posts]);
  function review(draft) {
    const next={...flow,stage:'review',draft:normalizeOnboardingDraft(draft)};
    history.pushState({...history.state,postRequest:next},'');setFlow(next);
    window.scrollTo({top:0,behavior:'instant'});
  }
  function done(id) {
    completePostRequest(user.id,flow.id);clearOnboardingDraft();
    history.replaceState({...history.state,postRequest:{...flow,submittedId:id,draft:null},postSurvey:null,onboardingDraft:null},'');
    onDone(id);
  }
  return flow.stage==='review'?<section className="bm"><NewPost key={flow.id} prefill={onboardingPostDraft(flow.draft)} mutate={mutate} onDone={done} onCancel={onCancel} isDemo={isDemo}/></section>
    :<OnboardingSurvey key={flow.id} requestMode initialDraft={flow.draft} onContinue={review} onCancel={onCancel}/>;
}

function NewPost({ mutate, onDone, onCancel, prefill, isDemo }) {
  const category = 'packaging';
  const [numbers,setNumbers] = useState(prefill);
  const numberField = name => ({name,value:numbers[name]||'',onValueChange:value=>setNumbers(current=>({...current,[name]:value}))});
  const [quantityUnknown,setQuantityUnknown] = useState(prefill.quantityUnknown===true);
  const [budgetUnknown,setBudgetUnknown] = useState(prefill.budgetUnknown===true);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitLock = useRef(false);
  function preview(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    try {
      const candidate = { title:data.title.trim(), description:data.description.trim(), category,
        quantity:quantityUnknown?null:positiveInteger(data.quantity, 100000000, '요청 수량'), unitPrice:budgetUnknown?null:positiveInteger(data.unitPrice, 1000000000, '희망 단가'), size:packagingSize(numbers) };
      if (!candidate.title || !candidate.description) throw new Error('제목과 제작 조건을 입력해 주세요.');
      if (candidate.quantity != null && candidate.unitPrice != null && candidate.quantity * candidate.unitPrice > 1e12) throw new Error('수량과 단가의 합계는 1조원 이하여야 합니다.');
      setError('');
      setDraft(candidate);
    } catch (err) { setError(err.message); }
  }
  async function publish(agreement) {
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try { const result = await mutate('/posts', { ...draft, agreement }); onDone(result.id); }
    catch (err) { setError(err.message?.replaceAll('입찰', '제안') || '등록하지 못했습니다. 다시 시도해 주세요.'); }
    finally { submitLock.current = false; setBusy(false); }
  }
  return <section className="bm-compose"><div className="bm-compose-intro">
    <h1>{prefill.title?'선택한 조건으로 공고를 준비했어요':'새 공고 등록'}</h1>
    <p>{isDemo ? '테스트 공고는 이 공간에서만 공개됩니다. 관리자 승인 후 같은 테스트 공간의 제작업체가 볼 수 있습니다.' : '내용을 확인하고 신청하면, 운영팀 승인 후 제작업체의 입찰을 받습니다.'}</p>
  </div><form className="bm-form bm-post-form" onSubmit={preview}>
    <p className="bm-anonymous-guide" id="bm-anonymous-guide"><strong>공고는 익명으로 공개됩니다.</strong> 제목·규격·제작 조건에는 업체명, 브랜드명, 담당자명, 사업자번호, 전화번호, 이메일, 주소, 외부 링크를 적지 마세요.</p>
    <label>공고 제목<input name="title" defaultValue={prefill.title||''} required maxLength={100} aria-describedby="bm-anonymous-guide" placeholder="예: 화장품 단상자 인쇄·제작" /></label>
    <div className="bm-two"><div><label>요청 수량 (개)<NumericInput {...numberField('quantity')} maxLength={9} required={!quantityUnknown} disabled={quantityUnknown} placeholder="5,000" /></label>
      <label className="bm-active-toggle"><input type="checkbox" checked={quantityUnknown} onChange={e=>setQuantityUnknown(e.target.checked)}/>상담 후 정할게요</label></div>
      <div><label>희망 개당 단가 (원)<NumericInput {...numberField('unitPrice')} maxLength={10} required={!budgetUnknown} disabled={budgetUnknown} placeholder="450" /></label>
      <label className="bm-active-toggle"><input type="checkbox" checked={budgetUnknown} onChange={e=>setBudgetUnknown(e.target.checked)}/>업체의 제안을 받을게요</label></div></div>
    <fieldset className="bm-fieldset bm-dimensions"><legend>규격 (mm) <small>선택</small></legend>
      <div><label>가로<NumericInput {...numberField('width')} allowDecimal maxLength={10} placeholder="60" /></label>
        <label>세로<NumericInput {...numberField('depth')} allowDecimal maxLength={10} placeholder="35" /></label>
        <label>높이 <small>선택</small><NumericInput {...numberField('height')} allowDecimal maxLength={10} placeholder="110" /></label></div>
      <p className="bm-hint">숫자만 입력하세요. 봉투·라벨처럼 납작한 제품은 높이를 비워도 됩니다.</p>
    </fieldset>
    <label>제작 조건<textarea name="description" defaultValue={prefill.description||''} required rows={5} maxLength={2000} aria-describedby="bm-anonymous-guide" placeholder="희망 납기, 재질, 인쇄·후가공 조건 등을 적어주세요." /></label>
    {error && !draft && <p role="alert" className="bm-error">{error}</p>}
    <p className="bm-hint">공고가 승인되면 7일 동안 입찰을 받습니다.</p>
    <div className="bm-actions"><button type="button" onClick={onCancel}>취소</button><button type="submit" className="bm-primary">심사 요청 <ArrowRight size={16}/></button></div>
  </form>{draft && <ElectronicAgreement open description="공고 내용과 제출 확인서를 읽고 서명해 주세요. 운영팀 승인 후 7일 동안 공고가 공개됩니다." busy={busy} error={error} onCancel={() => { setDraft(null); setError(''); }} onConfirm={publish}>
    <ReviewRows rows={[[ '분야', types[draft.category] ], ['제목', draft.title], ['수량 · 단가', `${requestedQuantity(draft.quantity)} · ${requestedPrice(draft.unitPrice)}`],
      ['규격', draft.size || '미입력'], ['입찰 기간', '공고 승인 후 7일'], ['제작 조건', draft.description]]} />
  </ElectronicAgreement>}</section>;
}

function QuoteForm({ post, mutate, onDone }) {
  const [tiers, setTiers] = useState([{ key: 1, quantity: post.quantity==null?'':String(post.quantity), unitPrice: '' }]);
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
    try {
      const values = tiers.map(row => ({ quantity:positiveInteger(row.quantity, 100000000, '제작 수량'), unitPrice:positiveInteger(row.unitPrice, 1000000000, '개당 단가') }));
      if (new Set(values.map(row => row.quantity)).size !== values.length) throw new Error('각 조건의 수량을 다르게 입력해 주세요.');
      if (values.some(row => row.quantity * row.unitPrice > 1e12)) throw new Error('각 조건의 합계는 1조원 이하여야 합니다.');
      setError('');
      setDraft({ tiers: values, note: note.trim() });
    } catch (err) { setError(err.message); }
  }
  async function send(agreement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await mutate(`/posts/${encodeURIComponent(post.id)}/offers`, { ...draft, agreement }); setDraft(null); onDone(); }
    catch (err) { setError(err.message || '입찰을 보내지 못했습니다. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="bm-quote-form"><h3>수량별 입찰 단가</h3>
    <form className="bm-form" onSubmit={preview}>
      <div className="bm-tier-labels" aria-hidden="true"><span>제작 수량 (개)</span><span>개당 단가 (원)</span></div>
      {tiers.map((row, index) => <div className="bm-tier-input" key={row.key}>
        <input type="text" inputMode="numeric" maxLength={12} required aria-label={`조건 ${index + 1} 수량 (개)`} value={row.quantity} onChange={e => update(row.key,'quantity',e.target.value)} />
        <input type="text" inputMode="numeric" maxLength={13} required aria-label={`조건 ${index + 1} 개당 단가 (원)`} value={row.unitPrice} onChange={e => update(row.key,'unitPrice',e.target.value)} placeholder="단가 입력" />
        <button type="button" aria-label={`조건 ${index + 1} 삭제`} disabled={tiers.length === 1} onClick={() => setTiers(rows => rows.filter(r => r.key !== row.key))}><X size={15} /></button>
      </div>)}
      {tiers.length < 8 && <button className="bm-add" type="button" onClick={() => { const key = nextKey.current++; setTiers(rows => [...rows, {key, quantity: '', unitPrice: ''}]); }}><Plus size={15} />수량 조건 추가</button>}
      <label>견적 메모 <small>선택</small><textarea rows={2} value={note} maxLength={1200} onChange={e => setNote(e.target.value)} placeholder="납기, 후가공, 배송·세금 포함 여부" /></label>
      <p className="bm-hint">한 공고에 여러 수량의 단가를 담아 한 번 입찰할 수 있습니다. 상호와 연락처는 적지 마세요. 운영팀이 확인하고 승인한 입찰만 브랜드에 전달됩니다.</p>
      {error && !draft && <p role="alert" className="bm-error">{error}</p>}
      <button type="submit" className="bm-primary">입찰 심사 요청 <ArrowRight size={16} /></button>
    </form>
    {draft && <ElectronicAgreement open description="입찰 조건과 제출 확인서를 읽고 서명해 주세요. 운영팀 승인 후 브랜드에 입찰이 전달됩니다." busy={busy} error={error} onCancel={() => { setDraft(null); setError(''); }} onConfirm={send}>
      <ReviewRows rows={[[ '공고', post.title ], ...draft.tiers.map(t => [`${number.format(t.quantity)}개`, `개당 ${number.format(t.unitPrice)}원 · 총 ${number.format(t.quantity * t.unitPrice)}원`]), ['메모', draft.note || '없음']]} />
    </ElectronicAgreement>}
  </div>;
}

function Offer({ offer, post, onSelect, allowSelect, selected }) {
  const [choice, setChoice] = useState(0);
  const tier = offer.tiers[choice];
  const alias = offer.alias;
  const selectable = allowSelect && offer.reviewStatus==='approved';
  return <article className="bm-offer">
    <div className="bm-offer-head"><strong>{alias}{offer.isMine && ' · 내 입찰'}</strong><span>{selected ? '선정된 입찰' : offer.reviewStatus==='pending' ? '심사 대기' : offer.reviewStatus==='rejected' ? '심사 반려' : offer.reviewStatus==='withdrawn' ? '공개 중단' : `수량 조건 ${offer.tiers.length}개`}</span></div>
    {offer.isMine && offer.reviewStatus==='pending' && <p className="bm-offer-review">운영팀이 입찰 내용을 확인하고 있습니다. 승인 후 브랜드에 전달됩니다.</p>}
    {offer.isMine && ['rejected','withdrawn'].includes(offer.reviewStatus) && <p className="bm-offer-review">이 입찰은 브랜드에 공개되지 않습니다.{offer.reviewReason && <><br/>{offer.reviewReason}</>}</p>}
    <div className="bm-offer-tiers">
      {offer.tiers.map((t, i) => <label key={t.quantity} className={selectable && choice === i ? 'chosen' : ''}>
        {selectable && <input aria-label={`${alias} ${t.quantity}개 조건 선택`} type="radio" name={`tier-${offer.id}`} checked={choice === i} onChange={() => setChoice(i)} />}
        <span>{number.format(t.quantity)}개</span><span>개당 {number.format(t.unitPrice)}원</span>
        <strong>총 {number.format(t.quantity * t.unitPrice)}원</strong>
      </label>)}
    </div>
    {offer.note && <p className="bm-note">{offer.note}</p>}
    {selectable && tier && <button type="button" className="bm-secondary" onClick={() => onSelect(offer, post, tier)}>이 조건으로 매칭 요청 <ArrowUpRight size={15} /></button>}
  </article>;
}

function WithdrawPost({ post, mutate, onDone }) {
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const trigger = useRef(null);
  async function withdraw() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await mutate(`/posts/${encodeURIComponent(post.id)}/withdraw`, {version, confirmed:true});
      setVersion(null);
      onDone();
    } catch (err) {
      setError(err.message || '삭제하지 못했습니다. 다시 확인해 주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const cancel = () => { setVersion(null); requestAnimationFrame(() => trigger.current?.focus()); };
  return <div className="bm-withdraw"><button type="button" ref={trigger} className="bm-secondary" onClick={() => { setError(''); setVersion(post.reviewVersion); }}>공고 삭제</button>
    {version !== null && <ReviewConfirm open title="이 공고를 삭제할까요?" description="삭제 후에는 이 공고를 다시 공개할 수 없습니다." cancelLabel="공고 유지" confirmLabel="공고 삭제" busy={busy} error={error} onCancel={cancel} onConfirm={withdraw}>
      <ReviewRows rows={[['공고', post.title],['삭제 후', post.status==='awarded' ? '공개 목록에서는 사라집니다. 이미 선정한 업체와의 연결·계약 기록은 유지됩니다.' : '공개 목록에서 사라지고 새 제안을 받을 수 없습니다. 내 공고에서 삭제 기록을 확인할 수 있습니다.']]} />
    </ReviewConfirm>}
  </div>;
}

function PostDetail({ post, offers, selectedOfferId, user, mutate, onSelect, onSignup, onSent, onWithdrawn, isDemo, reviewRoomKey, standalone = false }) {
  const design = post.category === 'design';
  const archived = user?.kind === 'design';
  const open = acceptsProposals(post);
  const ownOffer = offers.find(o => o.isMine);
  const canBid = isPackagingPartner(user?.kind);
  const Heading = standalone ? 'h1' : 'h2';
  const Subheading = standalone ? 'h2' : 'h3';
  const owner = user?.kind==='brand' && post.isMine;
  const registeredAt = post.createdAt || post.reviewedAt;
  const reviewUrl = roomReviewUrl(isDemo,user,post,reviewRoomKey,window.location.hostname);
  const withdrawn = post.reviewStatus==='withdrawn';
  const focusAfterRemoval = useRef(null);
  const finishWithdrawal = () => { onWithdrawn(); requestAnimationFrame(() => focusAfterRemoval.current?.focus({preventScroll:true})); };
  return <section className="bm-detail" aria-label={standalone ? '브랜드 의뢰 상세' : '선택한 공고 상세'}>
    <div className="bm-detail-head"><span className="bm-kind">{types[post.category]}</span><span className="bm-status">{statusText(post, archived)}</span></div>
    <div className="bm-detail-title"><div><Heading ref={focusAfterRemoval} tabIndex={-1}>{post.title}</Heading>{registeredAt && <span><time dateTime={registeredAt}>{elapsed(registeredAt)} 등록</time></span>}</div>
      <ProductIcon post={post} /></div>
    {owner && !isPublicPost(post) && <div className="bm-review-state">
      <p>{post.reviewStatus==='pending' ? (isDemo ? '관리자 승인 후 같은 테스트 공간의 제작업체가 이 공고를 볼 수 있습니다.' : '운영팀이 공고를 확인하고 있습니다. 승인 후 제작업체에 공개됩니다.') :
        post.reviewStatus==='rejected' ? '이 공고는 공개되지 않았습니다. 반려 사유를 확인하고 수정한 내용으로 새 공고를 작성해 주세요.' :
        '이 공고는 공개되지 않으며 새 제안을 받을 수 없습니다.'}</p>
      {post.reviewStatus==='rejected' && post.reviewReason && <p><b>반려 사유</b> {post.reviewReason}</p>}
      {withdrawn && post.status==='awarded' && <p>선정한 업체와의 연결·계약 기록은 계약함에서 확인할 수 있습니다.</p>}
      {reviewUrl && <a className="bm-review-link" href={reviewUrl} target="_blank" rel="noopener noreferrer">관리자 심사 화면 열기 <ArrowUpRight size={15} aria-hidden="true"/><span className="bm-silent"> (새 창)</span></a>}
    </div>}
    {!withdrawn && <>
    <dl className="bm-specs"><div><dt>요청 수량</dt><dd>{requestedQuantity(post.quantity)}</dd></div><div><dt>희망 단가</dt><dd>{requestedPrice(post.unitPrice)}</dd></div>
      <div><dt>규격</dt><dd>{post.size || '미지정'}</dd></div><div><dt>제안 마감</dt><dd>{post.deadline}</dd></div></dl>
    <div className="bm-detail-copy"><Subheading>제작 조건</Subheading><p>{post.description}</p>

    </div>
    {owner && !isPublicPost(post) ? null : owner ? <section className="bm-offer-section"><h3>받은 입찰 <span>{offers.length}</span></h3>
      {offers.length ? offers.map(o => <Offer key={o.id} offer={o} post={post} selected={o.id===selectedOfferId} allowSelect={!design && post.status === 'open'} onSelect={onSelect} />) : <p className="bm-hint">아직 들어온 입찰이 없습니다.</p>}
    </section> : ownOffer ? <Offer offer={ownOffer} post={post} selected={ownOffer.id===selectedOfferId} /> : design ? null : !user && open ?
      <div className="pa-join"><div><strong>이 공고에 입찰하고 싶으세요?</strong><p>가입 승인 후 모집 중인 의뢰에 수량별 단가를 제안할 수 있어요.</p></div><button className="bm-primary" type="button" onClick={onSignup}>회원가입 신청</button></div> :
      open && canBid ? <QuoteForm post={post} mutate={mutate} onDone={onSent} /> :
      <div className="bm-info">{user?.kind==='brand' ? '다른 브랜드의 공고는 열람만 가능합니다. 받은 입찰은 내 공고에서 확인하세요.' : !open ? '입찰 접수가 끝났습니다.' : '패키징 제작업체가 입찰할 수 있는 공고입니다.'}</div>}
    </>}
    {owner && onWithdrawn && !withdrawn && Number.isSafeInteger(post.reviewVersion) && <WithdrawPost post={post} mutate={mutate} onDone={finishWithdrawal}/>}
  </section>;
}

function PublicBrief({ state, postId, onDiscoveryBack, onView }) {
  const post = state?.posts?.find(item => item.id === postId && item.category === 'packaging' && isPublicPost(item));
  const section = useRef(null);
  useLayoutEffect(() => {
    section.current?.focus({ preventScroll: true });
  }, [postId]);
  return <section className="bm bm-public-brief" ref={section} tabIndex={-1} aria-label="브랜드 의뢰">
    <button type="button" className="bm-back bm-public-back" onClick={() => onDiscoveryBack ? onDiscoveryBack(postId) : onView('feed')}>
      <ArrowLeft size={16} aria-hidden="true"/> 브랜드 의뢰로 돌아가기
    </button>
    {!state ? <p role="status">브랜드 의뢰를 불러오고 있습니다.</p> : post ? <PostDetail post={post} offers={[]} onSignup={() => onView('signup')} standalone /> :
      <div className="bm-empty"><ListMagnifyingGlass size={34} aria-hidden="true" weight="light" />
        <h1>의뢰를 찾을 수 없습니다</h1><p>브랜드 의뢰 목록에서 다른 의뢰를 확인해 주세요.</p></div>}
  </section>;
}

export default function Market(props) {
  if (!props.user && props.view === 'feed' && props.postId) return <PublicBrief {...props}/>;
  return <WorkBoard {...props}/>;
}

function WorkBoard({ state, user, view, onView, mutate, onSelect, onLogin, postId, onChoosePost, isDemo, reviewRoomKey }) {
  const archived = user?.kind === 'design';
  const defaultFilters = view === 'feed' && isPackagingPartner(user?.kind) ? packagingFilters : allFilters;
  const [filters, setFilters] = useState(() => historyFilters(defaultFilters));
  const [historyVisit, setHistoryVisit] = useState(0);
  const {query,activeOnly} = filters;
  const [notice, setNotice] = useState('');
  const known = useRef(null);
  const detail = useRef(null);
  const list = useRef(null);
  const allPosts = state?.posts ?? [], offers = state?.offers ?? [];
  const posts = archived ? allPosts.filter(post => post.category === 'design') : allPosts;
  const publicPosts = posts.filter(isPublicPost);
  const mine = view === 'mine', brand = user?.kind === 'brand';
  const centered=mine&&!brand;
  useEffect(() => {
    // Two consecutive entries can show the same board with different filters.
    const restore = () => setHistoryVisit(visit => visit + 1);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (!state?.posts) return;
    const previous = known.current;
    known.current = new Set(publicPosts.map(p => p.id));
    if (!previous || view !== 'feed') return;
    const arrived = publicPosts.filter(p => !previous.has(p.id) && !p.isMine);
    if (arrived.length) setNotice(arrived.length === 1 ? `새 공고 · ${arrived[0].title}` : `새 공고 ${arrived.length}건이 도착했습니다.`);
  }, [state?.posts]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  const mineIds = new Set(offers.filter(o => o.isMine).map(o => o.postId));
  const scope = mine ? (brand ? posts.filter(p => p.isMine) : publicPosts.filter(p => mineIds.has(p.id))) : publicPosts;
  const visibleFilters = { ...filters, category:archived?'design':'packaging', activeOnly:!archived&&activeOnly };
  const rowTime = post => post.createdAt || post.reviewedAt;
  const rows = scope.filter(post => (post.reviewStatus!=='withdrawn'||filters.includeRemoved) && matchesFilters(post, visibleFilters)).sort((a,b) => Date.parse(rowTime(b)) - Date.parse(rowTime(a)));
  const selected = postId ? scope.find(post => post.id === postId) : centered ? null : rows[0];
  const selectedAward = (isDemo ? state?.contracts : state?.connections)?.find(item => item.postId === selected?.id);
  useLayoutEffect(() => {
    const saved = historyFilters(defaultFilters);
    const restored = archived ? { ...saved, category:'design', activeOnly:false } : saved;
    setFilters(postId && selected && !matchesFilters(selected, restored) ? allFilters : restored);
    if (!['feed', 'mine'].includes(view)) return;
    const mobile = centered || window.matchMedia('(max-width: 900px)').matches;
    const previous = history.state?.bidListReturn;
    if (previous?.view === view) {
      const frame = requestAnimationFrame(() => {
        const button = Array.from(list.current?.querySelectorAll('[data-post]') ?? []).find(row => row.dataset.post === previous.id);
        if (mobile && postId) detail.current?.focus({ preventScroll: true });
        else button?.focus({ preventScroll: true });
        if (!mobile) detail.current?.scrollTo(0, previous.detailY ?? 0);
        window.scrollTo({ top:previous.y, behavior:'instant' });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (postId && mobile) {
      detail.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else if (postId) detail.current?.scrollTo(0, 0);
  }, [view, postId, defaultFilters, archived, historyVisit]);
  function rememberFilters(next, extra = {}) {
    history.replaceState({ ...history.state, ...extra, bidMarketFilters: next }, '');
  }
  function updateFilters(changes) {
    if (postId) {
      if (onChoosePost) onChoosePost(null);
      else onView(view);
    }
    const next = { ...filters, ...changes };
    rememberFilters(next, { bidListReturn:null });
    setFilters(next);
  }
  const choose = id => {
    if (id === postId) { detail.current?.scrollTo(0, 0); return; }
    rememberFilters(filters, { bidListReturn: { id, view, y: window.scrollY, detailY: detail.current?.scrollTop ?? 0 } });
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
  const afterPost = id => { setNotice(isDemo ? '테스트 공고 심사를 요청했습니다.' : '공고 심사를 요청했습니다. 승인 후 공개됩니다.'); onView('mine/' + id); };
  const afterWithdraw = () => { setNotice('공고를 삭제했습니다.'); if (!mine && selected) onView('mine/' + selected.id); };
  const sent = () => setNotice('입찰 심사를 요청했습니다. 승인 후 브랜드에 전달됩니다.');
  if (view === 'new' && brand) return <NewPostFlow key={user.id} user={user} posts={posts} isDemo={isDemo} mutate={mutate} onDone={afterPost} onCancel={() => onView('feed')} />;
  if ((mine && !user) || (view === 'new' && !brand)) return <section className="bm"><div className="bm-empty">
    <h1>{view === 'new' ? '브랜드 회원 전용입니다' : '로그인이 필요합니다'}</h1>
    <button type="button" className="bm-primary" onClick={user ? () => onView('feed') : onLogin}>{user ? '제작 공고' : '로그인'} <ArrowRight size={15} /></button></div></section>;
  return <section className={`bm${postId?' bm-reading':''}${centered?' bm-centered':''}`}>
    <BoardHeader mine={mine} posts={scope} brand={brand} archived={archived} onNew={() => onView('new')} />
    <div className="bm-toolbar">{archived ? <span className="bm-kind">이전 의뢰 · 열람 전용</span> : <span className="bm-kind">패키징 제작</span>}<label className="bm-search"><MagnifyingGlass size={16}/><input aria-label="공고 검색" value={query} onChange={e => updateFilters({query:e.target.value})} placeholder="공고명·제작 조건 검색" />{query && <button type="button" onClick={() => updateFilters({query:''})} aria-label="검색어 지우기"><X size={14}/></button>}</label></div>
    <div className="bm-layout">
      <section className="bm-ledger" aria-label="공고 목록" ref={list}>
        <div className="bm-ledger-head"><h2>{mine ? (brand ? '내 발주 공고' : '입찰한 공고') : '공고 목록'} <span>{rows.length}</span></h2><div>
          {!archived && <label className="bm-active-toggle"><input type="checkbox" checked={activeOnly} onChange={e => updateFilters({activeOnly:e.target.checked})} />접수 중만</label>}
          {mine && brand && scope.some(p=>p.reviewStatus==='withdrawn') && <label className="bm-active-toggle"><input type="checkbox" checked={Boolean(filters.includeRemoved)} onChange={e => updateFilters({includeRemoved:e.target.checked})} />삭제한 공고 포함</label>}
          <span className="bm-sort"><ArrowDown size={12}/>최신순</span></div></div>
        {rows.length > 0 ? <div className="bm-rows">{rows.map(post => <button className={`bm-row ${selected?.id === post.id ? 'is-current' : ''}`} type="button" key={post.id}
          data-post={post.id} aria-current={post.id === postId ? 'true' : undefined} onClick={() => choose(post.id)}>
          <ProductIcon post={post} /><span className="bm-row-text">{rowTime(post) && <span className="bm-row-meta"><time dateTime={rowTime(post)}>{elapsed(rowTime(post))} 등록</time></span>}
          <strong>{post.title}</strong>{post.reviewStatus!=='withdrawn' && <span className="bm-row-figures">{requestedQuantity(post.quantity)} <i/> {requestedPrice(post.unitPrice)}</span>}</span>
          <span className="bm-row-right"><span className={acceptsProposals(post) && daysLeft(post) <= 2 ? 'urgent' : ''}>{statusText(post, archived)}</span>{isPublicPost(post) && <small>입찰 {post.offerCount ?? 0}건</small>}</span>
        </button>)}</div> :
          <div className="bm-empty"><ListMagnifyingGlass size={34} weight="light"/><h3>{scope.length ? '조건에 맞는 공고가 없습니다' : mine ? (brand ? '아직 등록한 공고가 없습니다' : '아직 입찰한 공고가 없습니다') : '아직 등록된 공고가 없습니다'}</h3>
            <p>{scope.length ? '검색어나 분야를 바꾸어 보세요.' : mine ? (brand ? '첫 발주 조건을 등록해 보세요.' : '파트너를 찾는 브랜드의 공고를 살펴보세요.') : '브랜드가 공고를 등록하면 이곳에 표시됩니다.'}</p>
            {scope.length ? <button type="button" className="bm-secondary" onClick={() => updateFilters(allFilters)}>조건 초기화</button> : mine && <button type="button" className="bm-secondary" onClick={() => onView(brand ? 'new' : 'feed')}>{brand ? '공고 등록' : archived ? '이전 의뢰 보기' : '제작 공고'}</button>}</div>}
      </section>
      <aside className="bm-side" tabIndex={-1} ref={detail}>
        {postId && <button type="button" className="bm-back" onClick={returnToList}><ArrowLeft size={15}/> 공고 목록</button>}
        {selected ? <PostDetail key={selected.id} post={selected} offers={offers.filter(o => o.postId === selected.id)} selectedOfferId={selectedAward?.offerId} user={user} mutate={mutate} onSelect={onSelect} onSignup={() => onView('signup')} onSent={sent} onWithdrawn={afterWithdraw} isDemo={isDemo} reviewRoomKey={reviewRoomKey} /> :
          <div className={postId ? 'bm-idle bm-missing' : 'bm-idle'}><Radio size={31} weight="light"/><strong>{postId ? '공고를 찾을 수 없습니다' : '공고 상세'}</strong><p>목록에서 공고를 선택하면 수량, 단가와 제작 조건을 확인할 수 있어요.</p></div>}
      </aside>
    </div>
    <div role="status" aria-live="polite" className={notice ? 'bm-notice' : 'bm-silent'}>{notice && <><Bell size={16} />{notice}</>}</div>
  </section>;
}
