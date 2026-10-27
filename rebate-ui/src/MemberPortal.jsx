import {useEffect,useRef,useState} from 'react';
import {Package,Storefront,Factory,UserCircle,Buildings,Briefcase,ArrowRight,ArrowLeft,UploadSimple,FileText,X,Star,Plus,Clock,CheckCircle,Truck,ArrowsClockwise,SignOut,ShieldCheck} from '@phosphor-icons/react';
import {api} from './api';
import Turnstile from './Turnstile';
import {PackagingChoice,PostcodeAddress} from './PackagingFields';
import {initialSupplier} from './packaging-input.js';
import {formatInput,formatPhone,formatBusinessNumber} from '../../admin-ui/input-format.js';
import './member-portal.css';

export const orderStates={requested:'매칭 대기',matched:'업체 연결 확인',assigned:'업체 확인 중',quoted:'최종 승인 대기',approved:'발주 확정',producing:'제작 중',shipped:'출고',received:'입고 완료',cancelled:'취소'};
const legalTypes={individual:'개인',sole:'개인사업자',corporate:'법인사업자'};
const send=(path,data,method='POST')=>api(path,{method,body:JSON.stringify(data)});
const money=value=>Number(value).toLocaleString('ko-KR');
const when=value=>new Date(value).toLocaleString('ko-KR');
const emptySpec={name:'',size:'',material:'',printing:'',finish:'',description:'',files:[]};
const today=()=>new Date().toLocaleDateString('en-CA');

function Form({onSave,children,className=''}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 return <form className={`member-form ${className}`} onSubmit={async e=>{e.preventDefault();if(lock.current)return;const values=Object.fromEntries(new FormData(e.currentTarget));lock.current=true;setBusy(true);setError('');try{await onSave(values);}catch(problem){setError([problem.message,problem.note].filter(Boolean).join(' '));}finally{lock.current=false;setBusy(false);}}}>
  {error&&<p className="member-error" role="alert">{error}</p>}<fieldset disabled={busy}>{children}</fieldset>{busy&&<p className="member-hint" role="status">저장하고 있어요…</p>}
 </form>;
}
function Field({label,children,...props}){return <label className="member-field"><span>{label}</span>{children||<input {...props}/>}</label>;}
function Preview({file}){
 return file.mime?.startsWith('image/')?<img src={file.data?`data:${file.mime};base64,${file.data}`:`/api/member/files/${file.id}`} alt={file.name}/>:<FileText size={32}/>;
}
async function encodeFile(file,kind){
 if(file.size>1572864)throw new Error('파일 한 개당 1.5MB 이하로 선택해주세요.');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.'));reader.readAsDataURL(file);});
 return {name:file.name,mime:file.type,kind,data};
}
function Upload({files,onChange,kind,label,max=5,remote=false,onBusy}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="member-upload"><label className="member-drop"><UploadSimple size={28}/><span><strong>{busy?'파일을 올리고 있어요':label}</strong><small>{kind==='workplace'||kind==='sample'?'JPG · PNG · WEBP':'JPG · PNG · WEBP · PDF'} · 파일당 1.5MB</small></span><input type="file" aria-label={label} multiple={max>1} disabled={busy} accept={kind==='workplace'||kind==='sample'?'.jpg,.jpeg,.png,.webp':'.jpg,.jpeg,.png,.webp,.pdf'} onChange={async e=>{
  const selected=[...e.target.files];e.target.value='';setError('');if(selected.length+files.length>max){setError(`최대 ${max}개까지 첨부할 수 있어요.`);return;}setBusy(true);onBusy?.(true);const next=[...files];
  try{for(const file of selected){const encoded=await encodeFile(file,kind);next.push(remote?(await send('member/files',encoded)).file:encoded);onChange([...next]);}}catch(problem){setError(problem.message);}finally{setBusy(false);onBusy?.(false);}
 }}/></label>{error&&<p className="member-error" role="alert">{error}</p>}
 <div className="member-files">{files.map((file,i)=><div className="member-file" key={file.id||`${file.name}-${i}`}><Preview file={file}/><span>{file.name}</span><button type="button" aria-label={`${file.name} 제거`} onClick={()=>onChange(files.filter((_,index)=>index!==i))}><X size={18}/></button></div>)}</div></div>;
}
function AccountRecovery({mode,onMode,Button}){
 const [emails,setEmails]=useState(null),[message,setMessage]=useState(''),[email,setEmail]=useState('');
 const reset=mode==='reset-password',findId=mode==='find-id';
 return <Form key={mode} onSave={async data=>{
  setEmails(null);setMessage('');
  if(findId){const result=await send('member/find-id',data);setEmails(result.emails);}
  else if(reset){if(data.newPassword!==data.confirmPassword)throw new Error('새 비밀번호가 서로 일치하지 않아요.');await send('member/reset-password',{email:data.email,code:data.code,newPassword:data.newPassword});setMessage('비밀번호를 변경했어요. 새 비밀번호로 로그인해주세요.');}
  else{const result=await send('member/recovery-request',data);setMessage(result.message);}
 }}>
 <p className="member-hint">{findId?'아이디는 가입한 이메일이에요. 가입 당시 정보를 입력하면 이메일 일부를 확인할 수 있어요.':reset?'운영팀에서 받은 복구 코드는 발급 후 30분 동안 한 번만 사용할 수 있어요.':'가입 정보가 일치하면 운영팀이 등록된 연락처로 연락해 본인 확인 후 복구 코드를 안내해드려요.'}</p>
 {!findId&&<Field label="가입 이메일" name="email" type="email" autoComplete="username" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} required/>}
 {reset?<><Field label="복구 코드" name="code" autoComplete="one-time-code" maxLength={128} required/><Field label="새 비밀번호 · 8자 이상" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/><Field label="새 비밀번호 확인" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></>:<><Field label="브랜드명 / 업체명 / 활동명" name="name" maxLength={100} required/><Field label="담당자" name="contact" maxLength={60} required/><Field label="가입한 연락처" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} onInput={e=>formatInput(e,formatPhone)} required/></>}
 {emails!==null&&<div className="member-recovery-result" role="status">{emails.length?<><strong>가입한 이메일</strong><ul>{emails.map((found,index)=><li key={`${found}-${index}`}>{found}</li>)}</ul></>:<p>입력한 정보와 일치하는 아이디가 없어요. 가입 당시 정보를 확인해주세요.</p>}</div>}
 {message&&<p className="member-recovery-result" role="status">{message}</p>}
 <Button type="submit" className="member-full">{findId?'아이디 찾기':reset?'비밀번호 변경':'비밀번호 복구 요청'}</Button>
 <div className="member-recovery-links">{!findId&&<button type="button" onClick={()=>{setMessage('');onMode(reset?'recover-password':'reset-password');}}>{reset?'복구 코드 요청하기':'복구 코드를 받았어요'}</button>}<button type="button" onClick={()=>onMode('login')}>로그인으로 돌아가기</button></div>
 </Form>;
}
function Auth({onMember,Button,signupContext}){
 const [mode,setMode]=useState(signupContext?'signup':'login'),[step,setStep]=useState(signupContext?.role?1:0),[role,setRole]=useState(signupContext?.role||''),[legal,setLegal]=useState(''),[config,setConfig]=useState(null),[configError,setConfigError]=useState('');
 const [cert,setCert]=useState([]),[photos,setPhotos]=useState([]),[token,setToken]=useState(''),[attempt,setAttempt]=useState(0),[done,setDone]=useState(false),[certBusy,setCertBusy]=useState(false),[photosBusy,setPhotosBusy]=useState(false);
 useEffect(()=>{let active=true;api('member/config').then(data=>{if(active)setConfig(data);}).catch(e=>{if(active)setConfigError(e.message);});return()=>{active=false;};},[]);
 if(done)return <section className="member-auth member-card member-complete"><div className="member-symbol"><Clock size={38}/></div><h1>가입 신청을 받았어요</h1><p>자료를 확인한 뒤 가입을 승인해드려요.<br/>로그인에서 심사 상태를 확인할 수 있어요.</p><Button onClick={()=>{setDone(false);setMode('login');setStep(0);}}>로그인으로 돌아가기</Button></section>;
 return <section className="member-auth"><div className="member-auth-heading"><span className="member-eyebrow">FACTNER ACCOUNT</span><h1>{mode==='find-id'?'아이디 찾기':mode==='recover-password'?'비밀번호 찾기':mode==='reset-password'?'새 비밀번호 설정':mode==='login'?'다시 만나 반가워요':step===0?'어떤 일을 하고 계신가요?':step===1?'가입 유형을 선택해주세요':'조금만 알려주세요'}</h1>{['login','signup'].includes(mode)&&<p>{mode==='login'?'패키징부터 다음 발주까지, 한곳에서.':'관리자가 확인한 뒤 가입을 승인해드려요.'}</p>}</div>
 <div className="member-card"><div className="member-tabs" role="tablist" aria-label="계정"><button role="tab" aria-selected={mode==='login'} onClick={()=>setMode('login')}>로그인</button><button role="tab" aria-selected={mode==='signup'} onClick={()=>setMode('signup')}>회원가입</button></div>
 {mode==='login'?<Form onSave={async data=>{const result=await send('member/login',data);onMember(result.member);}}><Field label="이메일" name="email" type="email" autoComplete="username" maxLength={254} required/><Field label="비밀번호" name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required/><Button type="submit" className="member-full">로그인 <ArrowRight size={18}/></Button><p className="member-hint">심사 중인 계정은 승인 후 이용할 수 있어요.</p><div className="member-recovery-links"><button type="button" onClick={()=>setMode('find-id')}>아이디 찾기</button><button type="button" onClick={()=>setMode('recover-password')}>비밀번호 찾기</button></div></Form>:mode!=='signup'?<AccountRecovery mode={mode} onMode={setMode} Button={Button}/>:<>
 <div className="member-steps" aria-label={`회원가입 ${step+1}단계`}>{['활동 선택','가입 유형','정보 입력'].map((label,i)=><span className={step===i?'current':''} key={label}>{i+1}. {label}</span>)}</div>
 {step===0&&<div className="member-choice-list">{[['brand',Storefront,'브랜드','우리 제품에 맞는 패키징을 찾아요'],['supplier',Factory,'박스·패키징 제작 업체','제작할 수 있는 브랜드를 만나요']].map(([key,Icon,title,copy])=><button className="member-choice" key={key} onClick={()=>{setRole(key);setStep(1);}}><span className="member-symbol"><Icon size={32}/></span><span><strong>{title}</strong><small>{copy}</small></span><ArrowRight size={22}/></button>)}</div>}
 {step===1&&<div className="member-choice-list">{[['individual',UserCircle],['sole',Briefcase],['corporate',Buildings]].map(([key,Icon])=><button className="member-choice" key={key} onClick={()=>{setLegal(key);setStep(2);}}><span className="member-symbol"><Icon size={30}/></span><strong>{legalTypes[key]}</strong><ArrowRight size={22}/></button>)}</div>}
 {step===2&&<Form onSave={async data=>{if(certBusy||photosBusy)throw new Error('파일 업로드가 끝날 때까지 기다려주세요.');try{await send('member/register',{...data,role,legalType:legal,files:[...cert,...photos],consent:data.consent==='on',testOnly:data.testOnly==='on',consentVersion:config?.consentVersion,turnstileToken:token});setDone(true);}finally{setAttempt(n=>n+1);}}}>
 <p className="member-tag">{role==='brand'?'브랜드':'패키징 제작 업체'} · {legalTypes[legal]}</p>
 <Field label={role==='brand'?'브랜드명':'업체명 / 활동명'} name="name" maxLength={100} required/><div className="member-form-grid"><Field label="담당자" name="contact" maxLength={60} required/><Field label="연락처" name="phone" type="tel" inputMode="tel" maxLength={30} onInput={e=>formatInput(e,formatPhone)} required/></div>
 <Field label="이메일" name="email" type="email" autoComplete="username" maxLength={254} required/><Field label="비밀번호 · 8자 이상" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/>
 {legal!=='individual'&&<><Field label="사업자등록번호" name="businessNumber" inputMode="numeric" onInput={e=>formatInput(e,formatBusinessNumber)} placeholder="000-00-00000" pattern="[0-9-]{10,12}" maxLength={12} required/><Upload label="사업자등록증 첨부" files={cert} onChange={setCert} onBusy={setCertBusy} kind="certificate" max={1}/></>}
 <Upload label="작업 현장·패키징 사진 첨부" files={photos} onChange={setPhotos} onBusy={setPhotosBusy} kind="workplace" max={4}/>
 <details className="member-disclosure"><summary>가입 심사 자료 수집 안내</summary><p>가입 심사와 계정 운영을 위해 가입 유형, 업체명, 담당자, 연락처, 이메일, 사업자번호와 첨부 자료를 저장합니다. 사업자등록증·현장 사진은 본인과 대표 관리자만 확인합니다. 사업자번호는 직접 심사하며 자동 진위 인증은 제공하지 않습니다.</p><p>현재는 기능 검토용 테스트입니다. 가상 정보·샘플 파일만 사용해주세요. 실제 자료의 보유 기간, 운영자 연락처와 처리방침은 정식 가입 시작 전 확정합니다. 수집에 동의하지 않으면 가입을 신청할 수 없습니다.</p></details>
 <label className="member-check"><input name="consent" type="checkbox" required/>가입 심사를 위한 정보 수집에 동의합니다.</label><label className="member-check"><input name="testOnly" type="checkbox" required/>실제 개인정보 없이 테스트로 신청합니다.</label>
 {configError&&<p role="alert" className="member-error">{configError}</p>}{config?.turnstileSiteKey&&<Turnstile siteKey={config.turnstileSiteKey} onToken={setToken} resetKey={attempt} action="signup"/>}
 <Button type="submit" className="member-full" disabled={certBusy||photosBusy||!config||!!config.turnstileSiteKey&&!token}>가입 심사 신청 <ArrowRight size={18}/></Button>
 </Form>}
 {step>0&&<button className="member-back" onClick={()=>setStep(s=>s-1)}><ArrowLeft size={18}/> 이전 단계</button>}</>}
 </div></section>;
}
function SpecFields({spec,setSpec,onBusy}){
 return <><div className="member-form-grid">{[['name','패키징 이름'],['size','규격 (가로 × 세로 × 높이, mm)']].map(([key,label])=><Field key={key} label={label} value={spec[key]} placeholder="직접 입력" maxLength={100} required onChange={e=>setSpec({...spec,[key]:e.target.value})}/>)}{[['material','소재'],['printing','인쇄'],['finish','후가공']].map(([key,label])=><PackagingChoice key={key} label={label} kind={key} value={spec[key]} required={key==='material'} onChange={value=>setSpec({...spec,[key]:value})}/>)}</div><Field label="상세 사양"><textarea value={spec.description} maxLength={2000} rows={3} onChange={e=>setSpec({...spec,description:e.target.value})}/></Field><Upload label="디자인 파일·승인 샘플 첨부" kind="design" remote max={6} files={spec.files} onBusy={onBusy} onChange={files=>setSpec(current=>({...current,files}))}/></>;
}
function Spec({spec}){return <dl className="member-spec">{[['규격',spec.size],['소재',spec.material],['인쇄',spec.printing],['후가공',spec.finish],['상세 사양',spec.description]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;}
function Links({files}){return <div className="member-files">{files.map(f=><a key={f.id} className="member-file member-file-link" href={`/api/member/files/${f.id}`} target="_blank" rel="noreferrer"><Preview file={f}/><span>{f.name}</span></a>)}</div>;}
function Editor({editor,onDone,Button,partners}){
 const data=editor.data,[spec,setSpec]=useState(data?.approved_snapshot?.spec||data?.spec||emptySpec),[id]=useState(()=>crypto.randomUUID()),[uploading,setUploading]=useState(false);
 const [editingSpec,setEditingSpec]=useState(editor.kind==='packaging'||!data?.spec),[supplierId,setSupplierId]=useState(()=>initialSupplier(partners,data?.supplier_id||editor.supplierId)),[consent,setConsent]=useState(false);
 const available=partners.filter(p=>p.status==='active'&&p.available),selected=available.find(p=>p.supplier_id===supplierId);
 return <Form onSave={async values=>{
  if(uploading)throw new Error('파일 업로드가 끝날 때까지 기다려주세요.');
  if(editor.kind==='packaging')await send(data?`packagings/${data.id}`:'packagings',{spec,favorite:values.favorite==='on',version:data?.version},data?'PATCH':'POST');
  else {if(values.address.length>300)throw new Error('배송지는 우편번호와 상세 주소를 포함해 300자 이하로 입력해주세요.');if(supplierId!=='new'&&(!selected||!consent))throw new Error('요청받을 제작 업체와 자료 전달 동의를 확인해주세요.');await send('orders',{...values,id,spec,sourceId:editor.sourceId||undefined,...(selected?{supplierId:selected.supplier_id,sharingConsent:consent}:{})});}await onDone();
 }}>{editingSpec?<SpecFields spec={spec} setSpec={setSpec} onBusy={setUploading}/>:<section className="member-saved-spec"><div className="member-row"><strong>{spec.name}</strong><button type="button" onClick={()=>setEditingSpec(true)}>사양 변경</button></div><Spec spec={spec}/><Links files={spec.files}/></section>}{editor.kind==='packaging'?<label className="member-check"><input name="favorite" type="checkbox" defaultChecked={!!data?.favorite}/>자주 쓰는 패키징에 고정</label>:<>
 <Field label="요청받을 제작 업체"><select value={supplierId} required onChange={e=>{setSupplierId(e.target.value);setConsent(false);}}><option value="" disabled>제작 업체를 선택해주세요</option>{available.map(p=><option key={p.id} value={p.supplier_id}>{p.partner_name||p.supplier_name}</option>)}<option value="new">팩트너에 새 업체 매칭 요청</option></select></Field>
 {editor.previousPrice&&<p className="member-hint">지난 발주 {money(editor.previousPrice)}원 · 참고 가격이며 새 견적을 받아요.</p>}
 <div className="member-form-grid"><Field label="수량 (개)" name="quantity" type="number" min="1" max="100000000" step="1" defaultValue={data?.quantity||''} required/><Field label="희망 납품일" name="requestedDate" type="date" min={today()} required/></div>
 <PostcodeAddress initialValue={data?.address||''}/><Field label="변경 사항·요청 사항"><textarea name="note" maxLength={2000} rows={3}/></Field>{selected&&<label className="member-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>{selected.partner_name||selected.supplier_name}에 이번 발주의 사양·파일·수량·납기·배송지·요청 사항을 전달합니다.</label>}<p className="member-hint">{selected?'요청하면 제작 업체와 팩트너에 바로 접수돼요. ':''}금액과 납기는 업체 답변 후 최종 승인합니다.</p>
 </>}<Button type="submit" disabled={uploading} className="member-full">{editor.kind==='packaging'?'패키징 저장':'견적·발주 요청하기'} <ArrowRight size={18}/></Button></Form>;
}
function OrderDetail({data,member,onUpdate,onRepeat,onSeen,Button}){
 const {order:o,events}=data,isBrand=member.role==='brand',isSupplier=!isBrand;
 const action=async (name,values={})=>{await send(`orders/${o.id}`,{...values,action:name,version:o.version},'PATCH');await onUpdate();};
 const [seenError,setSeenError]=useState(''),[seenBusy,setSeenBusy]=useState(false),[seenRetry,setSeenRetry]=useState(0);
 const onSeenRef=useRef(onSeen);onSeenRef.current=onSeen;
 useEffect(()=>{
  if(!isSupplier||o.status!=='assigned'||o.supplier_seen_at||!o.response_requested_at)return;
  let active=true,started=false,controller,timer;
  const mark=async()=>{
   if(started||document.visibilityState!=='visible')return;started=true;setSeenBusy(true);setSeenError('');controller=new AbortController();timer=setTimeout(()=>controller.abort(),8000);
   try{const result=await api(`orders/${o.id}`,{method:'PATCH',body:JSON.stringify({action:'seen',responseRequestedAt:o.response_requested_at}),signal:controller.signal});if(active)onSeenRef.current(o.id,result.supplier_seen_at);}
   catch(problem){if(active)setSeenError('발주 확인 상태를 저장하지 못했어요. 다시 시도해주세요.');}
   finally{clearTimeout(timer);if(active)setSeenBusy(false);}
  };
  mark();document.addEventListener('visibilitychange',mark);
  return()=>{active=false;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',mark);};
 },[o.id,o.status,o.response_requested_at,o.supplier_seen_at,isSupplier,seenRetry]);
 const terms=o.approved_snapshot?.proposal||o.proposal;
 return <div className="member-order-detail"><div className="member-row"><span className="member-tag">{orderStates[o.status]}</span><small>{when(o.created_at)}</small></div><h3>{o.spec.name}</h3><Spec spec={o.approved_snapshot?.spec||o.spec}/><Links files={o.spec.files}/><dl className="member-spec"><div><dt>수량</dt><dd>{money(o.quantity)}개</dd></div><div><dt>희망 납품일</dt><dd>{o.requested_date}</dd></div><div><dt>배송지</dt><dd>{o.address}</dd></div><div><dt>{isBrand?'제작 업체':'브랜드'}</dt><dd>{(isBrand?o.supplier_name:o.brand_name)||'매칭 중'}</dd></div>{o.note&&<div><dt>요청 사항</dt><dd>{o.note}</dd></div>}</dl>
 {isSupplier&&o.status==='assigned'&&<div className="member-response-status">{o.overdue?<strong className="member-attention overdue">답변 지연</strong>:<strong>{o.supplier_seen_at?'발주 확인 완료':'발주 확인 중'}</strong>}<span>{o.response_due_at?`견적 답변 기준 · ${when(o.response_due_at)}`:''}</span>{seenBusy&&<small role="status">확인 상태를 저장하고 있어요.</small>}{seenError&&<p className="member-error" role="alert">{seenError}<button type="button" onClick={()=>setSeenRetry(value=>value+1)}>다시 시도</button></p>}</div>}
 {terms&&<section className="member-quote"><h3>{o.approved_snapshot?'승인한 최종 조건':'제작 업체의 견적'}</h3><strong>{money(terms.totalPrice)}원</strong><p>부가세·배송비 포함 총액 · 납품일 {terms.deliveryDate}</p><p className="member-pre">{terms.terms}</p>{o.approved_snapshot&&<small>{when(o.approved_snapshot.approvedAt)} 승인 · 당시 사양과 파일 보관</small>}</section>}
 {o.shipping&&<section className="member-quote"><h3><Truck size={22}/> 출고 안내</h3><p>{o.shipping.carrier} · {o.shipping.tracking}</p><p>{o.shipping.note}</p></section>}
 {isBrand&&o.status==='matched'&&<Form onSave={()=>action('share',{consent:true})}><h3>이 업체와 견적을 진행할까요?</h3><p>{o.supplier_name}에 사양·첨부 파일·수량·납기·배송지·요청 사항을 전달합니다. 사업자등록증은 전달하지 않아요.</p><label className="member-check"><input type="checkbox" required/>테스트 제작 자료 전달에 동의합니다.</label><Button type="submit">연결하고 견적 받기</Button></Form>}
 {isSupplier&&['assigned','quoted'].includes(o.status)&&<Form onSave={values=>action('quote',values)}><h3>{o.status==='quoted'?'견적 수정':'견적 답변'}</h3><div className="member-form-grid"><Field label="총 견적 (원, 부가세·배송비 포함)" name="totalPrice" type="number" min="1" max="100000000000" step="1" defaultValue={o.proposal?.totalPrice||''} required/><Field label="가능 납품일" name="deliveryDate" type="date" min={today()} defaultValue={o.proposal?.deliveryDate||''} required/></div><Field label="제작·결제 조건"><textarea name="terms" maxLength={2000} defaultValue={o.proposal?.terms||''} required rows={3}/></Field><Button type="submit">견적 보내기</Button></Form>}
 {isBrand&&o.status==='quoted'&&<><Form onSave={()=>action('approve',{consent:true})}><label className="member-check"><input type="checkbox" required/>사양·파일·금액·수량·납기를 확인했습니다.</label><Button type="submit">최종 조건 승인</Button></Form><Form onSave={values=>action('revise',values)}><Field label="조정이 필요한 내용"><textarea name="message" maxLength={2000} rows={2} required/></Field><Button tone="secondary" type="submit">조건 재확인 요청</Button></Form></>}
 {isSupplier&&o.status==='approved'&&<Form onSave={()=>action('produce')}><Button type="submit">제작 시작</Button></Form>}
 {isSupplier&&o.status==='producing'&&<Form onSave={values=>action('ship',values)}><h3>출고 정보</h3><Field label="배송 업체 / 전달 방법" name="carrier" maxLength={100} required/><Field label="운송장 번호 / 직접 전달 내역" name="tracking" maxLength={100} required/><Field label="출고 메모" name="message" maxLength={1000}/><Button type="submit">출고 기록</Button></Form>}
 {isBrand&&o.status==='shipped'&&<Form onSave={()=>action('receive')}><label className="member-check"><input type="checkbox" required/>받은 제품을 확인했습니다.</label><Button type="submit">입고 확인</Button></Form>}
 <details className="member-history" open><summary>변경·승인 기록 {events.length}</summary><ol>{events.map((e,i)=><li key={i}><strong>{e.action}</strong><small>{e.actor_name} · {when(e.created_at)}</small>{e.details.message&&<p>{e.details.message}</p>}{e.details.totalPrice&&<p>{money(e.details.totalPrice)}원 · {e.details.deliveryDate}<br/>{e.details.terms}</p>}{e.details.supplier&&<p>{e.details.supplier}</p>}{e.details.carrier&&<p>{e.details.carrier} · {e.details.tracking}</p>}</li>)}</ol></details>
 {!['received','cancelled'].includes(o.status)&&<Form onSave={values=>action('message',values)}><Field label="문의·진행 사항 남기기"><textarea name="message" maxLength={2000} rows={3} required placeholder="중요한 합의는 최종 조건 승인으로 확정해주세요."/></Field><Button type="submit" tone="secondary">기록 남기기</Button></Form>}
 {isBrand&&<div className="member-bottom-actions"><Button tone="secondary" onClick={()=>onRepeat(o)}><ArrowsClockwise size={20}/> 지난 사양으로 다시 요청</Button>{['requested','matched','assigned','quoted'].includes(o.status)&&<details><summary>요청 취소</summary><Form onSave={values=>action('cancel',values)}><Field label="취소 사유" name="message" maxLength={1000} required/><Button tone="secondary" type="submit">요청 취소하기</Button></Form></details>}</div>}
 </div>;
}
export default function MemberPortal({signupContext,member,onMember,authLoading,Button,Modal,onLegacy,requestedOrder,onOrderOpened,onAttentionChange}){
 const [tab,setTab]=useState('packagings'),[packagings,setPackagings]=useState([]),[orders,setOrders]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[status,setStatus]=useState('');
 const [partners,setPartners]=useState([]),[loadedMember,setLoadedMember]=useState(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[editor,setEditor]=useState(null),[detail,setDetail]=useState(null),[detailId,setDetailId]=useState(null),[detailError,setDetailError]=useState('');
 const active=useRef(0),handledOrder=useRef(null);
 const [detailReload,setDetailReload]=useState(0);
 const reload=async()=>{const generation=++active.current;setLoading(true);setError('');try{const [p,o,connections,profile]=await Promise.all([member.role==='brand'?api('packagings'):Promise.resolve({packagings:[]}),api(`orders?page=${page}&status=${status}`),api('partners'),api('member/me')]);if(generation===active.current){setPackagings(p.packagings);setOrders(o.orders);setTotal(o.total);setPartners(connections.partners);setLoadedMember(member.id);onMember(profile.member);}}catch(e){if(generation===active.current){setError(e.message);if(e.status===401)onMember(null);}}finally{if(generation===active.current)setLoading(false);}};
 useEffect(()=>{if(!member)return;reload();return()=>{active.current++;};},[member?.id,page,status]);
 useEffect(()=>{setTab(member?.role==='supplier'?'orders':'packagings');setEditor(null);setDetailId(null);setDetail(null);setPage(1);setStatus('');},[member?.id]);
 useEffect(()=>{if(!member)return;const refresh=()=>{if(document.visibilityState==='visible'&&!editor&&!detailId)reload();};window.addEventListener('focus',refresh);const timer=setInterval(refresh,20000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer);};},[member?.id,page,status,editor,detailId]);
 useEffect(()=>{
  if(!member||!requestedOrder||handledOrder.current===requestedOrder.key)return;
  handledOrder.current=requestedOrder.key;
  if((editor||detailId)&&!confirm('현재 창을 닫고 발주 알림을 확인할까요? 입력 중인 내용은 저장되지 않습니다.')){onOrderOpened?.();return;}
  setEditor(null);setTab('orders');setDetailId(requestedOrder.id);setDetailReload(value=>value+1);onOrderOpened?.();
 },[member?.id,requestedOrder]);
 useEffect(()=>{if(!detailId)return;let alive=true;setDetail(null);setDetailError('');api(`orders/${detailId}`).then(data=>{if(alive)setDetail(data);}).catch(e=>{if(alive)setDetailError(e.message);});return()=>{alive=false;};},[detailId,detailReload]);
 if(authLoading)return <section className="member-shell"><p role="status">계정을 확인하고 있어요.</p></section>;
 if(!member)return <Auth key={signupContext?JSON.stringify(signupContext):'login'} onMember={onMember} Button={Button} signupContext={signupContext}/>;
 const ready=loadedMember===member.id,currentPartners=ready?partners:[],currentPackagings=ready?packagings:[],currentOrders=ready?orders:[],activePartners=currentPartners.filter(p=>p.status==='active');
 const repeat=o=>{setDetailId(null);setDetail(null);setEditor({kind:'request',data:o,sourceId:o.id,previousPrice:o.approved_snapshot?.proposal?.totalPrice||o.proposal?.totalPrice});};
 return <section className="member-shell"><p className="member-pilot">테스트 운영 · 실제 개인정보와 거래 자료는 입력하지 마세요.</p><header className="member-heading"><div><span className="member-eyebrow">{member.role==='brand'?'BRAND WORKSPACE':'PARTNER WORKSPACE'}</span><h1>{member.name}<span>님의 마이페이지</span></h1></div><Button tone="ghost" onClick={async()=>{try{await send('member/logout',{});onMember(null);}catch(e){setError(e.message);}}}><SignOut size={20}/> 로그아웃</Button></header>
 <section className="member-partners"><div className="member-section-heading"><h2>{member.role==='brand'?'거래 중인 제작 업체':'거래 중인 브랜드'} <span>{activePartners.length}</span></h2><Button tone="ghost" onClick={reload} disabled={loading}><ArrowsClockwise size={18}/> 새로고침</Button></div>{activePartners.length?<div className="member-partner-grid">{activePartners.map(p=><article key={p.id} className="member-partner-card"><div className="member-symbol">{member.role==='brand'?<Factory size={26}/>:<Storefront size={26}/>}</div><div><strong>{p.partner_name||(member.role==='brand'?p.supplier_name:p.brand_name)}</strong><p>{[p.partner_contact,p.partner_phone?formatPhone(p.partner_phone):''].filter(Boolean).join(' · ')}</p>{!p.available&&<small>현재 새 발주를 받을 수 없어요. 팩트너에 문의해주세요.</small>}</div><span className="member-tag">{p.available?'연결됨':'확인 필요'}</span></article>)}</div>:<p className="member-hint">{loading?'연결 정보를 확인하고 있어요.':'팩트너가 연결한 거래 업체가 여기에 표시돼요.'}</p>}</section>
 <div className="member-tabs member-work-tabs" role="tablist" aria-label="마이페이지">{[...(member.role==='brand'?[['packagings','내 패키징']]:[]),['orders',member.role==='brand'?'발주 내역':'받은 발주'],['profile','내 정보']].map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>setTab(key)}>{label}</button>)}<button onClick={onLegacy}>기존 견적 조회</button></div>
 {error&&<p role="alert" className="member-error">{error}</p>}
 {tab==='packagings'&&<><div className="member-section-heading"><div><h2>우리 브랜드의 패키징</h2><p>저장한 사양으로 다음 발주도 간편하게.</p></div><Button onClick={()=>setEditor({kind:'packaging'})}><Plus size={21}/> 패키징 추가</Button></div>
 {!loading&&!currentPackagings.length&&<div className="member-empty"><Package size={54}/><h3>자주 쓰는 패키징을 저장해보세요</h3><p>규격과 디자인 파일을 매번 찾지 않아도 돼요.</p><Button onClick={()=>setEditor({kind:'packaging'})}>첫 패키징 저장</Button></div>}
 <div className="member-packaging-grid">{currentPackagings.map(p=><article className="member-card member-packaging" key={p.id}><div className="member-row"><div className="member-symbol"><Package size={30}/></div><button className="member-star" aria-label={`${p.spec.name} 즐겨찾기`} aria-pressed={!!p.favorite} onClick={async()=>{try{await send(`packagings/${p.id}`,{favorite:!p.favorite,version:p.version},'PATCH');await reload();}catch(e){setError(e.message);}}}><Star size={24} weight={p.favorite?'fill':'regular'}/></button></div><h3>{p.spec.name}</h3><p>{p.spec.size}</p><p>{[p.spec.material,p.spec.printing,p.spec.finish].filter(Boolean).join(' · ')}</p><div className="member-card-actions"><Button onClick={()=>setEditor({kind:'request',data:p})}>발주 요청 <ArrowRight size={18}/></Button><button onClick={()=>setEditor({kind:'packaging',data:p})}>수정</button><button onClick={async()=>{if(!confirm('내 패키징에서 보관할까요? 지난 발주 기록은 유지됩니다.'))return;try{await send(`packagings/${p.id}`,{archived:true,version:p.version},'PATCH');await reload();}catch(e){setError(e.message);}}}>보관</button></div></article>)}</div></>}
 {tab==='orders'&&<><div className="member-section-heading"><div><h2>{member.role==='brand'?'발주 내역':'제작할 패키징'}</h2><p>{ready?total:0}건 · 요청부터 입고까지 기록해요.</p></div><div className="member-inline"><Button tone="secondary" onClick={reload}><ArrowsClockwise size={20}/> 새로고침</Button>{member.role==='brand'&&<Button onClick={()=>setEditor({kind:'request'})}><Plus size={20}/> 새 발주</Button>}</div></div><label className="member-filter">진행 상태<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">전체</option>{Object.entries(orderStates).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 <div className="member-order-list">{currentOrders.map(o=><button key={o.id} className="member-order-row" onClick={()=>setDetailId(o.id)}><span className="member-symbol"><Package size={26}/></span><span className="member-order-name"><strong>{o.spec.name}</strong><small>{money(o.quantity)}개 · {member.role==='brand'?o.supplier_name||'업체 매칭 중':o.brand_name}</small></span><span className="member-order-labels">{member.role==='supplier'&&o.unread&&<span className="member-attention">미확인</span>}{member.role==='supplier'&&o.overdue&&<span className="member-attention overdue">답변 지연</span>}<span className="member-tag">{orderStates[o.status]}</span></span><span className="member-order-date">{o.requested_date}</span><ArrowRight size={20}/></button>)}</div>{!loading&&!currentOrders.length&&<div className="member-empty"><Clock size={48}/><h3>아직 발주 내역이 없어요</h3><p>{member.role==='brand'?'내 패키징에서 첫 발주를 요청해보세요.':'팩트너가 연결한 발주가 여기에 모여요.'}</p></div>}<div className="member-pagination"><Button tone="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>이전</Button><span>{page} / {Math.max(1,Math.ceil(total/30))}</span><Button tone="secondary" disabled={page*30>=total} onClick={()=>setPage(p=>p+1)}>다음</Button></div></>}
 {tab==='profile'&&<div className="member-profile-grid"><section className="member-card"><div className="member-symbol"><ShieldCheck size={30}/></div><h2>내 계정</h2><dl className="member-spec">{[['가입 유형',`${member.role==='brand'?'브랜드':'제작 업체'} · ${legalTypes[member.legal_type]}`],['이메일',member.email],['담당자',member.contact],['연락처',member.phone],['사업자번호',member.business_number||'해당 없음'],['계정 상태','가입 승인']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section><section className="member-card"><h2>비밀번호 변경</h2><Form onSave={async values=>{await send('member/password',values);onMember(null);}}><Field label="현재 비밀번호" name="currentPassword" type="password" autoComplete="current-password" required/><Field label="새 비밀번호 · 8자 이상" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/><Button type="submit">변경 후 다시 로그인</Button></Form></section></div>}
 {loading&&<p role="status" className="member-hint">내역을 불러오고 있어요.</p>}
 <Modal open={ready&&!!editor} onClose={()=>setEditor(null)} title={editor?.kind==='packaging'?'내 패키징':'견적·발주 요청'} description="사양과 첨부 자료를 확인해주세요." wide>{ready&&editor&&<div className="member-modal"><Editor key={`${editor.kind}-${editor.data?.id||'new'}`} editor={editor} Button={Button} partners={currentPartners} onDone={async()=>{setEditor(null);await reload();}}/></div>}</Modal>
 <Modal open={ready&&!!detailId} onClose={()=>setDetailId(null)} title="발주 상세" description="조건과 진행 상황을 한곳에서 확인해요." wide><div className="member-modal">{detailError&&<p className="member-error" role="alert">{detailError}</p>}{!detail&&!detailError&&<p role="status">불러오고 있어요.</p>}{ready&&detail&&<OrderDetail key={`${detail.order.id}-${detail.order.version}`} data={detail} member={member} Button={Button} onRepeat={repeat} onSeen={(id,seenAt)=>{setDetail(current=>current?.order.id===id?{...current,order:{...current.order,supplier_seen_at:seenAt||new Date().toISOString(),unread:false}}:current);setOrders(current=>current.map(order=>order.id===id?{...order,supplier_seen_at:seenAt||new Date().toISOString(),unread:false}:order));onAttentionChange?.();}} onUpdate={async()=>{setDetail(await api(`orders/${detailId}`));await reload();onAttentionChange?.();}}/>}</div></Modal>
 </section>;
}
