import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle, Circle, FileText, X } from '@phosphor-icons/react';
import { BID_TERMS } from '../../../shared/bid-terms.js';
import ReviewConfirm from '../ReviewConfirm';
import './deal.css';

const number = new Intl.NumberFormat('ko-KR');
const won = value => `${number.format(value)}원`;
const statusLabels = {
  awaiting_supplier: '제작업체 서명 대기',
  signed: '관리자 소개 대기',
  revealed: '거래 상대 공개'
};

function day(value) {
  if (!value) return '대기';
  return new Date(value).toLocaleDateString('ko-KR');
}

function PriceSummary({ quantity, unitPrice }) {
  return <dl className="fd-price">
    <div><dt>선택 수량</dt><dd>{number.format(quantity)}개</dd></div>
    <div><dt>개당 제안가</dt><dd>{won(unitPrice)}</dd></div>
    <div><dt>제작 소계</dt><dd>{won(quantity * unitPrice)}</dd></div>
  </dl>;
}

function Terms({ terms }) {
  return <div className="fd-terms">
    <strong>동의할 주요 내용</strong>
    <p>{terms.summary}</p>
    {terms.highlights?.length > 0 && <ul>{terms.highlights.map(line => <li key={line}>{line}</li>)}</ul>}
    <details><summary>1차 참여계약 전문 · {terms.sections.length}개 조항</summary>
      {terms.sections.map(section => <section key={section.title}>
        <h4>{section.title}</h4><p>{section.text}</p>
      </section>)}
      <small>문서 버전 {terms.version}</small>
    </details>
  </div>;
}

function ActionDialog({ title, description, children, review, canReview = true, recordLabel, onRecord, onClose, onComplete }) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (!canReview || lock.current) return;
    setError('');
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    let result;
    try {
      result = await onRecord();
    } catch (e) {
      setError(e?.message || '기록하지 못했습니다. 현재 상태를 확인하고 다시 시도해주세요.');
      return;
    } finally {
      lock.current = false;
      setBusy(false);
    }
    onClose();
    onComplete?.(result);
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !lock.current) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="modal-overlay"/>
      <Dialog.Content className="modal fd-dialog" onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => { if (lock.current) e.preventDefault(); }}>
        <header className="modal-heading"><div><span className="fd-kicker">테스트 거래</span><Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description></div>
          <Dialog.Close asChild><button type="button" className="button ghost icon-button" aria-label="거래 창 닫기" disabled={busy}>
            <X size={21} aria-hidden="true"/></button></Dialog.Close></header>
        <form onSubmit={submit}>
          <div className="fd-body">{reviewing ? <>
            <h3 tabIndex={-1} ref={node => node?.focus()}>기록 전 마지막 확인</h3>{review}
          </> : children}</div>
          {error && <p className="fd-error" role="alert">{error}</p>}
          <footer className="fd-actions">
            <button type="button" className="button outline" disabled={busy} onClick={() => { if (reviewing) setReviewing(false); else onClose(); }}>
              {reviewing ? '돌아가서 수정' : '닫기'}
            </button>
            <button type="submit" className="button primary" disabled={busy || !canReview}>
              {busy ? '기록 중…' : reviewing ? recordLabel : '입력 내용 확인'}
            </button>
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function SignatureDialog({ title, subject, tier, user, terms, offer, onRecord, onClose, onComplete }) {
  const [signature, setSignature] = useState('');
  const [accepted, setAccepted] = useState(false);
  return <ActionDialog title={title} description="브랜드와 제작업체가 차례로 서명하는 1차 참여계약입니다. 법률 검토 전 초안이며 테스트 이름을 입력해주세요."
    canReview={accepted && signature.trim().length > 0}
    recordLabel="테스트 서명 기록" onClose={onClose} onComplete={onComplete}
    onRecord={() => onRecord({ signature: signature.trim(), accepted: true, version: terms.version })}
    review={<><p><strong>{subject}</strong></p><PriceSummary {...tier}/>
      <p>{user.name} 계정으로 <strong>{signature.trim()}</strong>의 테스트 서명을 기록합니다.</p>
      {offer?.note && <p>견적 조건 · {offer.note}</p>}
      <p>문서 {terms.version} · 실제 청구 0원</p>
      <p>양측 서명 후에도 관리자가 소개를 승인해야 거래 상대가 공개됩니다.</p></>}>
    <p className="fd-subject">{subject}</p><PriceSummary {...tier}/>
    {offer?.note && <p>견적 조건 · {offer.note}</p>}<Terms terms={terms}/>
    <label className="fd-input">서명자 이름 · 가명 사용
      <input required maxLength={60} autoComplete="off" value={signature} onChange={e => setSignature(e.target.value)} placeholder="테스트 담당자"/>
    </label>
    <label className="fd-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>
      <span>소개 거래의 플랫폼 이용, 비용, 특정 거래 점검과 소명 절차를 포함한 1차 참여계약 초안을 읽고 테스트 서명에 동의합니다.</span>
    </label>
  </ActionDialog>;
}

export function SelectDialog({ offer, post, tier, user, mutate, onClose, onComplete }) {
  if (!offer || !post || !tier || user?.kind !== 'brand') return null;
  return <SignatureDialog title="제안 선택과 브랜드 서명" subject={`${post.title} · ${offer.alias}`} tier={tier}
    user={user} terms={BID_TERMS} offer={offer} onClose={onClose} onComplete={onComplete}
    onRecord={fields => mutate(`/offers/${offer.id}/select`, { ...fields, quantity: tier.quantity })}/>;
}

export function ConnectionDialog({offer,post,tier,mutate,onClose,onComplete}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  async function submit(){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      await mutate('/offers/'+offer.id+'/select',{quantity:tier.quantity,accepted:true});
      onComplete();
    }catch(e){setError(e.message);}
    finally{lock.current=false;setBusy(false);}
  }
  return <ReviewConfirm open busy={busy} error={error} title="이 입찰로 매칭을 요청할까요?" confirmLabel="매칭 요청" onCancel={onClose} onConfirm={submit}>
    <p><strong>{post.title}</strong> · {offer.alias}</p><PriceSummary {...tier}/>
    <p>한 공고에서는 한 업체만 선택할 수 있습니다. 운영팀이 양측에 전화해 조건과 약관을 안내하고 거래 의사를 확인한 뒤 연결합니다. 이 요청으로 결제되거나 제작이 발주되지는 않습니다.</p>
  </ReviewConfirm>;
}

const connectionLabels={pending:'연결 요청 접수',reviewing:'운영팀 확인 중',completed:'연결 완료',rejected:'연결되지 않음'};
export function Connections({connections=[],onMembers}){
  return <section className="fd-desk" aria-label="매칭 현황"><header><h1>매칭 현황</h1>
    <p>선정한 입찰 조건과 운영팀의 확인 상태를 볼 수 있습니다.</p></header>
    {connections.length?connections.map(item=><article key={item.postId} className="fd-card"><span className="fd-kicker">{connectionLabels[item.status]||'상태 확인 중'}</span>
      <h2>{item.title}</h2><p>{item.alias} · {number.format(item.quantity)}개 · 개당 {won(item.unitPrice)}</p>
      {item.status==='completed'&&<button className="button outline" onClick={onMembers}>회원 정보와 발주 내역 보기</button>}
    </article>):<div className="empty fd-empty"><FileText size={46} aria-hidden="true"/><h2>아직 매칭 요청이 없습니다.</h2><p>브랜드가 입찰을 하나 선택하면 진행 상황이 표시됩니다.</p></div>}
  </section>;
}

function RevealDialog({ contract, subject, mutate, onClose }) {
  const [checked, setChecked] = useState(false);
  const recap = <><p><strong>{subject}</strong></p><PriceSummary {...contract}/>
    <div className="fd-parties" aria-label="운영팀 전용 당사자 정보">
      {['brand','supplier'].map(role=><div key={role}><span>{role==='brand'?'브랜드':'업체'} · 운영팀만 열람</span>
        <strong>{contract.parties?.[role]?.name}</strong><small>{contract.parties?.[role]?.email}</small></div>)}
    </div>
    <p>브랜드 서명 {day(contract.brandSignedAt)} · 제작업체 서명 {day(contract.supplierSignedAt)}</p>
    <p>승인하면 이 계약의 두 당사자가 상대 상호와 이메일을 볼 수 있습니다.</p></>;
  return <ActionDialog title="관리자 소개 승인" description="선택안과 양측 서명 기록을 확인한 뒤 실명을 공개합니다."
    canReview={checked && Boolean(contract.brandSignedAt && contract.supplierSignedAt)}
    review={recap} recordLabel="확인하고 양측에 공개" onClose={onClose}
    onRecord={() => mutate(`/contracts/${contract.id}/reveal`, { accepted: true })}>
    {recap}<label className="fd-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>
      <span>대상 의뢰, 제안 수량과 양측 서명을 확인했습니다. 이 건의 당사자에게만 소개를 승인합니다.</span></label>
  </ActionDialog>;
}

function PaymentDialog({ contract, kind, mutate, onClose }) {
  const [input, setInput] = useState('');
  const sample = kind === 'sample';
  const name = sample ? '샘플비' : '본제작 대금';
  const amount = sample ? Number(input) : contract.quantity * contract.unitPrice;
  const valid = Number.isSafeInteger(amount) && amount > 0 && (!sample || amount <= 1_000_000_000_000);
  const recap = <dl className="fd-pay-summary">
    <div><dt>부담자</dt><dd>브랜드</dd></div><div><dt>거래 상대</dt><dd>{contract.parties?.supplier?.name || '제작업체'}</dd></div>
    <div><dt>처리 경로</dt><dd>팩트너 플랫폼 · 테스트</dd></div>
    <div><dt>{name} 모의 금액</dt><dd>{valid ? won(amount) : '금액 입력 전'}</dd></div>
    <div><dt>실제 청구액</dt><dd>0원</dd></div>
  </dl>;
  return <ActionDialog title={`${name} 플랫폼 결제`} description="이 화면은 모의 결제 기록만 저장합니다. 카드나 계좌에서 돈이 나가지 않습니다."
    canReview={valid} review={recap} recordLabel="모의 결제 기록" onClose={onClose}
    onRecord={() => mutate(`/contracts/${contract.id}/pay`, { kind, amount })}>
    {sample ? <label className="fd-input">양측이 확인한 샘플비 · 원
      <input required type="number" min="1" max="1000000000000" step="1" inputMode="numeric" value={input}
        onChange={e => setInput(e.target.value)} placeholder="예시 금액 입력"/></label> : <PriceSummary {...contract}/>}
    {recap}
  </ActionDialog>;
}

function ContractCard({ contract, post, offer, user, mutate }) {
  const [action, setAction] = useState(null);
  const close = () => setAction(null);
  const { status, payments = [] } = contract;
  const subject = [post?.title || contract.title || '파트너 참여계약', offer?.alias].filter(Boolean).join(' · ');
  const designPaused = contract.category==='design';
  const terms = contract.terms || (contract.version === BID_TERMS.version ? BID_TERMS : null);
  const revealed = status === 'revealed';
  const supplier = ['design', 'packaging', 'both'].includes(user.kind);
  const bothSigned = Boolean(contract.brandSignedAt && contract.supplierSignedAt);
  return <article className="fd-card">
    <div className="fd-heading"><div><span className="fd-kicker">1차 참여계약</span><h2>{subject}</h2></div>
      <span className="fd-status">{statusLabels[status] || '상태 확인 중'}</span></div>
    <PriceSummary {...contract}/>
    <ol className="fd-steps">
      {[
        ['브랜드 서명', contract.brandSignedAt],
        ['제작업체 서명', contract.supplierSignedAt],
        ['관리자 소개', contract.revealedAt]
      ].map(([label, date]) => <li key={label} data-complete={Boolean(date)}>
        {date ? <CheckCircle weight="fill" aria-hidden="true"/> : <Circle aria-hidden="true"/>}
        <div><span>{label}</span><strong>{day(date)}</strong></div>
      </li>)}
    </ol>
    {revealed ? <div className="fd-parties">
      {['brand', 'supplier'].map(role => <div key={role}><span>{role === 'brand' ? '브랜드' : '제작업체'}</span>
        <strong>{contract.parties?.[role]?.name || '상호 확인 중'}</strong><small>{contract.parties?.[role]?.email || ''}</small></div>)}
    </div> : <p className="fd-note">{status === 'awaiting_supplier'
      ? '선정된 제작업체의 계약함에 서명 요청이 표시됩니다. 양측 서명과 관리자 승인을 거친 뒤 상대 정보를 확인할 수 있습니다.'
      : '양측 서명이 완료되었습니다. 관리자가 승인하면 이 계약의 당사자 정보를 확인할 수 있습니다.'}</p>}
    <details className="fd-contract-copy"><summary>계약 내용과 문서 버전</summary><p>서명 버전 {contract.version}</p>
      {terms ? <Terms terms={terms}/> : <p>계약 내용을 불러올 수 없습니다. 운영자에게 확인해주세요.</p>}
    </details>
    {designPaused && <p className="fd-note">디자이너 서비스 준비 중 · 기존 계약 기록만 확인할 수 있어요.</p>}
    {!designPaused && supplier && status === 'awaiting_supplier' && <button className="button primary" disabled={!terms} onClick={() => setAction('sign')}>1차 계약 확인·서명</button>}
    {!designPaused && user.kind === 'admin' && status === 'signed' && bothSigned && <button className="button primary" onClick={() => setAction('reveal')}>서명 검토·소개 승인</button>}
    {revealed && <section className="fd-payments"><h3>플랫폼 결제</h3>
      {['sample', 'production'].map(kind => {
        const payment = payments.find(item => item.kind === kind);
        const label = kind === 'sample' ? '샘플비' : '본제작 대금';
        return <div className="fd-payment" key={kind}><span>{label}</span>
          {payment ? <strong>{won(payment.amount)} <small>모의 기록 · {day(payment.createdAt)}</small></strong>
            : designPaused ? <small>준비 중</small> : user.kind === 'brand' ? <button className="button soft" onClick={() => setAction(kind)}>{label} 모의 결제</button> : <small>브랜드 결제 대기</small>}
        </div>;
      })}
      <p className="fd-note">모의 결제 누계 {won(payments.reduce((sum, item) => sum + item.amount, 0))} · 실제 청구 0원</p>
    </section>}
    {action === 'sign' && terms && <SignatureDialog title="제작업체 참여 서명" subject={subject} tier={contract} user={user} terms={terms} offer={offer} onClose={close}
      onRecord={fields => mutate(`/contracts/${contract.id}/sign`, fields)}/>}
    {action === 'reveal' && <RevealDialog contract={contract} subject={subject} mutate={mutate} onClose={close}/>}
    {['sample', 'production'].includes(action) && revealed && <PaymentDialog contract={contract} kind={action} mutate={mutate} onClose={close}/>}
  </article>;
}

export function DealDesk({ state, user, mutate }) {
  if (!user) return null;
  const contracts = state.contracts || [];
  const posts = state.posts || [];
  const offers = state.offers || [];
  return <section className="fd-desk" aria-label="계약과 결제">
    <header><span className="fd-kicker">{user.kind === 'admin' ? '운영자 검토' : '거래 진행'}</span><h1>계약과 결제</h1>
      <p>양측 서명, 관리자 소개, 플랫폼 모의 결제를 순서대로 확인합니다.</p></header>
    {contracts.length ? contracts.map(contract => <ContractCard key={contract.id} contract={contract}
      post={posts.find(post => post.id === contract.postId)} offer={offers.find(offer => offer.id === contract.offerId)} user={user} mutate={mutate}/>)
      : <div className="empty fd-empty"><FileText size={46} aria-hidden="true"/><h2>아직 참여계약이 없습니다.</h2>
        <p>브랜드가 제안을 선택하고 서명하면 여기에 표시됩니다.</p></div>}
  </section>;
}
