import {materials,products,productInfo,materialLabel,productVariants,variantInfo,productOptions,selectedProductInfo,selectedProductOptions} from './packaging-catalog.js';
export {materials,products,productInfo,materialLabel,productVariants,variantInfo,productOptions,selectedProductInfo,selectedProductOptions} from './packaging-catalog.js';
export const ONBOARDING_KEY = 'factner:onboarding:v1';
export const complaints = ['가격이 부담스러워요','거리가 멀어요','납기를 지키지 않아요','품질이 아쉬워요','문제 대응이 아쉬워요','소통이 느려요','최소 수량이 많아요','특별한 불만은 없어요'];
export const supplierGoals = ['새로운 브랜드','꾸준한 반복 주문','설비에 맞는 물량','조건이 정리된 의뢰'];
export const capacityOptions = [['small','소량 주문도 받아요'],['medium','중간 규모가 적합해요'],['large','대량·반복 주문을 원해요'],['discuss','품목에 따라 달라요']];
export const availabilityOptions = [['now','지금 상담 가능해요'],['discuss','일정 협의가 필요해요'],['later','앞으로 받을 의뢰를 찾아요']];
export const supplierStrengths = ['납기일을 잘 지켜요','불량률이 낮아요','급한 주문에도 안정적으로 대응해요','소량 제작에 강해요','가격 경쟁력이 있어요','인쇄·후가공 완성도가 높아요','소통과 피드백이 빨라요','샘플·개발 상담을 꼼꼼히 해요'];
export const brandImages = ['고급스러움','편안함','친근함','혁신적인','힙한','세련된','자연스러움','미니멀한','귀여운','감각적인'];
export const supplierPriorities = ['납기일을 잘 지켰으면 좋겠어요','급한 주문도 안정적으로 제작했으면 좋겠어요','불량률이 낮았으면 좋겠어요','소량 주문도 가능했으면 좋겠어요','가격이 합리적이면 좋겠어요','인쇄·후가공이 정교했으면 좋겠어요','소통과 피드백이 빨랐으면 좋겠어요','샘플·개발 상담이 꼼꼼했으면 좋겠어요'];
const productIds = Object.entries(products).flatMap(([material,rows])=>rows.map(([id])=>`${material}-${id}`));
const selectionIds = [...productIds,...productIds.flatMap(id=>productVariants(id).map(v=>v.id))];
export const supplierProductLabel = id => variantInfo(id)?.name || productInfo(id)?.label || '';
export function supplierSummaryGroups(selected){
  const ids=[...new Set(selected)];
  return materials.flatMap(([material,label])=>{
    const items=ids.filter(id=>productInfo(variantInfo(id)?.product||id)?.material===material).map(id=>({id,name:supplierProductLabel(id)}));
    return items.length?[{material,title:items.length>1?`${label} 패키징`:items[0].name,kind:items.length>1?material:items[0].id,items}]:[];
  });
}
export const selectionLabels = (values,options) => values.map(value=>options.find(([id])=>id===value)?.[1]).filter(Boolean).join(' · ');
export function toggleSupplierProduct(selected,id){
  const variant=variantInfo(id),family=variant?.product||id;
  if(!variant)return selected.includes(id)?selected.filter(value=>value!==id):[...selected.filter(value=>variantInfo(value)?.product!==family),id];
  if(selected.includes(family))return [...selected.filter(value=>value!==family),...productVariants(family).filter(value=>value.id!==id).map(value=>value.id)];
  return selected.includes(id)?selected.filter(value=>value!==id):[...selected,id];
}
export function emptyOnboardingDraft(){
  return {version:1,role:'',experience:'',complaints:[],material:'',product:'',variant:'',catalogLevel:'materials',materialOption:'',appearance:'',woodSpecies:'',supplierProducts:[],quantity:'',quantityUnknown:false,width:'',depth:'',height:'',sizeUnknown:false,sizeBasis:'package',timing:'',requiredDate:'',budget:'',budgetUnknown:false,goals:[],availability:[],quantityRange:[],strengths:[],brandImages:[],brandImageOther:'',supplierPriorities:[],productUse:'',selectedPostId:''};
}
const string = (value,max=100) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const numberText = (value,max) => {const text=String(value??'').replaceAll(',','').trim();return /^\d+(?:\.\d+)?$/.test(text)&&Number(text)>0&&Number(text)<=max?text:'';};
export function normalizeOnboardingDraft(input){
  const d = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  const base = emptyOnboardingDraft();
  const list = (value,allowed,max=40) => Array.isArray(value) ? [...new Set(value.filter(v=>allowed.includes(v)))].slice(0,max) : [];
  const choices = (value,options) => list(typeof value==='string'?[value]:value,options.map(([id])=>id));
  const role = ['brand','supplier'].includes(d.role)?d.role:'';
  const material = materials.some(([key])=>key===d.material)||d.material==='unknown'?d.material:'';
  const product = productInfo(d.product)?.material===material?d.product:'';
  const variant = variantInfo(d.variant)?.product===product?d.variant:'';
  const option = key => productOptions(product).find(group=>group.key===key)?.choices.some(choice=>choice.id===d[key])?d[key]:'';
  const quantity = numberText(d.quantity,100000000);
  const requiredDate=typeof d.requiredDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.requiredDate)&&Number.isFinite(Date.parse(d.requiredDate))&&new Date(d.requiredDate).toISOString().slice(0,10)===d.requiredDate?d.requiredDate:'';
  const supplierProducts=list(d.supplierProducts,selectionIds,203);
  return {...base,role,material,product,variant,catalogLevel:d.catalogLevel==='variants'&&product?'variants':d.catalogLevel==='families'&&material&&material!=='unknown'?'families':'materials',materialOption:option('materialOption'),appearance:option('appearance'),woodSpecies:material==='wood'&&product?string(d.woodSpecies,80):'',experience:['yes','no'].includes(d.experience)?d.experience:'',
    complaints:d.experience==='no'?[]:list(d.complaints,complaints),supplierProducts:supplierProducts.filter(id=>!variantInfo(id)||!supplierProducts.includes(variantInfo(id).product)),
    quantity:d.quantityUnknown?'':/^\d+$/.test(quantity)?quantity:'',quantityUnknown:d.quantityUnknown===true,
    width:d.sizeUnknown?'':numberText(d.width,100000),depth:d.sizeUnknown?'':numberText(d.depth,100000),height:d.sizeUnknown?'':numberText(d.height,100000),sizeUnknown:d.sizeUnknown===true,
    sizeBasis:d.sizeBasis==='product'?'product':'package',timing:requiredDate?'':string(d.timing,80),requiredDate,budget:d.budgetUnknown===true?'':numberText(d.budget,1000000000),budgetUnknown:d.budgetUnknown===true,
    goals:list(d.goals,supplierGoals),availability:choices(d.availability,availabilityOptions),quantityRange:choices(d.quantityRange,capacityOptions),
    strengths:role==='supplier'?list(d.strengths,supplierStrengths,2):[],brandImages:role==='brand'?list(d.brandImages,brandImages):[],brandImageOther:role==='brand'?string(d.brandImageOther,120):'',supplierPriorities:role==='brand'?list(d.supplierPriorities,supplierPriorities):[],productUse:string(d.productUse,80),selectedPostId:string(d.selectedPostId,80)};
}
export function readOnboardingDraft(storage){try{return normalizeOnboardingDraft(JSON.parse((storage??globalThis.localStorage).getItem(ONBOARDING_KEY)||'null'));}catch{return emptyOnboardingDraft();}}
export function saveOnboardingDraft(draft,storage){const clean=normalizeOnboardingDraft(draft);try{(storage??globalThis.localStorage).setItem(ONBOARDING_KEY,JSON.stringify(clean));}catch{}return clean;}
export function clearOnboardingDraft(storage){try{(storage??globalThis.localStorage).removeItem(ONBOARDING_KEY);}catch{}}
export function surveySteps(draft){return draft.role==='supplier'?['role','packaging','capacity','goals','strengths','result']:['role','experience',...(draft.experience==='yes'?['complaints']:[]),'packaging','conditions','brandImage','priorities','result'];}
export function onboardingResumeStep(input){
  const d=normalizeOnboardingDraft(input);
  if(!d.role)return 'role';
  if(d.role==='supplier')return !d.supplierProducts.length?'packaging':!d.quantityRange.length||!d.availability.length?'capacity':'result';
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
    quantityUnknown:d.quantityUnknown,budgetUnknown:d.budgetUnknown||!d.budget,
    description:[`희망 품목: ${info?.label||materialLabel(d.material)}${info?' / '+info.name:''}`,...selectedProductOptions(d).map(option=>`${option.label}: ${option.value}`),d.productUse&&`포장할 제품: ${d.productUse}`,
      d.quantityUnknown&&'수량: 상담 후 결정',d.sizeUnknown?'크기: 상담 후 결정':(d.width||d.depth)&&`${d.sizeBasis==='product'?'내용물':'포장'} 크기: ${[d.width,d.depth,d.height].filter(Boolean).join(' × ')} mm`,
      `희망 일정: ${d.requiredDate||d.timing||'협의 가능'}`,(d.budgetUnknown||!d.budget)&&'희망 단가: 업체 제안 요청',d.material==='cold'&&'보냉 성능: 유지 온도·시간은 포장 구성과 배송 조건에 따라 별도 확인',
      (d.brandImages.length||d.brandImageOther)&&`브랜드 이미지: ${[...d.brandImages,d.brandImageOther].filter(Boolean).join(' · ')}`,d.supplierPriorities.length&&`원하는 제작업체: ${d.supplierPriorities.join(' · ')}`].filter(Boolean).join('\n')};
}
export function matchingSurveyPosts(posts,draft,today=new Date(Date.now()+9*3600000).toISOString().slice(0,10)){
  const terms=(draft.supplierProducts||[]).flatMap(id=>{const variant=variantInfo(id),p=productInfo(id);return variant?[variant.name]:p?[p.label,p.name,...productVariants(p.id).map(v=>v.name)]:[];});
  if(!terms.length)return [];
  return (posts||[]).filter(p=>p.category==='packaging'&&p.reviewStatus==='approved'&&p.status==='open'&&p.deadline>=today&&terms.some(term=>`${p.title||''} ${p.description||''}`.includes(term))).slice(0,3);
}
