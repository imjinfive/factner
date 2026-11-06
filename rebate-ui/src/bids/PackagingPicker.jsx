import {useEffect,useRef} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle,Question,X} from '@phosphor-icons/react';
import PackagingArt from './PackagingArt';
import {materials,products,productInfo,productVariants,materialLabel,supplierProductLabel,toggleSupplierProduct} from './onboarding-data';

function ProductCard({kind,name,detail,selected,onClick}){
 return <button type="button" className={'ob-product'+(selected?' is-selected':'')} aria-pressed={selected} onClick={onClick}>
  <PackagingArt kind={kind}/><span className="ob-product-name">{name}<span className="ob-product-check" aria-hidden="true">{selected?<CheckCircle size={21} weight="fill"/>:<ArrowRight size={17}/>}</span></span>
  {detail&&<span className="ob-product-detail">{detail}</span>}
 </button>;
}

export default function PackagingPicker({draft,onUpdate}){
 const brand=draft.role==='brand',level=draft.catalogLevel,family=productInfo(draft.product),grid=useRef(null),previousLevel=useRef(level);
 useEffect(()=>{if(previousLevel.current!==level){grid.current?.focus({preventScroll:true});previousLevel.current=level;}},[level]);
 function chooseMaterial(material){onUpdate({material,product:'',variant:'',materialOption:'',appearance:'',woodSpecies:'',catalogLevel:'families'});}
 function chooseFamily(product){onUpdate({product,variant:draft.product===product?draft.variant:'',materialOption:'',appearance:'',woodSpecies:'',catalogLevel:'variants'});}
 function chooseVariant(variant){onUpdate(brand?{variant:variant.id}:{supplierProducts:toggleSupplierProduct(draft.supplierProducts,variant.id)});}
 const title=level==='materials'?'패키징 재질':level==='families'?`${materialLabel(draft.material)} 종류`:`${family?.label} 세부 형태`;
 return <div className={'ob-catalog'+(level==='materials'?' ob-catalog-materials':'')}>
  {level!=='materials'&&<div className="ob-catalog-topline"><button type="button" onClick={()=>onUpdate({catalogLevel:level==='variants'?'families':'materials'})}><ArrowLeft size={16}/>{level==='variants'?'종류 다시 보기':'재질 다시 보기'}</button><span>{materialLabel(draft.material)}{level==='variants'&&` / ${family?.label}`}</span></div>}
  {!brand&&level==='variants'&&family&&<button type="button" className={'ob-family-select'+(draft.supplierProducts.includes(family.id)?' is-selected':'')} aria-pressed={draft.supplierProducts.includes(family.id)} onClick={()=>onUpdate({supplierProducts:toggleSupplierProduct(draft.supplierProducts,family.id)})}><CheckCircle size={20}/>{family.label} 전체 제작 가능</button>}
  <div ref={grid} tabIndex={-1} role="group" aria-label={title} className={level==='materials'?'ob-products ob-material-grid':'ob-products'+(level==='families'?' ob-family-grid':'')}>
   {level==='materials'?materials.map(([id,label])=><ProductCard key={id} kind={id} name={label} onClick={()=>chooseMaterial(id)}/>):level==='families'?(products[draft.material]||[]).map(([id,label])=><ProductCard key={id} kind={`${draft.material}-${id}`} name={label} detail={`${productVariants(`${draft.material}-${id}`).length}가지 형태`} onClick={()=>chooseFamily(`${draft.material}-${id}`)}/>):productVariants(draft.product).map(v=><ProductCard key={v.id} kind={v.id} name={v.name} selected={brand?draft.variant===v.id:draft.supplierProducts.includes(v.id)||draft.supplierProducts.includes(v.product)} onClick={()=>chooseVariant(v)}/>)}
  </div>
  {brand&&<><button type="button" className={'ob-recommend-choice'+(draft.material==='unknown'?' is-selected':'')} aria-pressed={draft.material==='unknown'} onClick={()=>onUpdate({material:'unknown',product:'',variant:'',materialOption:'',appearance:'',woodSpecies:'',catalogLevel:'materials'})}><Question size={20}/><span>어떤 종류인지 모르겠어요. 추천받을게요.</span></button>{draft.material==='unknown'&&<div className="ob-recommend"><label htmlFor="ob-product-use">무엇을 포장하시나요?</label><input id="ob-product-use" value={draft.productUse} maxLength={80} onChange={e=>onUpdate({productUse:e.target.value})} placeholder="예: 향수, 쿠키, 의류"/></div>}</>}
  {!brand&&draft.supplierProducts.length>0&&<div className="ob-selected-tags" aria-label="선택한 제작 품목">{draft.supplierProducts.map(id=><button key={id} type="button" aria-label={`${supplierProductLabel(id)} 선택 해제`} onClick={()=>onUpdate({supplierProducts:draft.supplierProducts.filter(value=>value!==id)})}>{supplierProductLabel(id)}<X size={14}/></button>)}</div>}
 </div>;
}
