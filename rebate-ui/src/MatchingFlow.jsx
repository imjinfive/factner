import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Package, Factory, Storefront, Gift, Stack, MapPin, Check } from '@phosphor-icons/react';
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
  };
  const signup = () => onSignup({ role: form.role, category: form.category, region: form.region, candidate: selected });
  const title = {
    form: '어떤 파트너를 찾고 있나요?',
    matching: '조건에 맞는 예시를 찾고 있어요',
    results: candidates.length ? `${isBrand ? '이런 제작 업체' : '이런 브랜드'}를 만나보세요` : '조건에 맞는 예시가 없어요',
  }[stage];

  return <section className="match-shell" aria-labelledby="matching-title">
    <div className="match-topline"><span>견적 문의</span><span className="match-test-tag">테스트 미리보기</span></div>
    {stage !== 'form' && <button type="button" className="match-back" onClick={() => setStage('form')}><ArrowLeft size={20} />조건 바꾸기</button>}
    <header className="match-heading"><h1 ref={heading} id="matching-title" tabIndex={-1}>{title}</h1>
      {stage === 'form' && <p>품목과 지역만 알려주세요.</p>}
      {stage === 'results' && <p>{candidates.length ? '익명 예시 후보예요. 실제 연결 전 사양과 납기를 확인해요.' : '지역이나 제작 가능 수량을 바꿔보세요.'}</p>}
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
      {!!candidates.length && <div className="match-result-bottom"><div><p aria-live="polite">{selected ? `${selected.label}를 선택했어요` : '마음에 드는 후보를 선택해주세요'}</p><p className="match-signup-note">{member ? '실제 연결은 운영팀의 확인 후 진행됩니다.' : '운영팀 확인 후 승인되면 이용할 수 있어요.'}</p></div><Button disabled={!selected} onClick={signup}>{member ? '마이페이지로 이동' : '가입하기'} <ArrowRight size={21} /></Button></div>}
      <p className="match-footnote">모든 후보는 가상 데이터입니다. 실제 계약·견적이 아니에요.</p>
    </>}
  </section>;
}
