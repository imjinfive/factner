import PackagingArt from './PackagingArt';
import {supplierSummaryGroups,selectedProductInfo,selectedProductOptions,capacityOptions,availabilityOptions} from './onboarding-data';

function SummaryRow({label,values}){
 return <div className="ob-summary-row"><dt>{label}</dt><dd><ul>{values.map((value,index)=><li key={index}>{value}</li>)}</ul></dd></div>;
}

export default function SurveySummary({draft,onEdit}){
 const brand=draft.role==='brand',product=selectedProductInfo(draft);
 const groups=brand?[{material:draft.material,kind:draft.variant||draft.product||draft.material,title:product?.name||(draft.productUse?`${draft.productUse} 포장`:'패키징 추천받기'),items:[]}]:supplierSummaryGroups(draft.supplierProducts);
 const rows=brand?[
  ['제작 수량',[draft.quantity?`${Number(draft.quantity).toLocaleString('ko-KR')}개`:'상담 후 결정']],
  [draft.sizeBasis==='product'?'제품 크기':'포장 크기',[draft.sizeUnknown||!draft.width?'상담 후 결정':[draft.width,draft.depth,draft.height].filter(Boolean).map(value=>Number(value).toLocaleString('ko-KR')).join(' × ')+' mm']],
  ['희망 일정',[draft.requiredDate||draft.timing||'협의 가능']],
  ['희망 단가',[draft.budgetUnknown||!draft.budget?'업체 제안 받기':`${Number(draft.budget).toLocaleString('ko-KR')}원`]],
  ...selectedProductOptions(draft).map(option=>[option.label,[option.value]]),
  ['브랜드 이미지',[...draft.brandImages,draft.brandImageOther].filter(Boolean)],
  ['원하는 제작업체',draft.supplierPriorities]
 ]:[
  ['주문 수량',capacityOptions.filter(([id])=>draft.quantityRange.includes(id)).map(([,label])=>label)],
  ['상담 가능 여부',availabilityOptions.filter(([id])=>draft.availability.includes(id)).map(([,label])=>label)],
  ['우리 업체의 강점',draft.strengths]
 ];
 return <section className="ob-summary" aria-label={brand?'제작 의뢰 요약':'우리 업체 요약'}>
  <div className="ob-summary-products">{groups.map(group=><div className="ob-summary-product" key={group.material}>
   <PackagingArt kind={group.kind}/><div><h2>{group.title}</h2>{group.items.length>1&&<ul className="ob-summary-items">{group.items.map(item=><li key={item.id}>{item.name}</li>)}</ul>}</div>
  </div>)}</div>
  <dl className="ob-summary-details">{rows.filter(([,values])=>values.length).map(([label,values])=><SummaryRow key={label} label={label} values={values}/>)}</dl>
  <button type="button" className="ob-edit" onClick={onEdit}>조건 수정하기</button>
 </section>;
}
