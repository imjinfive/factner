import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Package, Factory, Storefront, Gift, Stack, MapPin, Check, CheckCircle } from '@phosphor-icons/react';
import { api } from './api';
import { MATCH_CATEGORIES, MATCH_CAPACITIES } from './matching-preview.js';
import { matchingFromHistory } from './navigation.js';
import ReviewConfirm from './ReviewConfirm';
import './matching-flow.css';

const categoryIcons = { box: Package, packaging: Gift, supplies: Stack };
const spring = { type: 'spring', stiffness: 360, damping: 28 };

export default function MatchingFlow({ Button, onSignup, onAccount, member, authLoading = false, active = true }) {
  const reduced = useReducedMotion();
  const [flow, setFlow] = useState(() => matchingFromHistory(history.state, member));
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef(null);
  const { stage, form } = flow;
  const isBrand = form.role === 'brand';
  const category = MATCH_CATEGORIES.find(item => item.value === form.category)?.label;
  const capacity = MATCH_CAPACITIES.find(item => item.value === form.capacity)?.label;
  const showingCandidates = stage === 'results' || stage === 'review';
  const selectedCandidates = candidates.filter(item => flow.selected.includes(item.id));

  useEffect(() => {
    if (!active || authLoading) return;
    const restored = matchingFromHistory(history.state, member);
    history.replaceState({ ...history.state, matching: restored }, '', location.href);
    setFlow(restored);
  }, [active, authLoading, member?.id, member?.role]);

  useEffect(() => {
    const restore = () => {
      if (history.state?.factnerPage !== 'request' || authLoading) return;
      setFlow(matchingFromHistory(history.state, member));
      setSubmitError('');
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [member?.id, member?.role, authLoading]);

  useEffect(() => {
    if (!active || stage === 'review') return;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage, active]);

  useEffect(() => {
    if (!active || authLoading || !member || !showingCandidates) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setCandidates([]);
    const params = new URLSearchParams({ category: form.category });
    if (member.role === 'supplier') params.set('capacity', form.capacity);
    api(`matching/candidates?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setCandidates(data.candidates); })
      .catch(problem => { if (!controller.signal.aborted) setError(problem.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, authLoading, member?.id, member?.role, showingCandidates, form.category, form.capacity, retry]);

  function save(next, push = false) {
    const current = { ...next, memberId: member?.id || null, form: { ...next.form, role: member?.role || next.form.role } };
    history[push ? 'pushState' : 'replaceState']({ ...history.state, factnerPage: 'request', matching: current }, '', location.href);
    setFlow(current);
    setSubmitError('');
  }
  function update(key, value) {
    save({ ...flow, form: { ...form, [key]: value }, selected: [] });
  }
  function find(event) {
    event.preventDefault();
    if (!member) {
      onSignup({ role: form.role, category: form.category, region: 'all' });
      return;
    }
    save({ ...flow, stage: 'results', depth: 1, selected: [] }, true);
  }
  function changeConditions() {
    if (flow.depth === 1) history.back();
    else save({ ...flow, stage: 'form', depth: 0, selected: [] });
  }
  function toggle(id) {
    save({ ...flow, selected: flow.selected.includes(id) ? flow.selected.filter(value => value !== id) : [...flow.selected, id] });
  }
  async function submit() {
    if (busy || !selectedCandidates.length) return;
    setBusy(true);
    setSubmitError('');
    const request = { candidateIds: selectedCandidates.map(item => item.id), candidateVersions: Object.fromEntries(selectedCandidates.map(item => [item.id, item.version])), category: form.category, confirmed: true };
    if (!isBrand) request.capacity = form.capacity;
    try {
      await api('matching/requests', { method: 'POST', body: JSON.stringify(request) });
      // A browser Back action may have left the review while the request was in flight.
      if (history.state?.factnerPage === 'request' && history.state?.matching?.stage === 'review') {
        save({ ...flow, stage: 'submitted', selected: request.candidateIds });
      }
    } catch (problem) {
      setSubmitError(problem.message);
    } finally {
      setBusy(false);
    }
  }
  const title = stage === 'form'
    ? member ? isBrand ? '우리 브랜드에 맞는 제작 업체 찾기' : '함께할 브랜드 찾기' : '가입 후 맞는 파트너를 찾아보세요'
    : stage === 'submitted' ? '운영팀에 연결 요청을 보냈어요'
    : `이런 ${isBrand ? '제작 업체' : '브랜드'}를 만나보세요`;

  return <section className="match-shell" aria-labelledby="matching-title">
    <div className="match-topline"><span>파트너 찾기</span>{member && <span>{isBrand ? '제작 업체 찾기' : '브랜드 찾기'}</span>}</div>
    {showingCandidates && <button type="button" className="match-back" onClick={changeConditions}><ArrowLeft size={23} weight="bold" />조건 바꾸기<span>이전 단계로</span></button>}
    <header className="match-heading"><h1 ref={heading} id="matching-title" tabIndex={-1}>{title}</h1>
      {stage === 'form' && <p>{member ? '품목을 선택하면 운영팀이 등록한 파트너 정보를 볼 수 있어요. 지역 제한은 없어요.' : '가입 신청 후 운영팀 검증과 승인이 완료되면 실제 후보를 확인할 수 있어요.'}</p>}
      {showingCandidates && <p>원하는 후보를 여러 곳 선택하세요. 운영팀이 조건을 확인하고 연결을 진행해요.</p>}
    </header>

    {stage === 'form' && <form className="match-form" onSubmit={find}>
      {!member && <fieldset disabled={authLoading}><legend>어느 쪽이신가요?</legend><div className="match-role-grid">{[
        ['brand', '브랜드', '우리 제품에 맞는 제작 업체가 필요해요', Storefront],
        ['supplier', '패키징 제작 업체', '함께할 브랜드를 찾고 있어요', Factory],
      ].map(([value, label, detail, Icon]) => <label className={`match-choice match-role ${form.role === value ? 'is-selected' : ''}`} key={value}>
        <input type="radio" name="role" value={value} checked={form.role === value} onChange={() => update('role', value)} required />
        <span className="match-symbol"><Icon size={32} weight="duotone" /></span><strong>{label}</strong><span>{detail}</span><span className="match-check"><Check size={17} weight="bold" /></span>
      </label>)}</div></fieldset>}
      {form.role && <motion.div initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <fieldset><legend>{isBrand ? '무엇이 필요한가요?' : '어떤 품목을 제작하시나요?'}</legend><div className="match-category-grid">{MATCH_CATEGORIES.map(item => { const Icon = categoryIcons[item.value]; return <label className={`match-choice match-category ${form.category === item.value ? 'is-selected' : ''}`} key={item.value}>
          <input type="radio" name="category" value={item.value} checked={form.category === item.value} onChange={() => update('category', item.value)} required /><Icon size={30} weight="duotone" /><strong>{item.label}</strong><span>{item.detail}</span><span className="match-check"><Check size={17} weight="bold" /></span>
        </label>; })}</div></fieldset>
        {!isBrand && <label className="match-field match-capacity"><span>월 제작 가능 수량</span><select value={form.capacity} onChange={event => update('capacity', event.target.value)}>{MATCH_CAPACITIES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>}
      </motion.div>}
      <div className="match-form-bottom"><p>{member ? '등록된 실제 자료로 후보를 안내해요.' : '이미 가입하셨다면 로그인해주세요.'}</p><div className="match-actions">{!member && <Button tone="secondary" onClick={onAccount}>로그인</Button>}<Button type="submit" disabled={authLoading || !form.role || !form.category}>{member ? '후보 확인하기' : '가입 신청하기'} <ArrowRight size={21} /></Button></div></div>
    </form>}

    {showingCandidates && <>
      <div className="match-filter-summary"><span><Package size={19} />{category}</span><span><MapPin size={19} />지역 무관</span>{!isBrand && <span>월 {capacity}</span>}</div>
      {loading && <p className="match-empty" role="status">등록된 파트너를 확인하고 있어요.</p>}
      {error && <div className="match-empty" role="alert"><p>{error}</p><Button onClick={() => setRetry(value => value + 1)}>다시 불러오기</Button></div>}
      {!loading && !error && !candidates.length && <div className="match-empty"><Package size={40} /><h2>등록된 후보가 아직 없어요</h2><p>운영팀이 업체 정보를 확인하고 등록하면 이곳에서 선택할 수 있어요.</p></div>}
      {!loading && !error && <div className="match-results">{candidates.map((candidate, index) => {
        const selected = flow.selected.includes(candidate.id);
        return <motion.button type="button" className={`match-candidate ${selected ? 'is-selected' : ''}`} key={candidate.id} aria-pressed={selected} onClick={() => toggle(candidate.id)} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduced ? 0 : Math.min(index, 5) * .04 }}>
          <span className="match-symbol">{isBrand ? <Factory size={28} /> : <Storefront size={28} />}</span>
          <div className="match-candidate-description"><h2>{candidate.label}</h2><p className="match-candidate-title">{candidate.title}</p>{candidate.note && <p className="match-candidate-note">{candidate.note}</p>}</div>
          <dl><div><dt>{isBrand ? '최소 제작' : '예상 발주'}</dt><dd>{candidate.quantity || '운영팀 확인 중'}</dd></div><div><dt>{isBrand ? '생산 희망 기간' : '납품 방식'}</dt><dd>{candidate.schedule || '운영팀 확인 중'}</dd></div></dl>
          <span className="match-select-label"><span className="match-check"><Check size={17} weight="bold" /></span>{selected ? '선택됨' : '선택'}</span>
        </motion.button>;
      })}</div>}
      {!!candidates.length && !loading && !error && <div className="match-result-bottom"><div><p aria-live="polite">{selectedCandidates.length ? `${selectedCandidates.length}곳을 선택했어요` : '원하는 후보를 모두 선택해주세요'}</p><p className="match-signup-note">요청 후 운영팀 확인을 거쳐 거래가 연결돼요.</p></div><Button disabled={!selectedCandidates.length || busy} onClick={() => save({ ...flow, stage: 'review', depth: 2 }, true)}>선택한 {selectedCandidates.length}곳 연결 요청 <ArrowRight size={21} /></Button></div>}
    </>}

    {stage === 'submitted' && <div className="match-empty match-success"><CheckCircle size={52} weight="duotone" /><p>선택한 {flow.selected.length}곳의 연결 요청이 접수됐어요.<br />운영팀에서 확인하고 안내해드릴게요.</p><Button onClick={onAccount}>마이페이지에서 확인 <ArrowRight size={21} /></Button></div>}

    <ReviewConfirm open={active && stage === 'review' && !loading && !error && !!selectedCandidates.length} onCancel={() => history.back()} onConfirm={submit} busy={busy} error={submitError} title="연결 요청 내용을 다시 확인해주세요" confirmLabel="확인하고 연결 요청">
      <dl className="match-review"><div><dt>찾는 파트너</dt><dd>{isBrand ? '패키징 제작 업체' : '브랜드'}</dd></div><div><dt>품목</dt><dd>{category}</dd></div><div><dt>지역</dt><dd>지역 무관</dd></div>{!isBrand && <div><dt>월 제작 가능 수량</dt><dd>{capacity}</dd></div>}<div><dt>선택한 후보</dt><dd>{selectedCandidates.map(item => item.label).join(', ')} · {selectedCandidates.length}곳</dd></div></dl>
      <p>운영팀이 아래 후보와 조건을 확인해요. 요청만으로 거래가 시작되거나 비용이 청구되지는 않아요.</p>
      {selectedCandidates.map(candidate => <div className="match-review-candidate" key={candidate.id}><strong>{candidate.label} · {candidate.title}</strong><dl className="match-review"><div><dt>{isBrand ? '최소 제작' : '예상 발주'}</dt><dd>{candidate.quantity || '운영팀 확인 중'}</dd></div><div><dt>{isBrand ? '생산 희망 기간' : '납품 방식'}</dt><dd>{candidate.schedule || '운영팀 확인 중'}</dd></div></dl>{candidate.note && <p>{candidate.note}</p>}</div>)}
      {submitError && <Button tone="secondary" onClick={() => { history.back(); setRetry(value => value + 1); }}>최신 후보 정보 다시 확인</Button>}
    </ReviewConfirm>
  </section>;
}
