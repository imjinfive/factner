import {Moon,Sun} from '@phosphor-icons/react';
import {BrandMark,Button} from './BrandControls';
import {policyTitles} from './PolicyDocument';

export default function SiteFooter({onHome,onSection,active,theme,onTheme}){
  return <footer className="site-footer shell"><div>
    <button className="logo" aria-label="팩트너 홈" onClick={onHome}><BrandMark size={24}/></button>
    <small>© {new Date().getFullYear()} factner.</small></div>
    <nav className="footer-right" aria-label="운영 안내">
      {Object.entries(policyTitles).map(([key,title])=><button key={key} className={key==='privacy'?'footer-privacy':undefined} aria-current={active===key?'page':undefined} onClick={()=>onSection(key)}>{title}</button>)}
      <Button tone="ghost" className="icon-button" aria-label={theme==='light'?'다크 모드로 전환':'라이트 모드로 전환'} onClick={onTheme}>
        {theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</Button>
    </nav></footer>;
}
