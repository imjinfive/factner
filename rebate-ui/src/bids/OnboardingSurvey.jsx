import {useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,ArrowRight,Check,CaretDown,Package,Storefront,Factory} from '@phosphor-icons/react';
import PackagingArt from './PackagingArt';
import PackagingPicker from './PackagingPicker';
import NumericInput from './NumericInput';
import SurveyCalendar from './SurveyCalendar';
import SurveySummary from './SurveySummary';
import {restoreSurveyEntry} from './onboarding-history';
import {complaints,supplierGoals,capacityOptions,availabilityOptions,supplierStrengths,brandImages,supplierPriorities,selectedProductInfo,productOptions,emptyOnboardingDraft,normalizeOnboardingDraft,readOnboardingDraft,saveOnboardingDraft,surveySteps,onboardingResumeStep,matchingSurveyPosts} from './onboarding-data';
import './onboarding.css';

const spring={type:'spring',stiffness:380,damping:31,mass:.85};
const timeOptions=['일정 협의 가능','아직 알아보는 중'];
function initialState(requestMode,initialDraft){
 if(requestMode){const saved=history.state?.postSurvey;return {draft:normalizeOnboardingDraft(saved?.draft||initialDraft||{...emptyOnboardingDraft(),role:'brand'}),step:saved?.step==='conditions'?'conditions':'packaging',index:saved?.index||0};}
 return restoreSurveyEntry(history.state?.onboardingSurvey,readOnboardingDraft());
}
function Choice({children,selected,onClick,large=false,disabled=false}){
 const reduce=useReducedMotion();
 return <motion.button type="button" className={'ob-choice'+(selected?' is-selected':'')+(large?' ob-choice-large':'')} aria-pressed={Boolean(selected)} disabled={disabled} onClick={onClick} whileTap={reduce?undefined:{scale:.975}} transition={spring}>
  <span>{children}</span><span className="ob-choice-check" aria-hidden="true">{selected?<Check size={16} weight="bold"/>:<span/>}</span>
 </motion.button>;
}
function PickGrid({options,value,onChange,multiple=false,max=Infinity}){return <div className="ob-options">{options.map(option=>{const [id,label]=Array.isArray(option)?option:[option,option];return <Choice key={id} disabled={multiple&&value.length>=max&&!value.includes(id)} selected={multiple?value.includes(id):value===id} onClick={()=>onChange(id)}>{label}</Choice>;})}</div>;}
export default function OnboardingSurvey({onContinue,posts=[],partners=[],onLogin,requestMode=false,initialDraft,onCancel}){
 const [state,setState]=useState(()=>initialState(requestMode,initialDraft)),[error,setError]=useState(''),[direction,setDirection]=useState(1);
 const {draft,step,index}=state,brand=draft.role==='brand',reduce=useReducedMotion(),heading=useRef(null),mounted=useRef(false);
 const steps=requestMode?['packaging','conditions']:surveySteps(draft),position=steps.indexOf(step),selectedProduct=selectedProductInfo(draft),historyKey=requestMode?'postSurvey':'onboardingSurvey';
 const persist=requestMode?normalizeOnboardingDraft:saveOnboardingDraft;
 useEffect(()=>{
  const restore=()=>{const saved=history.state?.[historyKey];if(saved){const restored=requestMode?{draft:normalizeOnboardingDraft(saved.draft),step:saved.step==='conditions'?'conditions':'packaging',index:saved.index||0}:restoreSurveyEntry(saved);setDirection(-1);setState(restored);persist(restored.draft);setError('');}};
  window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[requestMode]);
 useEffect(()=>{
  if(!mounted.current){mounted.current=true;return;}
  heading.current?.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
 },[step]);
 function update(patch){
  const next={...draft,...patch};
  persist(next);setState({draft:next,step,index});setError('');
  history.replaceState({...history.state,[historyKey]:{draft:next,step,index}},'');
 }
 function move(nextStep,nextDraft=draft){
  const clean=persist(nextDraft);
  history.replaceState({...history.state,[historyKey]:{draft,step,index}},'');
  history.pushState({...history.state,[historyKey]:{draft:clean,step:nextStep,index:index+1}},'');
  setDirection((requestMode?steps:surveySteps(clean)).indexOf(nextStep)>position?1:-1);setState({draft:clean,step:nextStep,index:index+1});setError('');
 }
 function rolePick(role){
  const next={...emptyOnboardingDraft(),role};
  move(role==='brand'?'experience':'packaging',next);
 }
 function toggle(field,id){
  let selected=draft[field]||[];
  selected=selected.includes(id)?selected.filter(v=>v!==id):[...selected,id];
  if(field==='complaints')selected=id==='특별한 불만은 없어요'?selected.filter(v=>v===id):selected.filter(v=>v!=='특별한 불만은 없어요');
  update({[field]:selected});
 }
 function next(){
  if(step==='packaging'&&brand&&!draft.variant&&draft.material!=='unknown')return setError('세부 제품을 고르거나 추천받기를 선택해 주세요.');
  if(step==='packaging'&&!brand&&!draft.supplierProducts.length)return setError('주력 제작 품목을 하나 이상 선택해 주세요.');
  if(step==='conditions'){
   if(!draft.quantityUnknown&&(!/^\d+$/.test(draft.quantity)||Number(draft.quantity)<1||Number(draft.quantity)>100000000))return setError('수량을 입력하거나 아직 모르겠어요를 선택해 주세요.');
   if(!draft.sizeUnknown&&(!draft.width||!draft.depth))return setError('가로·세로를 입력하거나 크기를 아직 모르겠어요를 선택해 주세요.');
   if(!draft.sizeUnknown&&[draft.width,draft.depth,draft.height].filter(Boolean).some(v=>!/^\d+(?:\.\d+)?$/.test(v)||Number(v)<=0||Number(v)>100000))return setError('크기는 0보다 큰 숫자로 입력해 주세요.');
   if(!draft.budgetUnknown&&draft.budget&&(!/^\d+$/.test(draft.budget)||Number(draft.budget)<1||Number(draft.budget)>1000000000))return setError('희망 단가는 1원부터 10억 원까지 입력해 주세요. 모르면 비워두셔도 괜찮아요.');
  }
  if(step==='capacity'&&(!draft.quantityRange.length||!draft.availability.length))return setError('수량과 상담 가능 여부를 선택해 주세요.');
  if(requestMode&&step==='conditions'){onContinue(persist(draft));return;}
  move(steps[position+1]);
 }
 function continueSignup(){const clean=saveOnboardingDraft(draft);onContinue(clean);}
 const title={experience:'패키징을 제작해 보셨나요?',complaints:'어떤 점이 아쉬우셨나요?',packaging:brand?'어떤 패키징을 찾고 계세요?':'어떤 패키징을 제작하시나요?',conditions:'대략적인 조건만 알려주세요.',capacity:'어떤 주문이 잘 맞으세요?',goals:'어떤 거래를 늘리고 싶으세요?',strengths:'우리 업체의 가장 큰 강점은요?',brandImage:'우리 브랜드를 나타내는 이미지를 선택해주세요.',priorities:'제작업체에게 가장 원하는 것은요?',result:brand?'제작 의뢰를 준비했어요.':'우리 업체의 다음 거래를 찾아요.'}[step];
 const briefs=matchingSurveyPosts(posts,draft);
 const matchingPartners=partners.filter(p=>p.example!==true&&['packaging','both'].includes(p.kind)&&/^(?:[A-Z]|[1-9]\d*)업체$/.test(p.alias||'')&&((draft.material==='paper'&&p.items?.includes('box'))||(['vinyl','pouch','plastic','glass','metal','wood','cold'].includes(draft.material)&&p.items?.includes('packaging')))).slice(0,3);
 return <section className={'ob-shell'+(step==='role'?' ob-home':'')+(step==='packaging'?' ob-catalog-step':'')} aria-label="팩트너 시작하기">
  {step==='role'?<>
   <div className="ob-home-title"><h1>거래의 신뢰는 <span>팩트너부터.</span></h1><p>패키징을 고르고, 제작업체의 견적을 비교하세요.</p></div>
   <div className="ob-role-panels">
    {[['brand','패키징을 의뢰하고 싶어요','개인도 브랜드도 신청할 수 있어요.',Storefront],['supplier','패키징 제작업체입니다','새로운 고객을 찾고 있어요.',Factory]].map(([role,label,copy,Icon])=><motion.button key={role} type="button" className="ob-role" onClick={()=>rolePick(role)} whileTap={reduce?undefined:{scale:.99}} transition={spring}><span className="ob-role-icon"><Icon size={62} weight="duotone" aria-hidden="true"/></span><div className="ob-role-copy"><h2>{label}</h2><p>{copy}</p></div><span className="ob-role-arrow"><ArrowRight size={22}/></span></motion.button>)}
   </div>
   <p className="ob-home-note">몇 가지 선택으로 시작해요. 어려운 사양은 몰라도 괜찮아요.</p>
   {draft.role&&<button type="button" className="ob-resume" onClick={()=>move(onboardingResumeStep(draft))}>작성한 내용 이어보기 <ArrowRight size={16}/></button>}
  </>:<>
   <div className="ob-topline"><button type="button" className="ob-back" onClick={()=>step==='packaging'&&draft.catalogLevel!=='materials'?update({catalogLevel:draft.catalogLevel==='variants'?'families':'materials'}):requestMode&&step==='packaging'?onCancel?.():index>0?history.back():move(steps[Math.max(0,position-1)])}><ArrowLeft size={19}/><span>이전</span></button><div className="ob-progress" aria-label={`${requestMode?position+1:position} / ${requestMode?steps.length:steps.length-1} 단계`}>{(requestMode?steps:steps.slice(1)).map((s,i)=><span key={s} className={i<(requestMode?position+1:position)?'is-done':''}/>)}</div><span aria-hidden="true"/></div>
   <AnimatePresence mode="wait" initial={false}><motion.div key={step} className="ob-stage" initial={reduce?{opacity:0}:{opacity:0,x:direction*22}} animate={{opacity:1,x:0}} exit={reduce?{opacity:0}:{opacity:0,x:-direction*15}} transition={reduce?{duration:.1}:spring} onAnimationComplete={()=>heading.current?.focus({preventScroll:true})}>
    <header className="ob-heading"><h1 ref={heading} tabIndex={-1}>{title}</h1>
     {step==='complaints'&&<p>해당하는 항목을 모두 골라주세요.<br/>건너뛰어도 괜찮아요.</p>}
     {step==='packaging'&&<p>{brand?'마음에 드는 형태부터 골라보세요.':'주력 품목만 골라주세요. 여러 개 선택할 수 있어요.'}</p>}
     {step==='conditions'&&<p>아는 만큼만 입력하세요. 나머지는 상담하며 정해요.</p>}
     {step==='goals'&&<p>관심 있는 거래를 모두 골라주세요. 선택 사항이에요.</p>}
     {step==='capacity'&&<p>각 질문에서 여러 항목을 선택할 수 있어요.</p>}
     {step==='strengths'&&<p>최대 2개를 골라주세요. 건너뛰어도 괜찮아요.<br/>팩트너가 업체를 이해하고 현장 상담을 준비하는 데 참고해요.</p>}
     {step==='brandImage'&&<p>여러 개를 고르거나 직접 적어주세요. 선택 사항이에요.</p>}
     {step==='priorities'&&<p>중요한 조건을 모두 골라주세요. 선택 사항이에요.<br/>공고 작성 시 이 내용이 함께 입력되어 제작업체도 볼 수 있어요.</p>}
    </header>
    {step==='experience'&&<div className="ob-experience"><Choice large selected={draft.experience==='yes'} onClick={()=>move('complaints',{...draft,experience:'yes'})}>네, 제작해본 적 있어요.</Choice><Choice large selected={draft.experience==='no'} onClick={()=>move('packaging',{...draft,experience:'no',complaints:[]})}>아니요, 처음 제작해봐요.</Choice></div>}
    {step==='complaints'&&<PickGrid options={complaints} value={draft.complaints} multiple onChange={id=>toggle('complaints',id)}/>}
    {step==='packaging'&&<PackagingPicker draft={draft} onUpdate={update} onToggle={toggle}/>}
    {step==='conditions'&&<div className="ob-conditions">
     <div className="ob-selected-product"><PackagingArt kind={draft.variant||draft.product||draft.material}/><div><strong>{selectedProduct?.name||'형태 추천받기'}</strong><span>{selectedProduct?.label||draft.productUse||'상담하며 함께 정해요'}</span></div><button type="button" onClick={()=>move('packaging')}>제품 변경</button></div>
     <div className="ob-condition-main">
     <fieldset><legend>제작 수량</legend><div className="ob-input-unit"><NumericInput aria-label="예상 수량" value={draft.quantity} disabled={draft.quantityUnknown} maxLength={9} onValueChange={quantity=>update({quantity})} placeholder="예: 1,000"/><span>개</span></div><label className="ob-check"><input type="checkbox" checked={draft.quantityUnknown} onChange={e=>update({quantityUnknown:e.target.checked,...(e.target.checked?{quantity:''}:{})})}/>아직 모르겠어요</label></fieldset>
     <fieldset><legend>크기</legend><div className="ob-size-basis"><button type="button" aria-pressed={draft.sizeBasis==='package'} onClick={()=>update({sizeBasis:'package'})}>포장 크기</button><button type="button" aria-pressed={draft.sizeBasis==='product'} onClick={()=>update({sizeBasis:'product'})}>담을 제품 크기</button></div><div className="ob-dimensions">{[['width','가로'],['depth','세로'],['height','높이']].map(([key,label])=><label key={key}>{label}{key==='height'&&<span className="ob-optional">선택</span>}<span className="ob-input-unit"><NumericInput aria-label={label} allowDecimal value={draft[key]} disabled={draft.sizeUnknown} maxLength={10} onValueChange={value=>update({[key]:value})} placeholder="0"/><span>mm</span></span></label>)}</div><p className="ob-field-hint">정확하지 않아도 괜찮아요. 납작한 포장은 높이를 비워두세요.</p><label className="ob-check"><input type="checkbox" checked={draft.sizeUnknown} onChange={e=>update({sizeUnknown:e.target.checked,...(e.target.checked?{width:'',depth:'',height:''}:{})})}/>크기를 아직 모르겠어요</label></fieldset>
     <fieldset className="ob-timing"><legend>언제 필요하세요? <span>선택</span></legend><SurveyCalendar value={draft.requiredDate} onChange={requiredDate=>update({requiredDate,timing:''})}/><PickGrid options={timeOptions} value={draft.timing} onChange={id=>update({timing:id,requiredDate:''})}/></fieldset>
     {productOptions(draft.product).length>0&&<details className="ob-detail-options"><summary>재질·외관을 정해뒀어요 <span>선택</span><CaretDown size={17}/></summary><div className="ob-detail-option-fields">{productOptions(draft.product).map(option=><label key={option.key}>{option.label}<select value={draft[option.key]||''} onChange={e=>update({[option.key]:e.target.value})}><option value="">추천받을게요</option>{option.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>{option.hint&&<span className="ob-field-hint">{option.hint}</span>}</label>)}{draft.material==='wood'&&<label>원하는 수종<input value={draft.woodSpecies} onChange={e=>update({woodSpecies:e.target.value})} maxLength={80} placeholder="모르면 비워두세요"/></label>}</div></details>}
     {draft.material==='cold'&&<p className="ob-field-hint">필요한 유지 온도와 시간은 포장 구성·배송 조건과 함께 확인해요.</p>}
     <details className="ob-budget"><summary>생각해 둔 가격이 있어요 <span>선택</span><CaretDown size={17}/></summary><label className="ob-check"><input type="checkbox" checked={draft.budgetUnknown} onChange={e=>update({budgetUnknown:e.target.checked})}/>가격은 업체의 제안을 받을게요</label>{!draft.budgetUnknown&&<label>희망 개당 단가<div className="ob-input-unit"><NumericInput aria-label="희망 개당 단가" value={draft.budget} maxLength={10} onValueChange={budget=>update({budget})} placeholder="희망 가격"/><span>원</span></div></label>}</details>
    </div></div>}
    {step==='capacity'&&<div className="ob-capacity"><fieldset><legend>주로 받는 주문 수량</legend><PickGrid options={capacityOptions} value={draft.quantityRange} multiple onChange={id=>toggle('quantityRange',id)}/></fieldset><fieldset><legend>새로운 의뢰, 받을 수 있나요?</legend><PickGrid options={availabilityOptions} value={draft.availability} multiple onChange={id=>toggle('availability',id)}/></fieldset></div>}
    {step==='goals'&&<PickGrid options={supplierGoals} value={draft.goals} multiple onChange={id=>toggle('goals',id)}/>}
    {step==='strengths'&&<><p className="ob-selection-count" role="status">{draft.strengths.length} / 2개 선택</p><PickGrid options={supplierStrengths} value={draft.strengths} multiple max={2} onChange={id=>toggle('strengths',id)}/></>}
    {step==='brandImage'&&<><div className="ob-image-options"><PickGrid options={brandImages} value={draft.brandImages} multiple onChange={id=>toggle('brandImages',id)}/></div><div className="ob-own-image"><label htmlFor="ob-brand-image">직접 입력 <span>선택</span></label><input id="ob-brand-image" value={draft.brandImageOther} maxLength={120} onChange={e=>update({brandImageOther:e.target.value})} placeholder="예: 따뜻하고 자연을 생각하는 이미지"/><p>공고에 함께 표시돼요. 브랜드명·연락처는 적지 말아주세요.</p></div></>}
    {step==='priorities'&&<PickGrid options={supplierPriorities} value={draft.supplierPriorities} multiple onChange={id=>toggle('supplierPriorities',id)}/>}
    {step==='result'&&<div className="ob-result-layout"><SurveySummary draft={draft} onEdit={()=>move(brand?'conditions':'capacity')}/>
     <div className="ob-result-next"><h2>{brand?'이 내용으로 견적을 받아보세요.':'할 수 있는 일부터 제안해 보세요.'}</h2><p>{brand?'가입 후 공고 내용을 확인하면 제작업체가 견적을 제안할 수 있어요.':'가입 후 업체 확인을 마치면 제작 의뢰에 입찰할 수 있어요.'}</p>
      {brand&&matchingPartners.length>0&&<div className="ob-related"><strong>{draft.material==='paper'?'박스 분야 등록 업체':'패키징 분야 등록 업체'}</strong>{matchingPartners.map(p=><div key={p.alias}><Package size={17}/><span>{p.alias}</span></div>)}<small>선택한 소재·형태의 제작 가능 여부는 확인이 필요해요.</small></div>}
      {!brand&&briefs.length>0&&<div className="ob-briefs"><strong>모집 중인 관련 의뢰</strong>{briefs.map(post=><button key={post.id} type="button" aria-pressed={draft.selectedPostId===post.id} onClick={()=>update({selectedPostId:post.id})}><span>{post.title}</span><span>{post.quantity?Number(post.quantity).toLocaleString('ko-KR')+'개':'수량 협의'}{draft.selectedPostId===post.id?<Check size={17}/>:<ArrowRight size={17}/>}</span></button>)}</div>}
      {!brand&&!briefs.length&&<p className="ob-no-briefs">지금 모집 중인 관련 의뢰가 없어요.<br/>선택한 제작 분야는 가입 후에도 유지돼요.</p>}
      <button type="button" className="ob-primary ob-result-cta" onClick={continueSignup}>{brand?'가입하고 공고 등록하기':'가입하고 입찰 준비하기'}<ArrowRight size={19}/></button><span className="ob-continue-note">입력한 내용이 그대로 이어져요.</span>{onLogin&&<button type="button" className="ob-existing" onClick={()=>{saveOnboardingDraft(draft);onLogin(draft);}}>이미 가입했다면 로그인</button>}
     </div></div>}
    {error&&step!=='packaging'&&<p className="ob-error" role="alert">{error}</p>}
    {!['experience','result'].includes(step)&&<footer className={'ob-actions'+(step==='packaging'?' ob-actions-sticky':'')}>{step==='packaging'&&<span className={'ob-action-selection'+(error?' ob-error':'')} role={error?'alert':'status'}>{error|| (brand?(draft.material==='unknown'?'형태 추천받기':draft.variant?selectedProduct?.name:'원하는 제품을 골라주세요'):`${draft.supplierProducts.length}개 품목 선택`)}</span>}{['complaints','goals','strengths','brandImage','priorities'].includes(step)&&<button type="button" className="ob-skip" onClick={()=>move(steps[position+1])}>건너뛰기</button>}<button type="button" className="ob-primary" onClick={next}>{requestMode&&step==='conditions'?'내 요청 확인하기':step==='priorities'?'내 요청 확인하기':step==='strengths'?'관련 의뢰 보기':'다음'}<ArrowRight size={18}/></button></footer>}
   </motion.div></AnimatePresence>
  </>}
 </section>;
}
