import {Package} from '@phosphor-icons/react';
import {productVariants,variantInfo} from './packaging-catalog.js';
import './packaging-art.css';

const representatives={
 'paper-carton':'tuck','paper-corrugated':'g-box','paper-rigid':'two-piece','paper-bag':'shopping','paper-cafe':'tray',
 'vinyl-flat':'adhesive','vinyl-display':'header','vinyl-mailer':'standard','vinyl-shopping':'die-cut','vinyl-film':'shrink',
 'pouch-flat':'stand','pouch-zip':'stand','pouch-spout':'center','pouch-stick':'stick',
 'plastic-bottle':'pump','plastic-jar':'cream','plastic-tube':'standard','plastic-food':'salad','plastic-case':'insert','plastic-makeup':'cushion',
 'glass-bottle':'drink','glass-jar':'jam','glass-cosmetic':'dropper','glass-fragrance':'perfume',
 'metal-tin':'square','metal-can':'drink','metal-cosmetic':'tube','metal-industrial':'pail',
 'wood-gift':'slide','wood-product':'wine','wood-shipping':'crate','wood-accessory':'pallet',
 'cold-box':'eps','cold-envelope':'adhesive','cold-bag':'tote','cold-liner':'liner','cold-ice':'water',
};
const aliases={paper:'paper-carton',vinyl:'vinyl-shopping',pouch:'pouch-zip',plastic:'plastic-bottle',glass:'glass-cosmetic',metal:'metal-tin',wood:'wood-gift',cold:'cold-box'};

export default function PackagingArt({kind,className='',label='',decorative=true}){
 const family=aliases[kind]||kind;
 const variant=variantInfo(kind)||variantInfo(`${family}-${representatives[family]}`)||productVariants(family)[0];
 return <span className={`packaging-art ${className}`.trim()} aria-hidden={decorative?true:undefined}>
  {variant?<img src={`/generated/packaging/${variant.id}.webp`} width="640" height="640" loading="lazy" decoding="async" alt={decorative?'':label||`${variant.name} 연출 이미지`}/>:<Package size={40} weight="light" aria-label={decorative?undefined:label||'패키징 추천'}/>}
 </span>;
}
