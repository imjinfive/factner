import {useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle,MagnifyingGlass,Question,X} from '@phosphor-icons/react';
import PackagingArt from './PackagingArt';
import {materials,products,productInfo,productVariants,materialLabel} from './onboarding-data';

const families=Object.entries(products).flatMap(([material,rows])=>rows.map(([id])=>productInfo(`${material}-${id}`)));

function ProductCard({family,variant,name,detail,selected,onClick}){
 return <button type="button" className={'ob-product'+(selected?' is-selected':'')} aria-pressed={selected} onClick={onClick}>
  <PackagingArt kind={variant||family.id}/>
  <span className="ob-product-name">{name}<span className="ob-product-check" aria-hidden="true">{selected?<CheckCircle size={21} weight="fill"/>:<ArrowRight size={17}/>}</span></span>
  <span className="ob-product-detail">{detail}</span>
 </button>;
}

export default function PackagingPicker({draft,onUpdate,onToggle}){
 const brand=draft.role==='brand';
 const [material,setMaterial]=useState(draft.material&&draft.material!=='unknown'?draft.material:'all');
 const [familyId,setFamilyId]=useState(brand?draft.product:'');
 const [query,setQuery]=useState('');
 const family=productInfo(familyId);
 const visibleFamilies=families.filter(f=>material==='all'||f.material===material);
 const search=query.trim().toLocaleLowerCase('ko-KR');
 const variants=search?visibleFamilies.flatMap(f=>productVariants(f.id)).filter(v=>`${v.name} ${productInfo(v.product)?.label}`.toLocaleLowerCase('ko-KR').includes(search)):family?productVariants(family.id):[];
 function browse(next){setMaterial(next);setFamilyId('');setQuery('');}
 function chooseFamily(id){
  if(!brand){onToggle('supplierProducts',id);return;}
  const next=productInfo(id);setFamilyId(id);setMaterial(next.material);setQuery('');
  if(draft.product!==id)onUpdate({material:next.material,product:id,variant:'',materialOption:'',appearance:'',woodSpecies:''});
 }
 function chooseVariant(variant){
  const parent=productInfo(variant.product);
  onUpdate({material:parent.material,product:parent.id,variant:variant.id,...(draft.product!==parent.id?{materialOption:'',appearance:'',woodSpecies:''}:{})});
 }
 return <div className="ob-catalog">
  <div className="ob-catalog-tools">
   <div className="ob-materials" role="group" aria-label="패키징 분류">
    {[['all','전체'],...materials].map(([id,label])=><button key={id} type="button" className={material===id?'is-selected':''} aria-pressed={material===id} onClick={()=>browse(id)}>{label}</button>)}
   </div>
   {brand&&<label className="ob-catalog-search"><MagnifyingGlass size={19} aria-hidden="true"/><input aria-label="제품 이름 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="제품 이름으로 찾기"/>{query&&<button type="button" aria-label="검색어 지우기" onClick={()=>setQuery('')}><X size={16}/></button>}</label>}
  </div>
  {brand&&family&&!search&&<>
   <div className="ob-catalog-topline"><button type="button" onClick={()=>setFamilyId('')}><ArrowLeft size={16}/>종류 다시 보기</button><span>{materialLabel(family.material)} / {family.label}</span></div>
   <div className="ob-family-tabs" role="group" aria-label={`${materialLabel(family.material)} 하위 분류`}>{(products[family.material]||[]).map(([id,label])=><button key={id} type="button" aria-pressed={family.id===`${family.material}-${id}`} onClick={()=>chooseFamily(`${family.material}-${id}`)}>{label}</button>)}</div>
  </>}
  {brand&&<button type="button" className={'ob-recommend-choice'+(draft.material==='unknown'?' is-selected':'')} aria-pressed={draft.material==='unknown'} onClick={()=>onUpdate({material:'unknown',product:'',variant:'',materialOption:'',appearance:'',woodSpecies:''})}><Question size={20}/><span>어떤 종류인지 모르겠어요. 추천받을게요.</span></button>}
  {brand&&draft.material==='unknown'&&<div className="ob-recommend"><label htmlFor="ob-product-use">무엇을 포장하시나요?</label><input id="ob-product-use" value={draft.productUse} maxLength={80} onChange={e=>onUpdate({productUse:e.target.value})} placeholder="예: 향수, 쿠키, 의류"/></div>}
  <p className="ob-art-note">형태 선택을 돕는 AI 연출 이미지예요.</p>
  <div className="ob-products">
   {brand&&(family||search)?variants.map(v=><ProductCard key={v.id} family={productInfo(v.product)} variant={v.id} name={v.name} detail={productInfo(v.product)?.label} selected={draft.variant===v.id} onClick={()=>chooseVariant(v)}/>):visibleFamilies.map(f=><ProductCard key={f.id} family={f} name={f.label} detail={brand?`${materialLabel(f.material)} · ${productVariants(f.id).length}가지 형태`:materialLabel(f.material)} selected={brand?draft.product===f.id:draft.supplierProducts.includes(f.id)} onClick={()=>chooseFamily(f.id)}/>)}
  </div>
  {search&&!variants.length&&<p className="ob-catalog-empty">찾는 제품이 없어요. 다른 이름으로 검색하거나 추천받기를 선택해 주세요.</p>}
  {!brand&&draft.supplierProducts.length>0&&<div className="ob-selected-tags" aria-label="선택한 제작 품목">{draft.supplierProducts.map(id=><button key={id} type="button" onClick={()=>onToggle('supplierProducts',id)}>{productInfo(id)?.label}<X size={14}/></button>)}</div>}
 </div>;
}
