import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOnboardingDraft,readOnboardingDraft,saveOnboardingDraft,surveySteps,onboardingResumeStep,onboardingPostDraft,matchingSurveyPosts,toggleSupplierProduct,supplierSummaryGroups,supplierStrengths,brandImages,supplierPriorities,products,productVariants,variantInfo,productOptions,selectedProductInfo,selectedProductOptions} from './onboarding-data.js';
test('unknown answers stay unknown and category changes invalidate stale products',()=>{
 const d=normalizeOnboardingDraft({role:'brand',material:'glass',product:'paper-carton',quantity:'1000',quantityUnknown:true,width:'100',sizeUnknown:true,budget:'30',budgetUnknown:true});
 assert.equal(d.product,'');assert.equal(d.quantity,'');assert.equal(d.width,'');assert.equal(d.budget,'');
});
test('beginner skips complaints and supplier has no brand questions',()=>{
 assert.equal(surveySteps({role:'brand',experience:'no'}).includes('complaints'),false);
 assert.equal(surveySteps({role:'brand',experience:'yes'}).includes('complaints'),true);
 assert.deepEqual(surveySteps({role:'supplier'}),['role','packaging','capacity','goals','strengths','result']);
});
test('storage failure does not interrupt onboarding',()=>{
 const blocked={getItem(){throw Error();},setItem(){throw Error();}};
 assert.equal(readOnboardingDraft(blocked).role,'');assert.equal(saveOnboardingDraft({role:'brand'},blocked).role,'brand');
});
test('post draft carries survey values without inventing missing quantities or prices',()=>{
 const p=onboardingPostDraft({role:'brand',material:'paper',product:'paper-carton',quantity:'1000',sizeUnknown:true,budgetUnknown:true,timing:'협의 가능'});
 assert.equal(p.quantity,'1000');assert.equal(p.unitPrice,'');assert.equal(p.title,'단상자 제작 요청');assert.match(p.description,/상담 후 결정/);assert.match(p.description,/업체 제안 요청/);
});
test('invalid input is bounded and strips unknown fields',()=>{
 const d=normalizeOnboardingDraft({role:'design',quantity:'-2',width:'NaN',supplierProducts:['paper-carton','bogus','paper-carton'],secret:'discard'});
 assert.equal(d.role,'');assert.equal(d.quantity,'');assert.deepEqual(d.supplierProducts,['paper-carton']);assert.equal(d.secret,undefined);
});
test('suggestions exclude private, expired, closed and unrelated briefs',()=>{
 const p={id:'1',category:'packaging',reviewStatus:'approved',status:'open',deadline:'2026-11-10',title:'단상자 제작',description:''};
 const matches=matchingSurveyPosts([p,{...p,id:'2',reviewStatus:'pending'},{...p,id:'3',deadline:'2026-10-30'},{...p,id:'4',title:'유리병'},{...p,id:'5',status:'awarded'}],{supplierProducts:['paper-carton']},'2026-11-03');
 assert.deepEqual(matches.map(p=>p.id),['1']);
});
test('resume returns to missing answers instead of claiming incomplete drafts are ready',()=>{
 assert.equal(onboardingResumeStep({role:'brand'}),'experience');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'paper',product:'paper-carton'}),'packaging');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'paper',product:'paper-carton',quantityUnknown:true,sizeUnknown:true}),'packaging');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'paper',product:'paper-carton',variant:'paper-carton-crashlock'}),'conditions');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'paper',product:'paper-carton',variant:'paper-carton-crashlock',quantityUnknown:true,sizeUnknown:true}),'result');
 assert.equal(onboardingResumeStep({role:'supplier',supplierProducts:['paper-carton']}),'capacity');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'unknown',quantityUnknown:true,sizeUnknown:true}),'result');
});
test('product dimensions never become packaging dimensions and blank price remains unknown',()=>{
 const base={role:'brand',material:'paper',product:'paper-carton',width:'40',depth:'50',height:'60',budgetUnknown:false,budget:''};
 const product=onboardingPostDraft({...base,sizeBasis:'product'});
 assert.equal(product.width,'');assert.equal(product.height,'');assert.match(product.description,/내용물 크기: 40 × 50 × 60 mm/);
 const partial=onboardingPostDraft({...base,depth:''});
 assert.equal(partial.width,'');assert.equal(partial.depth,'');assert.equal(partial.budgetUnknown,true);
 const packaging=onboardingPostDraft(base);assert.equal(packaging.width,'40');assert.equal(packaging.depth,'50');
});

test('catalog covers all 37 artwork families with unique stable product variants',()=>{
 const families=Object.entries(products).flatMap(([material,rows])=>rows.map(([id])=>`${material}-${id}`));
 assert.equal(families.length,37);
 const variants=families.flatMap(id=>{
  const rows=productVariants(id);assert.ok(rows.length>0,id);
  for(const item of rows){assert.equal(item.product,id);assert.equal(variantInfo(item.id),item);}
  return rows;
 });
 assert.equal(variants.length,166);assert.equal(new Set(variants.map(v=>v.id)).size,166);
 assert.equal(productVariants('paper-carton').filter(v=>v.name==='일반 단상자').length,1);
 assert.deepEqual(productVariants('not-a-product'),[]);
});

test('legacy family selections retain their representative while variants follow their parent',()=>{
 const old=normalizeOnboardingDraft({version:1,role:'brand',material:'paper',product:'paper-carton'});
 assert.equal(old.product,'paper-carton');assert.equal(old.variant,'');assert.equal(selectedProductInfo(old).name,'단상자');
 const exact=normalizeOnboardingDraft({...old,variant:'paper-carton-crashlock'});
 assert.equal(selectedProductInfo(exact).name,'바닥 접착형');
 assert.equal(onboardingPostDraft(exact).title,'바닥 접착형 제작 요청');
 const changed=normalizeOnboardingDraft({...exact,product:'paper-rigid'});
 assert.equal(changed.variant,'');assert.equal(selectedProductInfo(changed).name,'2단 싸바리 박스');
 const changedMaterial=normalizeOnboardingDraft({...exact,material:'glass'});
 assert.equal(changedMaterial.product,'');assert.equal(changedMaterial.variant,'');
});

test('optional material and appearance choices are bounded to their packaging family',()=>{
 const plasticBag=normalizeOnboardingDraft({role:'brand',material:'vinyl',product:'vinyl-flat',variant:'vinyl-flat-zip',materialOption:'pe',appearance:'brown',woodSpecies:'참나무'});
 assert.equal(plasticBag.materialOption,'pe');assert.equal(plasticBag.appearance,'');assert.equal(plasticBag.woodSpecies,'');
 assert.match(onboardingPostDraft(plasticBag).description,/희망 품목: 일반 포장봉투 \/ 지퍼백\n재질: PE/);
 const glass=normalizeOnboardingDraft({role:'brand',material:'glass',product:'glass-cosmetic',variant:'glass-cosmetic-dropper',appearance:'brown',materialOption:'opp'});
 assert.deepEqual(selectedProductOptions(glass),[{key:'appearance',label:'외관',value:'갈색'}]);
 assert.equal(glass.materialOption,'');assert.match(onboardingPostDraft(glass).description,/외관: 갈색/);
 const wood=normalizeOnboardingDraft({role:'brand',material:'wood',product:'wood-gift',variant:'wood-gift-slide',materialOption:'plywood',woodSpecies:'목'.repeat(120)});
 assert.equal(wood.woodSpecies.length,80);assert.match(onboardingPostDraft(wood).description,/재질: 합판\n수종:/);
 assert.equal(normalizeOnboardingDraft({...wood,materialOption:'unknown-material'}).materialOption,'');
 assert.deepEqual(productOptions('paper-carton'),[]);
});

test('supplier suggestions include specific variants and survey payload stays below server bound',()=>{
 const job={id:'zip',category:'packaging',reviewStatus:'approved',status:'open',deadline:'2026-11-10',title:'지퍼백 제작',description:''};
 assert.equal(matchingSurveyPosts([job],{supplierProducts:['vinyl-flat']},'2026-11-03').length,1);
 const allFamilies=Object.entries(products).flatMap(([material,rows])=>rows.map(([id])=>`${material}-${id}`));
 const wide=normalizeOnboardingDraft({role:'supplier',material:'wood',product:'wood-gift',variant:'wood-gift-slide',materialOption:'solid',woodSpecies:'목'.repeat(80),supplierProducts:allFamilies,productUse:'상'.repeat(80),timing:'일'.repeat(80),selectedPostId:'x'.repeat(80)});
 assert.ok(new TextEncoder().encode(JSON.stringify(wide)).byteLength<8192);
 assert.match(onboardingPostDraft({role:'brand',material:'cold',product:'cold-box',variant:'cold-box-epp'}).description,/유지 온도·시간은 포장 구성과 배송 조건에 따라 별도 확인/);
});


test('multiple supplier answers retain legacy strings and cap strengths at two',()=>{
 const legacy=normalizeOnboardingDraft({role:'supplier',quantityRange:'small',availability:'now'});
 assert.deepEqual(legacy.quantityRange,['small']);assert.deepEqual(legacy.availability,['now']);
 const draft=normalizeOnboardingDraft({...legacy,quantityRange:['small','medium','bad','small'],availability:['now','discuss'],strengths:supplierStrengths});
 assert.deepEqual(draft.quantityRange,['small','medium']);assert.deepEqual(draft.availability,['now','discuss']);assert.deepEqual(draft.strengths,supplierStrengths.slice(0,2));
 assert.deepEqual(normalizeOnboardingDraft({...draft,role:'brand'}).strengths,[]);
});

test('supplier can choose exact variants across families or select a whole family',()=>{
 const one='paper-carton-tuck',two='paper-carton-crashlock';
 let choices=toggleSupplierProduct([],one);choices=toggleSupplierProduct(choices,two);
 assert.deepEqual(choices,[one,two]);
 choices=toggleSupplierProduct(choices,'paper-carton');assert.deepEqual(choices,['paper-carton']);
 choices=toggleSupplierProduct(choices,one);assert.equal(choices.length,18);assert.equal(choices.includes(one),false);
 assert.ok(choices.includes(two));assert.equal(choices.includes('paper-carton'),false);
 assert.deepEqual(normalizeOnboardingDraft({role:'supplier',supplierProducts:['paper-carton',one,'glass-cosmetic-dropper']}).supplierProducts,['paper-carton','glass-cosmetic-dropper']);
 const p={category:'packaging',reviewStatus:'approved',status:'open',deadline:'2026-12-01',title:'바닥 접착형 제작'};
 assert.equal(matchingSurveyPosts([p],{supplierProducts:[two]},'2026-11-05').length,1);
 assert.equal(matchingSurveyPosts([p],{supplierProducts:[one]},'2026-11-05').length,0);
});

test('brand preferences and valid calendar dates become editable public post text',()=>{
 const draft=normalizeOnboardingDraft({role:'brand',requiredDate:'2026-12-15',timing:'한 달 이내',brandImages:['고급스러움','세련된','bad'],brandImageOther:'  차분한 느낌  ',supplierPriorities:supplierPriorities.slice(0,2)});
 assert.equal(draft.timing,'');assert.equal(draft.requiredDate,'2026-12-15');assert.equal(draft.brandImageOther,'차분한 느낌');
 assert.deepEqual(draft.brandImages,['고급스러움','세련된']);
 const post=onboardingPostDraft(draft);assert.match(post.description,/희망 일정: 2026-12-15/);assert.match(post.description,/브랜드 이미지: 고급스러움 · 세련된 · 차분한 느낌/);assert.match(post.description,/원하는 제작업체: 납기일/);
 for(const requiredDate of ['2026-02-30','2026-13-01','tomorrow'])assert.equal(normalizeOnboardingDraft({requiredDate}).requiredDate,'');
 assert.equal(normalizeOnboardingDraft({role:'brand',brandImageOther:'가'.repeat(200)}).brandImageOther.length,120);
 assert.equal(normalizeOnboardingDraft({}).budgetUnknown,false);
 const allVariants=Object.entries(products).flatMap(([material,rows])=>rows.flatMap(([id])=>productVariants(material+'-'+id).map(v=>v.id)));
 const wide=normalizeOnboardingDraft({role:'supplier',supplierProducts:allVariants,strengths:supplierStrengths,quantityRange:['small','medium','large','discuss'],availability:['now','discuss','later']});
 assert.equal(wide.supplierProducts.length,166);assert.ok(new TextEncoder().encode(JSON.stringify(wide)).byteLength<8192);
 const brand=normalizeOnboardingDraft({role:'brand',brandImages,brandImageOther:'가'.repeat(120),supplierPriorities});assert.ok(new TextEncoder().encode(JSON.stringify(brand)).byteLength<8192);
});


test('supplier summary uses a material representative for multiple selections and retains every item',()=>{
 const pouch=['pouch-zip','pouch-spout','pouch-stick'];
 const groups=supplierSummaryGroups(pouch);
 assert.equal(groups.length,1);assert.equal(groups[0].kind,'pouch');assert.equal(groups[0].title,'파우치 패키징');assert.deepEqual(groups[0].items.map(item=>item.id),pouch);
 const mixed=supplierSummaryGroups([...pouch,'glass-cosmetic-dropper','pouch-zip','invalid']);
 assert.equal(mixed.length,2);assert.equal(mixed[1].kind,'glass-cosmetic-dropper');assert.equal(mixed[1].title,'스포이트병');
 const all=Object.entries(products).flatMap(([material,rows])=>rows.flatMap(([id])=>productVariants(material+'-'+id).map(v=>v.id)));
 const full=supplierSummaryGroups(all);assert.equal(full.length,8);assert.equal(full.reduce((sum,group)=>sum+group.items.length,0),166);
});
