import {materials,products,productInfo,materialLabel,productVariants,variantInfo,productOptions,selectedProductInfo,selectedProductOptions} from './packaging-catalog.js';
export {materials,products,productInfo,materialLabel,productVariants,variantInfo,productOptions,selectedProductInfo,selectedProductOptions} from './packaging-catalog.js';
export const ONBOARDING_KEY = 'factner:onboarding:v1';
export const complaints = ['가격이 부담스러워요','거리가 멀어요','납기를 지키지 않아요','품질이 아쉬워요','문제 대응이 아쉬워요','소통이 느려요','최소 수량이 많아요','특별한 불만은 없어요'];
export const supplierGoals = ['새로운 브랜드','꾸준한 반복 주문','설비에 맞는 물량','조건이 정리된 의뢰'];
const productIds = Object.entries(products).flatMap(([material,rows])=>rows.map(([id])=>`${material}-${id}`));
export function emptyOnboardingDraft(){
  return {version:1,role:'',experience:'',complaints:[],material:'',product:'',variant:'',materialOption:'',appearance:'',woodSpecies:'',supplierProducts:[],quantity:'',quantityUnknown:false,width:'',depth:'',height:'',sizeUnknown:false,sizeBasis:'package',timing:'',budget:'',budgetUnknown:true,goals:[],availability:'',quantityRange:'',productUse:'',selectedPostId:''};
}
const string = (value,max=100) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const numberText = (value,max) => {const text=String(value??'').replaceAll(',','').trim();return /^\d+(?:\.\d+)?$/.test(text)&&Number(text)>0&&Number(text)<=max?text:'';};
export function normalizeOnboardingDraft(input){
  const d = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  const base = emptyOnboardingDraft();
  const list = (value,allowed) => Array.isArray(value) ? [...new Set(value.filter(v=>allowed.includes(v)))].slice(0,40) : [];
  const role = ['brand','supplier'].includes(d.role)?d.role:'';
  const material = materials.some(([key])=>key===d.material)||d.material==='unknown'?d.material:'';
  const product = productInfo(d.product)?.material===material?d.product:'';
  const variant = variantInfo(d.variant)?.product===product?d.variant:'';
  const option = key => productOptions(product).find(group=>group.key===key)?.choices.some(choice=>choice.id===d[key])?d[key]:'';
  const quantity = numberText(d.quantity,100000000);
  return {...base,role,material,product,variant,materialOption:option('materialOption'),appearance:option('appearance'),woodSpecies:material==='wood'&&product?string(d.woodSpecies,80):'',experience:['yes','no'].includes(d.experience)?d.experience:'',
    complaints:d.experience==='no'?[]:list(d.complaints,complaints),supplierProducts:list(d.supplierProducts,productIds),
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
  if(!d.variant&&d.material!=='unknown')return 'packaging';
  if((!d.quantity&&!d.quantityUnknown)||(!d.sizeUnknown&&(!d.width||!d.depth)))return 'conditions';
  return 'result';
}
export function onboardingPostDraft(input){
  const d=normalizeOnboardingDraft(input),info=selectedProductInfo(d);
  const item=info?.name||`${materialLabel(d.material)} 패키징`;
  const hasPackageSize=d.sizeBasis==='package'&&d.width&&d.depth;
  return {category:'packaging',title:`${item} 제작 요청`,quantity:d.quantity,unitPrice:d.budget,width:hasPackageSize?d.width:'',depth:hasPackageSize?d.depth:'',height:hasPackageSize?d.height:'',
    quantityUnknown:d.quantityUnknown,budgetUnknown:d.budgetUnknown,
    description:[`희망 품목: ${info?.label||materialLabel(d.material)}${info?' / '+info.name:''}`,...selectedProductOptions(d).map(option=>`${option.label}: ${option.value}`),d.productUse&&`포장할 제품: ${d.productUse}`,
      d.quantityUnknown&&'수량: 상담 후 결정',d.sizeUnknown?'크기: 상담 후 결정':(d.width||d.depth)&&`${d.sizeBasis==='product'?'내용물':'포장'} 크기: ${[d.width,d.depth,d.height].filter(Boolean).join(' × ')} mm`,
      `희망 일정: ${d.timing||'협의 가능'}`,d.budgetUnknown&&'희망 단가: 업체 제안 요청',d.material==='cold'&&'보냉 성능: 유지 온도·시간은 포장 구성과 배송 조건에 따라 별도 확인'].filter(Boolean).join('\n')};
}
export function matchingSurveyPosts(posts,draft,today=new Date(Date.now()+9*3600000).toISOString().slice(0,10)){
  const terms=(draft.supplierProducts||[]).map(productInfo).filter(Boolean).flatMap(p=>[p.label,p.name,...productVariants(p.id).map(variant=>variant.name)]);
  if(!terms.length)return [];
  return (posts||[]).filter(p=>p.category==='packaging'&&p.reviewStatus==='approved'&&p.status==='open'&&p.deadline>=today&&terms.some(term=>`${p.title||''} ${p.description||''}`.includes(term))).slice(0,3);
}
