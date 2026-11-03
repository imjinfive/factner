export const ONBOARDING_KEY = 'factner:onboarding:v1';
export const materials = [
  ['paper','종이'], ['vinyl','비닐'], ['pouch','파우치'], ['plastic','플라스틱'],
  ['glass','유리'], ['metal','금속'], ['wood','목재'], ['cold','보냉']
];
export const products = {
  paper: [['carton','일반 종이박스','단상자'],['corrugated','골판지 박스','골판지 G형 박스'],['rigid','싸바리 박스','2단 싸바리 박스'],['bag','쇼핑백','종이 쇼핑백']],
  vinyl: [['flat','일반 포장봉투','접착식 봉투'],['display','진열용 봉투','헤더 봉투'],['mailer','택배봉투','택배봉투'],['shopping','비닐 쇼핑백','손잡이 봉투'],['film','포장 필름','수축필름']],
  pouch: [['flat','기본 파우치','스탠드 파우치'],['zip','지퍼 파우치','스탠드 지퍼 파우치'],['spout','스파우트 파우치','마개형 파우치'],['stick','소포장 파우치','스틱 파우치']],
  plastic: [['bottle','병·보틀','펌프형 병'],['jar','통·단지','크림통'],['tube','튜브','일반 튜브'],['food','식품 용기','샐러드 용기'],['case','케이스·트레이','제품 고정 트레이'],['makeup','색조 화장품 용기','쿠션 케이스']],
  glass: [['bottle','식품·음료병','음료병'],['jar','식품용 단지','잼병'],['cosmetic','화장품 용기','스포이트병'],['fragrance','향기 제품 용기','향수병']],
  metal: [['tin','틴케이스','사각 틴케이스'],['can','식품·음료 캔','음료캔'],['cosmetic','화장품·생활용품 용기','알루미늄 튜브'],['industrial','산업용 용기','금속 페일통']],
  wood: [['gift','선물용 목상자','슬라이드 목상자'],['product','제품 전용 목상자','와인 상자'],['shipping','운송용 목상자','크레이트'],['accessory','포장 부자재','목재 팔레트']],
  cold: [['box','보냉박스','보냉박스'],['envelope','보냉봉투','접착형 보냉봉투'],['bag','보냉가방','토트형 보냉백'],['liner','내부 보냉재','보냉 라이너'],['ice','냉매·부자재','아이스팩']]
};
export const complaints = ['가격이 부담스러워요','거리가 멀어요','납기를 지키지 않아요','품질이 아쉬워요','문제 대응이 아쉬워요','소통이 느려요','최소 수량이 많아요','특별한 불만은 없어요'];
export const supplierGoals = ['새로운 브랜드','꾸준한 반복 주문','설비에 맞는 물량','조건이 정리된 의뢰'];
const productMap = new Map(Object.entries(products).flatMap(([material,rows])=>rows.map(([id,label,name])=>[`${material}-${id}`,{id:`${material}-${id}`,material,label,name}])));
export const productInfo = id => productMap.get(id);
export const materialLabel = id => materials.find(([key])=>key===id)?.[1] || '추천 필요';
export function emptyOnboardingDraft(){
  return {version:1,role:'',experience:'',complaints:[],material:'',product:'',supplierProducts:[],quantity:'',quantityUnknown:false,width:'',depth:'',height:'',sizeUnknown:false,sizeBasis:'package',timing:'',budget:'',budgetUnknown:true,goals:[],availability:'',quantityRange:'',productUse:'',selectedPostId:''};
}
const string = (value,max=100) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const numberText = (value,max) => {const text=String(value??'').replaceAll(',','').trim();return /^\d+(?:\.\d+)?$/.test(text)&&Number(text)>0&&Number(text)<=max?text:'';};
export function normalizeOnboardingDraft(input){
  const d = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  const base = emptyOnboardingDraft();
  const list = (value,allowed) => Array.isArray(value) ? [...new Set(value.filter(v=>allowed.includes(v)))].slice(0,40) : [];
  const role = ['brand','supplier'].includes(d.role)?d.role:'';
  const material = materials.some(([key])=>key===d.material)||d.material==='unknown'?d.material:'';
  const product = productMap.get(d.product)?.material===material?d.product:'';
  const quantity = numberText(d.quantity,100000000);
  return {...base,role,material,product,experience:['yes','no'].includes(d.experience)?d.experience:'',
    complaints:d.experience==='no'?[]:list(d.complaints,complaints),supplierProducts:list(d.supplierProducts,[...productMap.keys()]),
    quantity:d.quantityUnknown?'':/^\d+$/.test(quantity)?quantity:'',quantityUnknown:d.quantityUnknown===true,
    width:d.sizeUnknown?'':numberText(d.width,100000),depth:d.sizeUnknown?'':numberText(d.depth,100000),height:d.sizeUnknown?'':numberText(d.height,100000),sizeUnknown:d.sizeUnknown===true,
    sizeBasis:d.sizeBasis==='product'?'product':'package',timing:string(d.timing,80),budget:d.budgetUnknown!==false?'':numberText(d.budget,1000000000),budgetUnknown:d.budgetUnknown!==false||!numberText(d.budget,1000000000),
    goals:list(d.goals,supplierGoals),availability:['now','discuss','later'].includes(d.availability)?d.availability:'',
    quantityRange:['small','medium','large','discuss'].includes(d.quantityRange)?d.quantityRange:'',productUse:string(d.productUse,80),selectedPostId:string(d.selectedPostId,80)};
}
export function readOnboardingDraft(storage){try{return normalizeOnboardingDraft(JSON.parse((storage??globalThis.localStorage).getItem(ONBOARDING_KEY)||'null'));}catch{return emptyOnboardingDraft();}}
export function saveOnboardingDraft(draft,storage){const clean=normalizeOnboardingDraft(draft);try{(storage??globalThis.localStorage).setItem(ONBOARDING_KEY,JSON.stringify(clean));}catch{}return clean;}
export function clearOnboardingDraft(storage){try{(storage??globalThis.localStorage).removeItem(ONBOARDING_KEY);}catch{}}
export function surveySteps(draft){return draft.role==='supplier'?['role','packaging','capacity','goals','result']:['role','experience',...(draft.experience==='yes'?['complaints']:[]),'packaging','conditions','result'];}
export function onboardingResumeStep(input){
  const d=normalizeOnboardingDraft(input);
  if(!d.role)return 'role';
  if(d.role==='supplier')return !d.supplierProducts.length?'packaging':!d.quantityRange||!d.availability?'capacity':'result';
  if(!d.experience)return 'experience';
  if(!d.product&&d.material!=='unknown')return 'packaging';
  if((!d.quantity&&!d.quantityUnknown)||(!d.sizeUnknown&&(!d.width||!d.depth)))return 'conditions';
  return 'result';
}
export function onboardingPostDraft(input){
  const d=normalizeOnboardingDraft(input),info=productInfo(d.product);
  const item=info?.name||`${materialLabel(d.material)} 패키징`;
  const hasPackageSize=d.sizeBasis==='package'&&d.width&&d.depth;
  return {category:'packaging',title:`${item} 제작 요청`,quantity:d.quantity,unitPrice:d.budget,width:hasPackageSize?d.width:'',depth:hasPackageSize?d.depth:'',height:hasPackageSize?d.height:'',
    quantityUnknown:d.quantityUnknown,budgetUnknown:d.budgetUnknown,
    description:[`희망 품목: ${info?.label||materialLabel(d.material)}${info?' / '+info.name:''}`,d.productUse&&`포장할 제품: ${d.productUse}`,
      d.quantityUnknown&&'수량: 상담 후 결정',d.sizeUnknown?'크기: 상담 후 결정':(d.width||d.depth)&&`${d.sizeBasis==='product'?'내용물':'포장'} 크기: ${[d.width,d.depth,d.height].filter(Boolean).join(' × ')} mm`,
      `희망 일정: ${d.timing||'협의 가능'}`,d.budgetUnknown&&'희망 단가: 업체 제안 요청'].filter(Boolean).join('\n')};
}
export function matchingSurveyPosts(posts,draft,today=new Date(Date.now()+9*3600000).toISOString().slice(0,10)){
  const terms=(draft.supplierProducts||[]).map(productInfo).filter(Boolean).flatMap(p=>[p.label,p.name]);
  if(!terms.length)return [];
  return (posts||[]).filter(p=>p.category==='packaging'&&p.reviewStatus==='approved'&&p.status==='open'&&p.deadline>=today&&terms.some(term=>`${p.title||''} ${p.description||''}`.includes(term))).slice(0,3);
}
