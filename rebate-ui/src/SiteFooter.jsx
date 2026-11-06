import {Moon,Sun} from '@phosphor-icons/react';
import {BrandMark,Button} from './BrandControls';
import {policyTitles} from './PolicyDocument';
import {useEffect,useState} from 'react';
import {api} from './api';
import {businessFields,registeredCompany} from '../../admin-ui/business-fields.js';

export default function SiteFooter({onHome,onSection,active,theme,onTheme}){
  const [company,setCompany]=useState(registeredCompany),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let current=true;
    api('config').then(config=>{
      if(current)setCompany(config.business?{...config.business,operator:config.operator,email:config.contactEmail}:registeredCompany);
    }).catch(()=>{if(current)setFailed(true);});
    return ()=>{current=false;};
  },[attempt]);
  return <footer className="site-footer shell"><div>
    <button className="logo" aria-label="팩트너 홈" onClick={onHome}><BrandMark size={24}/></button>
    <p>운영사 {company.operator}</p>
    <div className="footer-company">
      {businessFields.filter(([key])=>key!=='hosting'&&key!=='verificationUrl'&&company[key]).map(([key,label])=><span key={key}>{label} {company[key]}</span>)}
      {company.email&&<span>문의 이메일 <a href={'mailto:'+company.email}>{company.email}</a></span>}
      {company.verificationUrl&&<a href={company.verificationUrl}>사업자정보 확인</a>}
    </div>
    {failed&&<button type="button" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>사업자 정보 다시 불러오기</button>}
    <small>© {new Date().getFullYear()} factner.</small></div>
    <nav className="footer-right" aria-label="운영 안내">
      {Object.entries(policyTitles).map(([key,title])=><button key={key} className={key==='privacy'?'footer-privacy':undefined} aria-current={active===key?'page':undefined} onClick={()=>onSection(key)}>{title}</button>)}
      <Button tone="ghost" className="icon-button" aria-label={theme==='light'?'다크 모드로 전환':'라이트 모드로 전환'} onClick={onTheme}>
        {theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</Button>
    </nav></footer>;
}
