import React from 'react';
import './packaging-art.css';

// One atlas keeps the 36 representative illustrations visually consistent and cached together.
export const packagingArtKeys = [
  'paper-carton', 'paper-corrugated', 'paper-rigid', 'paper-bag', 'vinyl-flat', 'vinyl-display',
  'vinyl-mailer', 'vinyl-shopping', 'vinyl-film', 'pouch-flat', 'pouch-zip', 'pouch-spout',
  'pouch-stick', 'plastic-bottle', 'plastic-jar', 'plastic-tube', 'plastic-food', 'plastic-case',
  'plastic-makeup', 'glass-bottle', 'glass-jar', 'glass-cosmetic', 'glass-fragrance', 'metal-tin',
  'metal-can', 'metal-cosmetic', 'metal-industrial', 'wood-gift', 'wood-product', 'wood-shipping',
  'wood-accessory', 'cold-box', 'cold-envelope', 'cold-bag', 'cold-liner', 'cold-ice',
];
const aliases = {
  paper:'paper-carton', carton:'paper-carton', corrugated:'paper-corrugated', rigid:'paper-rigid', bag:'paper-bag',
  vinyl:'vinyl-shopping', pouch:'pouch-zip', plastic:'plastic-bottle', glass:'glass-cosmetic',
  metal:'metal-tin', wood:'wood-gift', cold:'cold-box', brand:'paper-carton', supplier:'paper-corrugated',
};
// The generated atlas has equal columns but optically spaced rows; crop each row without clipping the products.
const rows = [[0,222],[230,222],[453,220],[673,205],[878,200],[1080,174]];

export default function PackagingArt({kind='paper-carton', className='', label='', decorative=true}) {
  const index = Math.max(0, packagingArtKeys.indexOf(aliases[kind] || kind));
  const [top,height] = rows[Math.floor(index / 6)];
  return <span
    className={`packaging-art ${className}`.trim()}
    role={decorative ? undefined : 'img'}
    aria-hidden={decorative ? true : undefined}
    aria-label={decorative ? undefined : label || '팩트너 패키징 예시 그림'}
  ><span className="packaging-art-crop" style={{
    width:`${209 / 222 * 100}%`, height:`${height / 222 * 100}%`,
    backgroundSize:`600% ${1254 / height * 100}%`,
    backgroundPosition:`${(index % 6) * 20}% ${top / (1254-height) * 100}%`,
  }}/></span>;
}
