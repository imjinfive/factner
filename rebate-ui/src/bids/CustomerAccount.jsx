import {lazy, Suspense, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Clock, PenNib} from '@phosphor-icons/react';
import {Button} from '../BrandControls';
import {legalTypes, MemberActivityChoices, MemberLegalChoices, MemberLoginFields, MemberRegistrationFields} from '../MemberRegistration';
import ReviewConfirm from '../ReviewConfirm';
import Turnstile from '../Turnstile';

const Recovery = lazy(() => import('../MemberPortal').then(module => ({default:module.AccountRecovery})));
const entryKey = 'customerSignup';
const reviewKey = 'customerSignupReview';

function progress(entry = history.state) {
  const saved = entry?.[entryKey];
  const role = ['brand','supplier'].includes(saved?.role) ? saved.role : '';
  const legal = role && Object.hasOwn(legalTypes,saved?.legal) ? saved.legal : '';
  return {role,legal};
}
function discardReview() {
  if (!history.state?.[reviewKey]) return;
  const entry = {...history.state};
  delete entry[reviewKey];
  history.replaceState(entry,'','/');
}

export default function CustomerAccount({mode, session, onNavigate, onAuth, SignupNotice}) {
  const [choice,setChoice] = useState(progress);
  const [pending,setPending] = useState(null);
  const [done,setDone] = useState(() => history.state?.customerSignupComplete);
  const [credentials,setCredentials] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [cert,setCert] = useState([]), [photos,setPhotos] = useState([]);
  const [certBusy,setCertBusy] = useState(false), [photosBusy,setPhotosBusy] = useState(false);
  const [token,setToken] = useState(''), [attempt,setAttempt] = useState(0);
  const lock = useRef(false), draft = useRef({}), password = useRef(null);
  const receiptTitle = useRef(null);
  const signup = mode === 'signup', login = mode === 'login';
  const registration = session.registration;
  const available = registration?.available === true && Boolean(registration.consentVersion);
  const preview = !registration?.available && registration?.previewAvailable === true;
  const {role,legal} = choice;
  const step = legal ? 2 : role ? 1 : 0;

  useEffect(() => {if (signup && done === 'preview') receiptTitle.current?.focus();},[signup,done]);
  useLayoutEffect(() => {
    discardReview();setChoice(progress());setError('');setPending(null);setCredentials(null);setDone(history.state?.customerSignupComplete);
    if (mode === 'signup' && !history.state?.[entryKey]) {
      draft.current = {};setCert([]);setPhotos([]);setToken('');
    }
  },[mode]);
  useEffect(() => {
    const restore = () => {
      setChoice(progress());setPending(null);setError('');setCredentials(null);setDone(history.state?.customerSignupComplete);discardReview();
      if (password.current) password.current.value = '';
    };
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  },[]);
  function choose(next) {
    const previous = history.state || {};
    if (!previous[entryKey]) history.replaceState({...previous,[entryKey]:choice},'','/');
    history.pushState({...history.state,[entryKey]:next,signupPreviousDistance:1},'','/');
    if (next.role !== role || next.legal !== legal) {setCert([]);setPhotos([]);delete draft.current.businessNumber;}
    setChoice(next);setError('');
  }
  function startSignup() {
    if (!signup) {onNavigate('signup');return;}
    if (!step) return;
    const entry={...history.state};
    delete entry[entryKey];delete entry.signupPreviousDistance;delete entry.customerSignupComplete;
    history.pushState(entry,'','/');
    draft.current={};setChoice(progress());setCert([]);setPhotos([]);setToken('');setError('');setDone(false);setCredentials(null);
  }
  function previousStep() {
    const distance = Number(history.state?.signupPreviousDistance);
    if (Number.isSafeInteger(distance) && distance > 0 && distance < history.length) history.go(-distance);
    else {
      const next = {role:step === 2 ? role : '',legal:''};
      history.replaceState({...history.state,[entryKey]:next},'','/');setChoice(next);
    }
  }
  function rememberDraft(event) {
    const field = event.target;
    if (['name','contact','phone','email','businessNumber','consent','termsConsent'].includes(field.name)) {
      draft.current[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    }
  }
  function review(event) {
    event.preventDefault();
    if (lock.current || !available || certBusy || photosBusy) return;
    if (legal !== 'individual' && !cert.length) {setError('사업자등록증을 첨부해주세요.');return;}
    const fields = new FormData(event.currentTarget);
    const application = {
      kind:role === 'brand' ? 'brand' : 'packaging',legalType:legal,
      name:fields.get('name'),contact:fields.get('contact'),phone:fields.get('phone'),
      email:fields.get('email'),password:fields.get('password'),
      businessNumber:legal === 'individual' ? '' : fields.get('businessNumber'),
      files:legal === 'individual' ? photos : [...cert,...photos],
      consent:fields.get('consent') === 'on',termsConsent:fields.get('termsConsent') === 'on',
      consentVersion:registration.consentVersion,turnstileToken:token
    };
    const entry = {...history.state,[reviewKey]:true};
    if (entry.signupPreviousDistance) entry.signupPreviousDistance += 1;
    history.pushState(entry,'','/');setError('');setPending(application);
  }
  async function submit(path, payload) {
    if (lock.current) return;
    lock.current = true;setBusy(true);setError('');
    try {
      const result = await onAuth(path,payload);
      if (path === '/preview-register') {
        if (result?.status !== 'preview' || !result.email || !result.password) throw new Error('테스트 계정 발급 결과를 확인하지 못했습니다.');
        const entry = history.state;
        if (entry?.factnerRoute !== 'signup' || entry[entryKey]?.role !== role || entry[entryKey]?.legal !== legal) return;
        history.replaceState({...entry,customerSignupComplete:'preview'},'','/');
        setCredentials({email:result.email,password:result.password});setDone('preview');
      } else if (path === '/register') {
        if (result?.status !== 'pending') throw new Error('가입 신청 상태를 확인하지 못했습니다.');
        discardReview();
        history.replaceState({...history.state,customerSignupComplete:true},'','/');
        setPending(null);setDone(true);setCert([]);setPhotos([]);
      }
      draft.current = {};
    } catch (e) {
      setError(e.message || '요청을 처리하지 못했습니다. 다시 확인해주세요.');
      if (path === '/preview-register' && registration?.turnstileSiteKey) {
        setToken('');setAttempt(n => n+1);
      } else if (path === '/register' && (registration?.turnstileSiteKey || e.httpStatus === 409)) {
        discardReview();setPending(null);
        if (registration?.turnstileSiteKey) setAttempt(n => n+1);
      }
    } finally {lock.current = false;setBusy(false);}
  }
  if (signup && done === 'preview') return <section className="member-auth member-card member-complete pa-preview-complete">
    <h1 ref={receiptTitle} tabIndex={-1}>테스트 계정을 만들었습니다</h1>
    <p>발급 후 7일 동안 사용할 수 있습니다.</p>
    {credentials ? <>
      <p>아래 로그인 정보를 보관하세요. 이 화면을 벗어나면 비밀번호를 다시 볼 수 없습니다.</p>
      <dl className="pa-preview-credentials"><dt>테스트 이메일</dt><dd>{credentials.email}</dd><dt>비밀번호</dt><dd>{credentials.password}</dd></dl>
    </> : <p>보관한 테스트 이메일과 비밀번호로 로그인하세요. 로그인 정보를 저장하지 않았다면 새 테스트 계정을 만들 수 있습니다.</p>}
    {credentials ? <Button disabled={busy} onClick={()=>submit('/login',credentials)}>{busy ? '로그인 중…' : '이 계정으로 로그인'}</Button> :
      <Button onClick={()=>onNavigate('login')}>로그인하기</Button>}
    {!credentials && <Button tone="ghost" onClick={startSignup}>새 테스트 계정 만들기</Button>}
    {error && <p className="member-error" role="alert">{error}</p>}
  </section>;
  if (signup && done === true) return <section className="member-auth member-card member-complete">
    <div className="member-symbol"><Clock size={38}/></div><h1>가입 신청을 받았어요</h1>
    <p>팩트너 운영팀이 자료와 업체 정보를 확인합니다. 가입 승인 후 로그인할 수 있어요.</p>
    <Button onClick={() => onNavigate('login')}>로그인으로 돌아가기</Button>
  </section>;

  const title = signup ? [preview ? '테스트 회원가입' : '회원가입','가입 유형 선택',preview ? '테스트 계정 확인' : '가입 정보 입력'][step]
    : ({login:'로그인','find-id':'아이디 찾기','recover-password':'비밀번호 찾기','reset-password':'새 비밀번호 설정'}[mode]);
  return <section className="member-auth pa-access">
    <header className="member-auth-heading"><h1>{title}</h1>
      {signup && <p>{preview ? '개인정보나 서류 없이 가상 계정으로 가입합니다. 테스트 활동은 실제 거래와 분리됩니다.' :
        ['팩트너에서 어떤 일을 하실 건가요?','개인 또는 사업자로 신청할 수 있습니다.','운영팀이 신청 내용을 확인한 뒤 가입을 승인합니다.'][step]}</p>}</header>
    <div className="member-card"><div className="member-tabs" role="tablist" aria-label="계정">
      <button type="button" role="tab" aria-selected={login} disabled={busy} onClick={() => onNavigate('login')}>로그인</button>
      <button type="button" role="tab" aria-selected={signup} disabled={busy} onClick={startSignup}>회원가입</button>
    </div>
    {login ? <form className="member-form" onSubmit={e => {
      e.preventDefault();const fields=new FormData(e.currentTarget);
      submit('/login',{email:fields.get('email'),password:fields.get('password')});
    }}><fieldset disabled={busy}>
      <MemberLoginFields Button={Button} email={draft.current.loginEmail || ''} passwordRef={password}
        onEmailChange={e => {draft.current.loginEmail=e.target.value;}} onRecovery={onNavigate}/>
    </fieldset></form> : !signup ? <Suspense fallback={<p className="member-hint">계정 정보를 확인하고 있습니다.</p>}>
      <Recovery key={mode} mode={mode} onMode={onNavigate} Button={Button}/>
    </Suspense> : <>
      <div className="member-steps" aria-label={`회원가입 ${step+1}단계`}>{['활동 선택','가입 유형',preview ? '계정 확인' : '정보 입력'].map((label,i)=>
        <span key={label} aria-current={i === step ? 'step' : undefined} className={i === step ? 'current' : ''}>{i+1}. {label}</span>)}</div>
      {!available && !preview && <p className="member-pilot" role="status">현재 가입 접수가 열려 있지 않습니다. 가입에 필요한 정보는 미리 확인할 수 있습니다.</p>}
      {step === 0 && <MemberActivityChoices onChoose={role=>choose({role,legal:''})}>
        <SignupNotice><button type="button" className="member-choice pa-designer"><span className="member-symbol"><PenNib size={30}/></span>
          <span><strong>디자이너</strong><small>신규 가입 준비 중</small></span></button></SignupNotice>
      </MemberActivityChoices>}
      {step === 1 && <MemberLegalChoices onChoose={legal=>choose({role,legal})}/>}
      {step === 2 && preview && <form className="member-form" onSubmit={event=>{
        event.preventDefault();
        const payload = {kind:role === 'brand' ? 'brand' : 'packaging',legalType:legal};
        if (registration.turnstileSiteKey) {
          if (!token) return;
          payload.turnstileToken=token;
        }
        submit('/preview-register',payload);
      }}><fieldset disabled={busy}>
        <p className="member-tag">{role === 'brand' ? '브랜드' : '패키징 제작업체'} · {legalTypes[legal]}</p>
        <p>테스트 이메일과 비밀번호를 발급합니다. 발급 후 7일 동안 사용할 수 있습니다.</p>
        {registration.turnstileSiteKey && <Turnstile siteKey={registration.turnstileSiteKey} onToken={setToken} resetKey={attempt} action="signup"/>}
        <Button type="submit" className="member-full" disabled={busy || Boolean(registration.turnstileSiteKey && !token)}>{busy ? '계정을 만드는 중…' : '테스트 계정 만들기'}</Button>
      </fieldset></form>}
      {step === 2 && !preview && <>
        <form className="member-form" onSubmit={review} onChange={rememberDraft}><fieldset disabled={!available || busy}>
          <MemberRegistrationFields role={role} legal={legal} draft={draft.current} cert={cert} setCert={setCert} onCertBusy={setCertBusy}
            photos={photos} setPhotos={setPhotos} onPhotosBusy={setPhotosBusy} passwordRef={password}/>
          {registration?.collection && <details className="member-disclosure"><summary>가입 심사 자료 수집 안내</summary><p>{registration.collection}</p></details>}
          {registration?.privacy && <details className="member-disclosure"><summary>개인정보처리방침</summary><p>{registration.privacy}</p></details>}
          {registration?.terms && <details className="member-disclosure"><summary>이용약관</summary><p>{registration.terms}</p></details>}
          <label className="member-check"><input type="checkbox" name="consent" required defaultChecked={draft.current.consent}/>가입 심사를 위한 개인정보 수집·이용에 동의합니다.</label>
          <label className="member-check"><input type="checkbox" name="termsConsent" required defaultChecked={draft.current.termsConsent}/>이용약관에 동의합니다.</label>
          {available && registration.turnstileSiteKey && <Turnstile siteKey={registration.turnstileSiteKey} onToken={setToken} resetKey={attempt} action="signup"/>}
          <Button type="submit" className="member-full" disabled={!available || certBusy || photosBusy || Boolean(registration?.turnstileSiteKey && !token)}>가입 심사 신청 <ArrowRight size={18}/></Button>
        </fieldset></form>
      </>}
      {step > 0 && <button className="member-back" type="button" disabled={busy} onClick={previousStep}><ArrowLeft size={18}/> 이전 단계</button>}
    </>}
    {error && !pending && <p className="member-error" role="alert">{error}</p>}
    </div>
    <ReviewConfirm open={Boolean(pending) && signup && available} busy={busy} error={error} title="가입 신청 정보를 확인해주세요" confirmLabel="가입 심사 신청"
      onCancel={() => {setPending(null);setError('');if(history.state?.[reviewKey])history.back();}} onConfirm={()=>submit('/register',pending)}>
      {pending && <dl>{[
        ['활동',role === 'brand' ? '브랜드' : '패키징 제작업체'],['가입 유형',legalTypes[legal]],['이름',pending.name],['담당자',pending.contact],
        ['연락처',pending.phone],['이메일',pending.email],['사업자번호',pending.businessNumber],['첨부 자료',pending.files.map(file=>file.name).join('\n')],
        ['신청 후 상태','가입 대기 · 운영팀 검토 후 승인']
      ].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </ReviewConfirm>
  </section>;
}
