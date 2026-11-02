import { motion,useReducedMotion } from 'motion/react';
import { Package } from '@phosphor-icons/react';

export function BrandMark({size=28}){
  return <><Package size={size} weight="fill" aria-hidden="true"/><span>factner<span className="logo-dot">.</span></span></>;
}

export function Button({children,className='',tone='primary',...props}){
  const reduce=useReducedMotion();
  return <motion.button type="button" className={`button ${tone} ${className}`}
    whileHover={reduce?undefined:{y:-2}} whileTap={reduce?undefined:{scale:.96,y:0}}
    transition={{type:'spring',stiffness:420,damping:30,mass:.8}} {...props}>{children}</motion.button>;
}

export function Photo({index,className='',label}){
  return <div role="img" aria-label={label||'패키징 제작 사례 예시 이미지'} className={`product-photo photo-${index} ${className}`}/>;
}
