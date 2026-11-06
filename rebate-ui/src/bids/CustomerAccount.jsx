import {lazy, Suspense, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Clock} from '@phosphor-icons/react';
import {Button} from '../BrandControls';
import {legalTypes, MemberActivityChoices, MemberLegalChoices, MemberLoginFields, MemberRegistrationFields} from '../MemberRegistration';
import ElectronicAgreement from '../ElectronicAgreement';
import Turnstile from '../Turnstile';
import {readOnboardingDraft,clearOnboardingDraft,materialLabel,supplierProductLabel,selectedProductInfo,normalizeOnboardingDraft} from './onboarding-data.js';

const Recovery = lazy(() => import('../MemberPortal').then(module => ({default:module.AccountRecovery})));
const entryKey = 'customerSignup';
const reviewKey = 'customerSignupReview';
const signupSurvey = () => history.state?.onboardingDraft ? normalizeOnboardingDraft(history.state.onboardingDraft) : readOnboardingDraft();

function progress(entry = history.state) {
  const saved = entry?.[entryKey];
  const role = saved ? (['brand','supplier'].includes(saved.role) ? saved.role : '') : signupSurvey().role;
  const legal = role && Object.hasOwn(legalTypes,saved?.legal) ? saved.legal : '';
  return {role,legal};
}
function discardReview() {
  if (!history.state?.[reviewKey]) return;
  const entry = {...history.state};
  delete entry[reviewKey];
  history.replaceState(entry,'','/');
}

export default function CustomerAccount({mode, session, onNavigate, onAuth}) {
  const [onboarding] = useState(signupSurvey);
  const [choice,setChoice] = useState(progress);
  const [pending,setPending] = useState(null);
  const [done,setDone] = useState(() => history.state?.customerSignupComplete === true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [cert,setCert] = useState([]), [photos,setPhotos] = useState([]);
  const [certBusy,setCertBusy] = useState(false), [photosBusy,setPhotosBusy] = useState(false);
  const [token,setToken] = useState(''), [attempt,setAttempt] = useState(0);
  const lock = useRef(false), draft = useRef({}), password = useRef(null);
  const signup = mode === 'signup', login = mode === 'login';
  const registration = session.registration;
  const available = registration?.available === true && Boolean(registration.consentVersion);
  const {role,legal} = choice;
  const reached = useRef(choice);
  const step = legal ? 2 : role ? 1 : 0;
  const continuing = onboarding.role === role && Boolean(role);
  const surveySummary = role==='supplier'
    ? onboarding.supplierProducts.slice(0,2).map(supplierProductLabel).filter(Boolean).join(' · ')+(onboarding.supplierProducts.length>2?` 외 ${onboarding.supplierProducts.length-2}개`:'')
    : [selectedProductInfo(onboarding)?.name || materialLabel(onboarding.material),onboarding.quantity?`${Number(onboarding.quantity).toLocaleString('ko-KR')}개`:'수량 상담'].join(' · ');

  useLayoutEffect(() => {
    discardReview();setChoice(progress());setError('');setPending(null);setDone(history.state?.customerSignupComplete === true);
    if (mode === 'signup' && !history.state?.[entryKey]) {
      draft.current = {};reached.current=progress();setCert([]);setPhotos([]);setToken('');
    }
  },[mode]);
  useEffect(() => {
    const restore = () => {
      setChoice(progress());setPending(null);setError('');setDone(history.state?.customerSignupComplete === true);discardReview();
      if (mode!=='signup' && password.current) password.current.value = '';
    };
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  },[mode]);
  function choose(next) {
    const previous = history.state || {};
    if (!previous[entryKey]) history.replaceState({...previous,[entryKey]:choice},'','/');
    history.pushState({...history.state,[entryKey]:next,signupPreviousDistance:1},'','/');
    if (next.role !== reached.current.role || (next.legal && next.legal !== reached.current.legal)) {
      setCert([]);setPhotos([]);delete draft.current.businessNumber;
      if(next.role!==reached.current.role)delete draft.current.packagingDesign;
      reached.current=next;
    }
    setChoice(next);setError('');
  }
  function startSignup() {
    if (!signup) {onNavigate('signup');return;}
    if (!step) return;
    const entry={...history.state};
    delete entry[entryKey];delete entry.signupPreviousDistance;delete entry.customerSignupComplete;
    history.pushState(entry,'','/');
    draft.current={};reached.current=progress();setChoice(progress());setCert([]);setPhotos([]);setToken('');setError('');setDone(false);
  }
  function previousStep() {
    const distance = Number(history.state?.signupPreviousDistance);
    if (Number.isSafeInteger(distance) && distance > 0 && distance < history.length) history.go(-distance);
    else {
      const next = {role:step === 2 ? role : '',legal:''};
      history.replaceState({...history.state,[entryKey]:next},'','/');setChoice(next);
    }
  }
  function goToStep(index) {
    if(index===step)return;
    if(index<step){
      const distance=Number(history.state?.signupPreviousDistance||1)+step-index-1;
      if(history.state?.signupPreviousDistance && distance<history.length){history.go(-distance);return;}
      const next={role:index?role:'',legal:''};
      history.replaceState({...history.state,[entryKey]:next},'','/');setChoice(next);return;
    }
    if(step===0 && index===2)choose({role:reached.current.role,legal:''});
    choose({role:reached.current.role,legal:index===2?reached.current.legal:''});
  }
  function rememberDraft(event) {
    const field = event.target;
    if (['name','contact','phone','email','password','businessNumber','packagingDesign','consent','termsConsent'].includes(field.name)) {
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
      ...(continuing?{onboarding}:{}),
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
      if (path === '/register') {
        if (result?.status !== 'pending') throw new Error('가입 신청 상태를 확인하지 못했습니다.');
        discardReview();
        history.replaceState({...history.state,customerSignupComplete:true},'','/');
        setPending(null);setDone(true);setCert([]);setPhotos([]);
        clearOnboardingDraft();
      }
      draft.current = {};
    } catch (e) {
      setError(e.message || '요청을 처리하지 못했습니다. 다시 확인해주세요.');
      if (path === '/register' && (registration?.turnstileSiteKey || e.httpStatus === 409)) {
        discardReview();setPending(null);
        if (registration?.turnstileSiteKey) setAttempt(n => n+1);
      }
    } finally {lock.current = false;setBusy(false);}
  }
  if (signup && done) return <section className="member-auth member-card member-complete">
    <div className="member-symbol"><Clock size={38}/></div><h1>가입 신청을 받았어요</h1>
    <p>{continuing?'선택한 패키징 조건도 함께 저장했어요.':'팩트너 운영팀이 가입 정보를 확인합니다.'}<br/>승인 후 로그인하면 {role==='brand'?'공고 작성을':'제작 공고 확인을'} 이어갈 수 있어요.</p>
    <Button onClick={() => onNavigate('login')}>로그인으로 돌아가기</Button>
  </section>;

  const title = signup ? (continuing?'선택한 조건, 그대로 이어가요':['회원가입','가입 유형 선택','가입 정보 입력'][step])
    : ({login:'로그인','find-id':'아이디 찾기','recover-password':'비밀번호 찾기','reset-password':'새 비밀번호 설정'}[mode]);
  return <section className="member-auth pa-access">
    <header className="member-auth-heading"><h1>{title}</h1>
      {signup && (continuing?<div className="member-survey-carryover"><span>선택한 내용이 가입 신청에 함께 저장돼요</span><strong>{surveySummary || '제작 가능 품목 선택 완료'}</strong><p>{role==='brand'?'가입 후 공고 준비':'가입 후 입찰 준비'} <ArrowRight size={17} aria-hidden="true"/></p><small>{role==='brand'?'다시 입력할 필요 없어요. 가입 승인 후 이 조건으로 첫 공고를 준비해요.':'제작 품목·주문 조건·업체 강점이 이어져요. 가입 승인 후 입찰을 시작할 수 있어요.'}</small></div>:<p>{['팩트너에서 어떤 일을 하실 건가요?','개인 또는 사업자로 신청할 수 있습니다.','운영팀이 신청 내용을 확인한 뒤 가입을 승인합니다.'][step]}</p>)}</header>
    <div className="member-card"><div className="member-tabs" role="tablist" aria-label="계정">
      <button type="button" role="tab" aria-selected={login} disabled={busy} onClick={() => onNavigate('login')}>로그인</button>
      <button type="button" role="tab" aria-selected={signup} disabled={busy} onClick={startSignup}>회원가입</button>
    </div>
    {login && error && <p className="member-error pa-login-alert" role="alert">{error}</p>}
    {login ? <form className="member-form" onSubmit={e => {
      e.preventDefault();const fields=new FormData(e.currentTarget);
      submit('/login',{email:fields.get('email'),password:fields.get('password')});
    }}><fieldset disabled={busy}>
      <MemberLoginFields Button={Button} email={draft.current.loginEmail || ''} passwordRef={password}
        onEmailChange={e => {draft.current.loginEmail=e.target.value;}} onRecovery={onNavigate}/>
    </fieldset></form> : !signup ? <Suspense fallback={<p className="member-hint">계정 정보를 확인하고 있습니다.</p>}>
      <Recovery key={mode} mode={mode} onMode={onNavigate} Button={Button}/>
    </Suspense> : <>
      <div className="member-steps" aria-label={`회원가입 ${step+(continuing?0:1)}단계`}>{['활동 선택','가입 유형','정보 입력'].map((label,i)=>continuing&&i===0?null:
        <button type="button" key={label} disabled={busy || (i>step && !(i===1?reached.current.role:reached.current.legal))} aria-current={i === step ? 'step' : undefined} className={i === step ? 'current' : ''} onClick={()=>goToStep(i)}>{i+(continuing?0:1)}. {label}</button>)}</div>
      {!available && <p className="member-pilot" role="status">현재 가입 접수가 열려 있지 않습니다. 가입에 필요한 정보는 미리 확인할 수 있습니다.</p>}
      {registration?.trial && <p className="member-pilot">테스트 운영 중입니다. 업체와 담당자 정보는 가상으로 입력하세요. 서류와 사진은 예시 파일이나 개인정보·거래처 정보를 가린 파일을 사용하세요.</p>}
      {step === 0 && <MemberActivityChoices onChoose={role=>choose({role,legal:''})}/>}
      {step === 1 && <MemberLegalChoices onChoose={legal=>choose({role,legal})}/>}
      {step === 2 && <>
        <form className="member-form" onSubmit={review} onChange={rememberDraft}><fieldset disabled={!available || busy}>
          <MemberRegistrationFields role={role} legal={legal} draft={draft.current} cert={cert} setCert={setCert} onCertBusy={setCertBusy}
            photos={photos} setPhotos={setPhotos} onPhotosBusy={setPhotosBusy} passwordRef={password}/>
          {registration?.terms && <details className="member-disclosure"><summary>이용약관</summary><p>{registration.terms}</p></details>}
          <label className="member-check"><input type="checkbox" name="termsConsent" required defaultChecked={draft.current.termsConsent}/>[필수] 이용약관에 동의합니다.</label>
          {registration?.collection && <details className="member-disclosure"><summary>가입 심사를 위한 개인정보 수집·이용 안내</summary><p>{registration.collection}</p></details>}
          <label className="member-check"><input type="checkbox" name="consent" required defaultChecked={draft.current.consent}/>[필수] 가입 심사를 위한 개인정보 수집·이용에 동의합니다.</label>
          {registration?.privacy && <details className="member-disclosure"><summary>개인정보처리방침 보기</summary><p>{registration.privacy}</p></details>}
          {available && registration.turnstileSiteKey && <Turnstile siteKey={registration.turnstileSiteKey} onToken={setToken} resetKey={attempt} action="signup"/>}
          <Button type="submit" className="member-full" disabled={!available || certBusy || photosBusy || Boolean(registration?.turnstileSiteKey && !token)}>{continuing?'조건 저장하고 가입 신청':'가입 신청'} <ArrowRight size={18}/></Button>
        </fieldset></form>
      </>}
      {step > 0 && <button className="member-back" type="button" disabled={busy} onClick={previousStep}><ArrowLeft size={18}/> 이전 단계</button>}
    </>}
    {!login && error && !pending && <p className="member-error" role="alert">{error}</p>}
    </div>
    <ElectronicAgreement open={Boolean(pending) && signup && available} busy={busy} error={error}
      onCancel={() => {setPending(null);setError('');if(history.state?.[reviewKey])history.back();}} onConfirm={agreement=>submit('/register',{...pending,agreement})}>
      {pending && <dl>{[
        ['활동',role === 'brand' ? '브랜드' : '패키징 제작업체'],['가입 유형',legalTypes[legal]],['선택한 조건',continuing?surveySummary:''],['이름',pending.name],['담당자',pending.contact],
        ['연락처',pending.phone],['이메일',pending.email],['사업자번호',pending.businessNumber],['첨부 자료',pending.files.map(file=>file.name).join('\n')],
        ['신청 후 상태','가입 대기 · 운영팀 검토 후 승인']
      ].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </ElectronicAgreement>
  </section>;
}
