import {useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,ArrowRight,Check,CheckCircle,CaretDown,Package,X} from '@phosphor-icons/react';
import PackagingArt from './PackagingArt';
import {materials,products,complaints,supplierGoals,productInfo,materialLabel,emptyOnboardingDraft,normalizeOnboardingDraft,readOnboardingDraft,saveOnboardingDraft,surveySteps,onboardingResumeStep,matchingSurveyPosts} from './onboarding-data';
import './onboarding.css';

const spring={type:'spring',stiffness:380,damping:31,mass:.85};
const timeOptions=['2주 이내','한 달 이내','일정 협의 가능','아직 알아보는 중'];
const capacityOptions=[['small','소량 주문도 받아요'],['medium','중간 규모가 적합해요'],['large','대량·반복 주문을 원해요'],['discuss','품목에 따라 달라요']];
const availabilityOptions=[['now','지금 상담 가능해요'],['discuss','일정 협의가 필요해요'],['later','앞으로 받을 의뢰를 찾아요']];
function initialState(){
 const saved=history.state?.onboardingSurvey;
 const draft=normalizeOnboardingDraft(saved?.draft||readOnboardingDraft());
 return {draft,step:surveySteps(draft).includes(saved?.step)?saved.step:'role',index:Number.isInteger(saved?.index)?saved.index:0};
}
function Choice({children,selected,onClick,large=false}){
 const reduce=useReducedMotion();
 return <motion.button type="button" className={'ob-choice'+(selected?' is-selected':'')+(large?' ob-choice-large':'')} aria-pressed={Boolean(selected)} onClick={onClick} whileTap={reduce?undefined:{scale:.975}} transition={spring}>
  <span>{children}</span><span className="ob-choice-check" aria-hidden="true">{selected?<Check size={16} weight="bold"/>:<span/>}</span>
 </motion.button>;
}
function PickGrid({options,value,onChange,multiple=false}){return <div className="ob-options">{options.map(option=>{const [id,label]=Array.isArray(option)?option:[option,option];return <Choice key={id} selected={multiple?value.includes(id):value===id} onClick={()=>onChange(id)}>{label}</Choice>;})}</div>;}
function ProductTile({id,label,name,selected,onClick}){
 const reduce=useReducedMotion();
 return <motion.button type="button" className={'ob-product'+(selected?' is-selected':'')} aria-pressed={selected} onClick={onClick} whileHover={reduce?undefined:{y:-4}} whileTap={reduce?undefined:{scale:.98}} transition={spring}>
  <PackagingArt kind={id}/><span className="ob-product-name">{label}<span className="ob-product-check">{selected?<CheckCircle size={23} weight="fill"/>:<ArrowRight size={20}/>}</span></span><span className="ob-product-detail">{name}</span>
 </motion.button>;
}

export default function OnboardingSurvey({onContinue,posts=[],partners=[],onLogin}){
 const [state,setState]=useState(initialState),[error,setError]=useState(''),[direction,setDirection]=useState(1);
 const {draft,step,index}=state,brand=draft.role==='brand',reduce=useReducedMotion(),heading=useRef(null),mounted=useRef(false);
 const steps=surveySteps(draft),position=steps.indexOf(step),selectedProduct=productInfo(draft.product);
 useEffect(()=>{
  const restore=()=>{const saved=history.state?.onboardingSurvey;if(saved){setDirection(-1);setState(previous=>{const nextDraft=normalizeOnboardingDraft(previous.draft.role===saved.draft?.role?previous.draft:saved.draft),nextStep=surveySteps(nextDraft).includes(saved.step)?saved.step:'role';return {draft:nextDraft,step:nextStep,index:saved.index||0};});setError('');}};
  window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[]);
 useEffect(()=>{
  if(!mounted.current){mounted.current=true;return;}
  heading.current?.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
 },[step]);
 function update(patch){
  const next={...draft,...patch};
  saveOnboardingDraft(next);setState({draft:next,step,index});setError('');
  history.replaceState({...history.state,onboardingSurvey:{draft:next,step,index}},'');
 }
 function move(nextStep,nextDraft=draft){
  const clean=saveOnboardingDraft(nextDraft);
  history.replaceState({...history.state,onboardingSurvey:{draft,step,index}},'');
  history.pushState({...history.state,onboardingSurvey:{draft:clean,step:nextStep,index:index+1}},'');
  setDirection(surveySteps(clean).indexOf(nextStep)>position?1:-1);setState({draft:clean,step:nextStep,index:index+1});setError('');
 }
 function rolePick(role){
  const next=draft.role===role?draft:{...emptyOnboardingDraft(),role};
  move(role==='brand'?'experience':'packaging',next);
 }
 function toggle(field,id){
  let selected=draft[field]||[];
  selected=selected.includes(id)?selected.filter(v=>v!==id):[...selected,id];
  if(field==='complaints')selected=id==='특별한 불만은 없어요'?selected.filter(v=>v===id):selected.filter(v=>v!=='특별한 불만은 없어요');
  update({[field]:selected});
 }
 function next(){
  if(step==='packaging'&&brand&&!draft.product&&draft.material!=='unknown')return setError('원하는 형태를 고르거나 추천받기를 선택해 주세요.');
  if(step==='packaging'&&!brand&&!draft.supplierProducts.length)return setError('주력 제작 품목을 하나 이상 선택해 주세요.');
  if(step==='conditions'){
   if(!draft.quantityUnknown&&(!/^\d+$/.test(draft.quantity)||Number(draft.quantity)<1||Number(draft.quantity)>100000000))return setError('수량을 입력하거나 아직 모르겠어요를 선택해 주세요.');
   if(!draft.sizeUnknown&&(!draft.width||!draft.depth))return setError('가로·세로를 입력하거나 크기를 아직 모르겠어요를 선택해 주세요.');
   if(!draft.sizeUnknown&&[draft.width,draft.depth,draft.height].filter(Boolean).some(v=>!/^\d+(?:\.\d+)?$/.test(v)||Number(v)<=0||Number(v)>100000))return setError('크기는 0보다 큰 숫자로 입력해 주세요.');
  }
  if(step==='capacity'&&(!draft.quantityRange||!draft.availability))return setError('수량과 상담 가능 여부를 선택해 주세요.');
  move(steps[position+1]);
 }
 function continueSignup(){const clean=saveOnboardingDraft(draft);onContinue(clean);}
 const title={experience:'패키징을\n제작해 보셨나요?',complaints:'어떤 점이\n아쉬우셨나요?',packaging:brand?'어떤 패키징을\n찾고 계세요?':'어떤 패키징을\n제작하시나요?',conditions:'대략적인 조건만\n알려주세요.',capacity:'어떤 주문이\n잘 맞으세요?',goals:'어떤 거래를\n늘리고 싶으세요?',result:brand?'견적을 받을 준비,\n여기까지 했어요.':'우리 업체의\n다음 거래를 찾아요.'}[step];
 const briefs=matchingSurveyPosts(posts,draft);
 const materialRows=products[draft.material]||[];
 const matchingPartners=partners.filter(p=>p.example!==true&&['packaging','both'].includes(p.kind)&&/^(?:[A-Z]|[1-9]\d*)업체$/.test(p.alias||'')&&((draft.material==='paper'&&p.items?.includes('box'))||(['vinyl','pouch','plastic','glass','metal','wood','cold'].includes(draft.material)&&p.items?.includes('packaging')))).slice(0,3);
 return <section className={'ob-shell'+(step==='role'?' ob-home':'')} aria-label="팩트너 시작하기">
  {step==='role'?<>
   <div className="ob-home-title"><h1>거래의 신뢰는<br/><span>팩트너부터.</span></h1><p>어떤 파트너를 찾고 계신가요?</p></div>
   <div className="ob-role-panels">
    {[['brand','브랜드를 운영하고 있어요','패키징 제작업체를 찾고 있어요.','paper-carton'],['supplier','패키징 제작업체입니다','새로운 고객을 찾고 있어요.','paper-corrugated']].map(([role,label,copy,art])=><motion.button key={role} type="button" className="ob-role" onClick={()=>rolePick(role)} whileHover={reduce?undefined:{y:-5}} whileTap={reduce?undefined:{scale:.985}} transition={spring}><div className="ob-role-copy"><h2>{label}</h2><p>{copy}</p><span className="ob-role-arrow"><ArrowRight size={25}/></span></div><div className="ob-role-art"><PackagingArt kind={art}/></div></motion.button>)}
   </div>
   <p className="ob-home-note">몇 가지 선택으로 시작해요. 어려운 사양은 몰라도 괜찮아요.</p>
   {draft.role&&<button type="button" className="ob-resume" onClick={()=>move(onboardingResumeStep(draft))}>작성한 내용 이어보기 <ArrowRight size={16}/></button>}
  </>:<>
   <div className="ob-topline"><button type="button" className="ob-back" onClick={()=>index>0?history.back():move(steps[Math.max(0,position-1)])}><ArrowLeft size={19}/><span>이전</span></button><div className="ob-progress" aria-label={`${position} / ${steps.length-1} 단계`}>{steps.slice(1).map((s,i)=><span key={s} className={i<position?'is-done':''}/>)}</div><button type="button" className="ob-reset" onClick={()=>move('role')} aria-label="브랜드 또는 제작업체 다시 선택"><X size={20}/></button></div>
   <AnimatePresence mode="wait" initial={false}><motion.div key={step} className="ob-stage" initial={reduce?{opacity:0}:{opacity:0,x:direction*22}} animate={{opacity:1,x:0}} exit={reduce?{opacity:0}:{opacity:0,x:-direction*15}} transition={reduce?{duration:.1}:spring} onAnimationComplete={()=>heading.current?.focus({preventScroll:true})}>
    <header className="ob-heading"><h1 ref={heading} tabIndex={-1}>{title?.split('\n').map((line,i)=><span key={line}>{i>0&&<br/>}{line}</span>)}</h1>
     {step==='complaints'&&<p>해당하는 항목을 모두 골라주세요. 건너뛰어도 괜찮아요.</p>}
     {step==='packaging'&&<p>{brand?'마음에 드는 형태부터 골라보세요.':'주력 품목만 골라주세요. 여러 개 선택할 수 있어요.'}</p>}
     {step==='conditions'&&<p>아는 만큼만 입력하세요. 나머지는 상담하며 정해요.</p>}
     {step==='goals'&&<p>관심 있는 거래를 모두 골라주세요. 선택 사항이에요.</p>}
    </header>
    {step==='experience'&&<div className="ob-experience"><Choice large selected={draft.experience==='yes'} onClick={()=>move('complaints',{...draft,experience:'yes'})}>네, 제작해본 적 있어요.</Choice><Choice large selected={draft.experience==='no'} onClick={()=>move('packaging',{...draft,experience:'no',complaints:[]})}>아니요, 처음 제작해봐요.</Choice></div>}
    {step==='complaints'&&<PickGrid options={complaints} value={draft.complaints} multiple onChange={id=>toggle('complaints',id)}/>}
    {step==='packaging'&&<>
     <div className="ob-materials" role="group" aria-label="패키징 종류">{materials.map(([id,label])=><button type="button" key={id} className={draft.material===id?'is-selected':''} aria-pressed={draft.material===id} onClick={()=>update({material:id,product:draft.material===id?draft.product:''})}>{label}</button>)}{brand&&<button type="button" className={draft.material==='unknown'?'is-selected':''} aria-pressed={draft.material==='unknown'} onClick={()=>update({material:'unknown',product:''})}>추천받을게요</button>}</div>
     {materialRows.length>0&&<div className="ob-products">{materialRows.map(([id,label,name])=>{const key=`${draft.material}-${id}`;return <ProductTile key={key} id={key} label={label} name={name} selected={brand?draft.product===key:draft.supplierProducts.includes(key)} onClick={()=>brand?update({product:key}):toggle('supplierProducts',key)}/>;})}</div>}
     {!draft.material&&<div className="ob-material-prompt"><Package size={33} weight="light"/><p>패키징 종류를 선택하면<br/>대표 형태를 볼 수 있어요.</p></div>}
     {draft.material==='unknown'&&<div className="ob-recommend"><label htmlFor="ob-product-use">무엇을 포장하시나요?</label><input id="ob-product-use" value={draft.productUse} maxLength={80} onChange={e=>update({productUse:e.target.value})} placeholder="예: 향수, 쿠키, 의류"/><p>원하는 제품을 알려주시면 형태부터 함께 찾아요.</p></div>}
     {!brand&&draft.supplierProducts.length>0&&<div className="ob-selected-tags" aria-label="선택한 제작 품목">{draft.supplierProducts.map(id=><button key={id} type="button" onClick={()=>toggle('supplierProducts',id)}>{productInfo(id)?.label}<X size={13}/></button>)}</div>}
     {materialRows.length>0&&<p className="ob-art-note">형태를 보여주는 예시 그림입니다.</p>}
    </>}
    {step==='conditions'&&<div className="ob-conditions"><div className="ob-condition-main">
     <fieldset><legend>얼마나 필요하세요?</legend><div className="ob-input-unit"><input aria-label="예상 수량" inputMode="numeric" value={draft.quantity} disabled={draft.quantityUnknown} maxLength={9} onChange={e=>update({quantity:e.target.value.replace(/[^\d]/g,'')})} placeholder="예: 1,000"/><span>개</span></div><label className="ob-check"><input type="checkbox" checked={draft.quantityUnknown} onChange={e=>update({quantityUnknown:e.target.checked,...(e.target.checked?{quantity:''}:{})})}/>아직 모르겠어요</label></fieldset>
     <fieldset><legend>크기는 어느 정도인가요?</legend><div className="ob-size-basis"><button type="button" aria-pressed={draft.sizeBasis==='package'} onClick={()=>update({sizeBasis:'package'})}>포장 크기</button><button type="button" aria-pressed={draft.sizeBasis==='product'} onClick={()=>update({sizeBasis:'product'})}>담을 제품 크기</button></div><div className="ob-dimensions">{[['width','가로'],['depth','세로'],['height','높이']].map(([key,label])=><label key={key}>{label}<input inputMode="decimal" value={draft[key]} disabled={draft.sizeUnknown} maxLength={8} onChange={e=>update({[key]:e.target.value.replace(/[^\d.]/g,'')})} placeholder="mm"/></label>)}</div><label className="ob-check"><input type="checkbox" checked={draft.sizeUnknown} onChange={e=>update({sizeUnknown:e.target.checked,...(e.target.checked?{width:'',depth:'',height:''}:{})})}/>크기를 아직 모르겠어요</label></fieldset>
     <fieldset><legend>언제 필요하세요? <span>선택</span></legend><PickGrid options={timeOptions} value={draft.timing} onChange={id=>update({timing:id})}/></fieldset>
     <details className="ob-budget"><summary>생각해 둔 가격이 있어요 <CaretDown size={17}/></summary><label className="ob-check"><input type="checkbox" checked={draft.budgetUnknown} onChange={e=>update({budgetUnknown:e.target.checked})}/>가격은 업체의 제안을 받을게요</label>{!draft.budgetUnknown&&<label>희망 개당 단가<div className="ob-input-unit"><input inputMode="numeric" value={draft.budget} maxLength={10} onChange={e=>update({budget:e.target.value.replace(/[^\d]/g,'')})} placeholder="희망 가격"/><span>원</span></div></label>}</details>
    </div><aside className="ob-chosen-product"><PackagingArt kind={draft.product||draft.material}/><strong>{selectedProduct?.name||'형태 추천받기'}</strong><span>선택한 패키징</span></aside></div>}
    {step==='capacity'&&<div className="ob-capacity"><fieldset><legend>주로 받는 주문 수량</legend><PickGrid options={capacityOptions} value={draft.quantityRange} onChange={id=>update({quantityRange:id})}/></fieldset><fieldset><legend>새로운 의뢰, 받을 수 있나요?</legend><PickGrid options={availabilityOptions} value={draft.availability} onChange={id=>update({availability:id})}/></fieldset></div>}
    {step==='goals'&&<PickGrid options={supplierGoals} value={draft.goals} multiple onChange={id=>toggle('goals',id)}/>}
    {step==='result'&&<div className="ob-result-layout"><div className="ob-request-preview"><div className="ob-preview-art"><PackagingArt kind={draft.product||draft.supplierProducts[0]||draft.material}/></div><div className="ob-preview-copy"><h2>{brand?selectedProduct?.name||`${materialLabel(draft.material)} 패키징`:draft.supplierProducts.map(id=>productInfo(id)?.label).filter(Boolean).slice(0,3).join(' · ')}</h2><dl>{brand?<><div><dt>수량</dt><dd>{draft.quantity?Number(draft.quantity).toLocaleString('ko-KR')+'개':'상담 후 결정'}</dd></div><div><dt>{draft.sizeBasis==='product'?'제품 크기':'포장 크기'}</dt><dd>{draft.sizeUnknown||!draft.width?'상담 후 결정':[draft.width,draft.depth,draft.height].filter(Boolean).join(' × ')+' mm'}</dd></div><div><dt>희망 일정</dt><dd>{draft.timing||'협의 가능'}</dd></div><div><dt>희망 단가</dt><dd>{draft.budgetUnknown||!draft.budget?'업체 제안 받기':Number(draft.budget).toLocaleString('ko-KR')+'원'}</dd></div></>:<><div><dt>주문 수량</dt><dd>{capacityOptions.find(([id])=>id===draft.quantityRange)?.[1]||'협의 가능'}</dd></div><div><dt>상담</dt><dd>{availabilityOptions.find(([id])=>id===draft.availability)?.[1]||'일정 협의'}</dd></div></>}</dl><button type="button" className="ob-edit" onClick={()=>move(brand?'conditions':'capacity')}>조건 수정하기</button></div></div>
     <div className="ob-result-next"><span className="ob-result-mark"><Check size={24} weight="bold"/></span><h2>{brand?'이 내용 그대로,\n견적을 받아보세요.':'할 수 있는 일부터,\n제안해 보세요.'}</h2><p>{brand?'가입 후 공고 내용을 확인하면\n제작업체가 견적을 제안할 수 있어요.':'가입 후 업체 확인을 마치면\n제작 의뢰에 입찰할 수 있어요.'}</p>
      {brand&&matchingPartners.length>0&&<div className="ob-related"><strong>{draft.material==='paper'?'박스 분야 등록 업체':'패키징 분야 등록 업체'}</strong>{matchingPartners.map(p=><div key={p.alias}><Package size={17}/><span>{p.alias}</span></div>)}<small>선택한 소재·형태의 제작 가능 여부는 확인이 필요해요.</small></div>}
      {!brand&&briefs.length>0&&<div className="ob-briefs"><strong>모집 중인 관련 의뢰</strong>{briefs.map(post=><button key={post.id} type="button" aria-pressed={draft.selectedPostId===post.id} onClick={()=>update({selectedPostId:post.id})}><span>{post.title}</span><span>{post.quantity?Number(post.quantity).toLocaleString('ko-KR')+'개':'수량 협의'}{draft.selectedPostId===post.id?<Check size={17}/>:<ArrowRight size={17}/>}</span></button>)}</div>}
      {!brand&&!briefs.length&&<p className="ob-no-briefs">지금 모집 중인 관련 의뢰가 없어요.<br/>선택한 제작 분야는 가입 후에도 유지돼요.</p>}
      <button type="button" className="ob-primary ob-result-cta" onClick={continueSignup}>{brand?'가입하고 공고 등록하기':'가입하고 입찰 준비하기'}<ArrowRight size={19}/></button><span className="ob-continue-note">입력한 내용이 그대로 이어져요.</span>{onLogin&&<button type="button" className="ob-existing" onClick={()=>{saveOnboardingDraft(draft);onLogin(draft);}}>이미 가입했다면 로그인</button>}
     </div></div>}
    {error&&<p className="ob-error" role="alert">{error}</p>}
    {!['experience','result'].includes(step)&&<footer className="ob-actions">{['complaints','goals'].includes(step)&&<button type="button" className="ob-skip" onClick={()=>move(steps[position+1])}>건너뛰기</button>}<button type="button" className="ob-primary" onClick={next}>{step==='conditions'?'내 요청 확인하기':step==='goals'?'관련 의뢰 보기':'다음'}<ArrowRight size={18}/></button></footer>}
   </motion.div></AnimatePresence>
  </>}
 </section>;
}
