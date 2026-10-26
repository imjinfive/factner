import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Package, Factory, Storefront, Gift, Stack, MapPin, Check, Phone, UserCircle, CreditCard, Bank, Sparkle } from '@phosphor-icons/react';
import { formatInput, formatPhone } from '../../admin-ui/input-format.js';
import { MATCH_CATEGORIES, MATCH_REGIONS, MATCH_CAPACITIES, getMatchingPreview } from './matching-preview.js';
import './matching-flow.css';

const categoryIcons = { box: Package, packaging: Gift, supplies: Stack };
const spring = { type: 'spring', stiffness: 360, damping: 28 };

export default function MatchingFlow({ Button, onSignup, member, active = true }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState('form');
  const [form, setForm] = useState({ role: member?.role || '', category: '', region: 'all', capacity: '30000' });
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [contact, setContact] = useState({ name: '', phone: '', time: '' });
  const [method, setMethod] = useState('card');
  const [paymentPreview, setPaymentPreview] = useState(false);
  const heading = useRef(null);
  const firstRender = useRef(true);
  const isBrand = form.role === 'brand';
  const category = MATCH_CATEGORIES.find(item => item.value === form.category)?.label;
  const region = MATCH_REGIONS.find(item => item.value === form.region)?.label;

  useEffect(() => {
    if (!active) return;
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage, reduced, active]);

  useEffect(() => {
    if (stage !== 'matching') return;
    const timer = setTimeout(() => {
      setCandidates(getMatchingPreview(form));
      setStage('results');
    }, reduced ? 50 : 1300);
    return () => clearTimeout(timer);
  }, [stage, form, reduced]);

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setCandidates([]);
    setSelected(null);
    setPaymentPreview(false);
  };
  const back = () => setStage(stage === 'results' || stage === 'matching' ? 'form' : stage === 'join' ? 'results' : stage === 'contact-preview' ? 'contact' : 'join');
  const signup = () => onSignup({ role: form.role, category: form.category, region: form.region, candidate: selected });
  const title = {
    form: '어떤 파트너를 찾고 있나요?',
    matching: '조건에 맞는 예시를 찾고 있어요',
    results: candidates.length ? `${isBrand ? '이런 제작 업체' : '이런 브랜드'}를 만나보세요` : '조건에 맞는 예시가 없어요',
    join: '다음은 어떻게 진행할까요?',
    contact: '담당자와 이야기해보세요',
    'contact-preview': '상담 신청 미리보기',
    payment: '이용료 안내',
  }[stage];
  const selectionSummary = selected && <div className="match-selected"><span className="match-symbol">{isBrand ? <Factory size={26} /> : <Storefront size={26} />}</span><div><strong>{selected.label} <span>· {selected.title}</span></strong><p>{selected.region} · {selected.category}</p></div><span className="match-demo-label">예시</span></div>;

  return <section className="match-shell" aria-labelledby="matching-title">
    <div className="match-topline"><span>견적 문의</span><span className="match-test-tag">테스트 미리보기</span></div>
    {stage !== 'form' && <button type="button" className="match-back" onClick={back}><ArrowLeft size={20} />{stage === 'results' || stage === 'matching' ? '조건 바꾸기' : '이전으로'}</button>}
    <header className="match-heading"><h1 ref={heading} id="matching-title" tabIndex={-1}>{title}</h1>
      {stage === 'form' && <p>품목과 지역만 알려주세요.</p>}
      {stage === 'results' && <p>{candidates.length ? '익명 예시 후보예요. 실제 연결 전 사양과 납기를 확인해요.' : '지역이나 제작 가능 수량을 바꿔보세요.'}</p>}
      {stage === 'join' && <p>가입 심사 후 이용료를 안내하고, 실제 매칭을 진행해요. 현재는 테스트 중입니다.</p>}
    </header>

    {stage === 'form' && <form className="match-form" onSubmit={event => { event.preventDefault(); setSelected(null); setStage('matching'); }}>
      <fieldset><legend>어느 쪽이신가요?</legend><div className="match-role-grid">{[
        ['brand', '브랜드', '우리 제품에 맞는 제작 업체가 필요해요', Storefront],
        ['supplier', '패키징 제작 업체', '함께할 브랜드를 찾고 있어요', Factory],
      ].map(([value, label, detail, Icon]) => <label className={`match-choice match-role ${form.role === value ? 'is-selected' : ''}`} key={value}>
        <input type="radio" name="role" value={value} checked={form.role === value} onChange={() => update('role', value)} required />
        <span className="match-symbol"><Icon size={32} weight="duotone" /></span><strong>{label}</strong><span>{detail}</span><span className="match-check"><Check size={17} weight="bold" /></span>
      </label>)}</div></fieldset>
      {form.role && <motion.div initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <fieldset><legend>{isBrand ? '무엇이 필요한가요?' : '어떤 품목을 제작하시나요?'}</legend><div className="match-category-grid">{MATCH_CATEGORIES.map(item => { const Icon = categoryIcons[item.value]; return <label className={`match-choice match-category ${form.category === item.value ? 'is-selected' : ''}`} key={item.value}>
          <input type="radio" name="category" value={item.value} checked={form.category === item.value} onChange={() => update('category', item.value)} required /><Icon size={30} weight="duotone" /><strong>{item.label}</strong><span>{item.detail}</span><span className="match-check"><Check size={17} weight="bold" /></span>
        </label>; })}</div></fieldset>
        <div className="match-field-grid"><label className="match-field"><span>{isBrand ? '희망 업체 지역' : '희망 브랜드 지역'}</span><select value={form.region} onChange={event => update('region', event.target.value)}>{MATCH_REGIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          {!isBrand && <label className="match-field"><span>월 제작 가능 수량</span><select value={form.capacity} onChange={event => update('capacity', event.target.value)}>{MATCH_CAPACITIES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>}
        </div>
      </motion.div>}
      <div className="match-form-bottom"><p>가입 전에 예시 후보를 확인할 수 있어요.</p><Button type="submit" disabled={!form.role || !form.category}>후보 확인하기 <ArrowRight size={21} /></Button></div>
    </form>}

    {stage === 'matching' && <div className="match-loading" role="status"><div className="match-loading-cards" aria-hidden="true">{[0, 1, 2].map(index => <motion.div key={index} initial={reduced ? false : { opacity: 0, y: 28, rotate: (index - 1) * 12 }} animate={{ opacity: 1, y: 0, rotate: (index - 1) * 6 }} transition={{ ...spring, delay: reduced ? 0 : index * .18 }}><Package size={40} weight="duotone" /><span /><span /></motion.div>)}</div><p>{category} · {region}</p><span className="sr-only">잠시 후 예시 후보가 표시됩니다.</span></div>}

    {stage === 'results' && <>
      <div className="match-filter-summary"><span><Package size={19} />{category}</span><span><MapPin size={19} />{region}</span>{!isBrand && <span>월 {MATCH_CAPACITIES.find(item => item.value === form.capacity)?.label}</span>}</div>
      <div className="match-results">{candidates.map((candidate, index) => <motion.button type="button" className={`match-candidate ${selected?.id === candidate.id ? 'is-selected' : ''}`} key={candidate.id} aria-pressed={selected?.id === candidate.id} onClick={() => setSelected(candidate)} initial={reduced ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} whileTap={reduced ? {} : { scale: .98 }} transition={{ ...spring, delay: reduced ? 0 : index * .06 }}>
        <div className="match-candidate-top"><span className="match-symbol">{isBrand ? <Factory size={26} /> : <Storefront size={26} />}</span><span className="match-check"><Check size={17} weight="bold" /></span></div>
        <h2>{candidate.label}</h2><p className="match-candidate-title">{candidate.title}</p><div className="match-candidate-region"><MapPin size={18} />{candidate.region}</div>
        <dl><div><dt>{isBrand ? '최소 제작' : '예상 발주'}</dt><dd>{candidate.quantity}</dd></div><div><dt>{isBrand ? '제작 기간' : '납품 방식'}</dt><dd>{candidate.schedule}</dd></div></dl><p className="match-candidate-note">{candidate.note}</p>
      </motion.button>)}</div>
      {!!candidates.length && <div className="match-result-bottom"><p aria-live="polite">{selected ? `${selected.label}를 선택했어요` : '마음에 드는 후보를 선택해주세요'}</p><Button disabled={!selected} onClick={() => setStage('join')}>매칭 진행하기 <ArrowRight size={21} /></Button></div>}
      <p className="match-footnote">모든 후보는 가상 데이터입니다. 실제 계약·견적이 아니에요.</p>
    </>}

    {stage === 'join' && <div className="match-narrow">{selectionSummary}<div className="match-join-options">
      <button className="match-join-option" type="button" onClick={signup}><span className="match-symbol"><UserCircle size={30} /></span><span><strong>{member ? '내 계정으로 이어가기' : '바로 가입하기'}</strong><span>{member ? '마이페이지에서 계속 진행해요' : '가입 신청 후 심사를 진행해요'}</span></span><ArrowRight size={23} /></button>
      <button className="match-join-option" type="button" onClick={() => setStage('contact')}><span className="match-symbol"><Phone size={28} /></span><span><strong>담당자 연결</strong><span>상담 신청 화면을 확인해보세요</span></span><ArrowRight size={23} /></button>
    </div><button type="button" className="match-text-button" onClick={() => setStage('payment')}>이용료 안내 <ArrowRight size={18} /></button><p className="match-footnote">가입 승인이 실제 업체 연결이나 계약을 보장하지는 않아요.</p></div>}

    {stage === 'contact' && <div className="match-narrow">{selectionSummary}<p className="match-notice">화면 확인용입니다. 입력 내용은 전송되지 않아요.</p><form className="match-contact-form" onSubmit={event => { event.preventDefault(); setStage('contact-preview'); }}>
      <label className="match-field"><span>담당자 이름</span><input value={contact.name} onChange={event => setContact(current => ({ ...current, name: event.target.value }))} autoComplete="name" maxLength={40} required placeholder="이름을 입력해주세요" /></label>
      <label className="match-field"><span>연락처</span><input type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onInput={event => formatInput(event, formatPhone)} onChange={event => setContact(current => ({ ...current, phone: event.target.value }))} pattern="0[0-9-]{8,14}" title="지역번호를 포함한 전화번호를 입력해주세요." maxLength={15} required placeholder="010-0000-0000" /></label>
      <label className="match-field"><span>연락 가능한 시간 <em>선택</em></span><select value={contact.time} onChange={event => setContact(current => ({ ...current, time: event.target.value }))}><option value="">언제든 괜찮아요</option><option>평일 오전 9시~12시</option><option>평일 오후 1시~3시</option><option>평일 오후 3시~6시</option></select></label>
      <Button type="submit">상담 신청 미리보기 <ArrowRight size={20} /></Button>
    </form></div>}

    {stage === 'contact-preview' && <div className="match-narrow">{selectionSummary}<div className="match-preview-card"><dl><div><dt>담당자</dt><dd>{contact.name}</dd></div><div><dt>연락처</dt><dd>{contact.phone}</dd></div><div><dt>연락 시간</dt><dd>{contact.time || '언제든 괜찮아요'}</dd></div></dl><p className="match-notice">미리보기만 표시했어요. 상담은 접수되지 않았습니다.</p><Button tone="secondary" onClick={() => setStage('contact')}>내용 수정</Button></div></div>}

    {stage === 'payment' && <div className="match-narrow"><div className="match-price-card"><span className="match-symbol"><Sparkle size={30} /></span><h2>일회성 매칭 이용료</h2><strong>금액 확정 전</strong><p>서비스 범위와 결제 시점은 정해지는 대로 안내해요.</p></div><fieldset className="match-payment-method"><legend>결제 수단</legend><div className="match-payment-grid">{[['card', '카드', CreditCard], ['transfer', '계좌이체', Bank]].map(([value, label, Icon]) => <label key={value} className={`match-choice ${method === value ? 'is-selected' : ''}`}><input type="radio" name="payment" value={value} checked={method === value} onChange={() => { setMethod(value); setPaymentPreview(false); }} /><Icon size={26} /><strong>{label}</strong><span className="match-check"><Check size={17} weight="bold" /></span></label>)}</div></fieldset><Button onClick={() => setPaymentPreview(true)}>결제 화면 미리보기</Button>{paymentPreview && <p className="match-notice" role="status">{method === 'card' ? '카드' : '계좌이체'} 결제 시안입니다. 결제 정보 입력과 실제 청구는 진행되지 않습니다.</p>}<p className="match-footnote">현재는 화면 확인만 가능합니다.</p></div>}
  </section>;
}
