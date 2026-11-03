import {useState} from 'react';
import {Button} from '../BrandControls';
import CustomerAccount from './CustomerAccount';
import '../member-portal.css';
import './access.css';

export default function PartnerAccess({mode,session,onNavigate,onAuth,onExit,onMembers}) {
  const [accountError,setAccountError]=useState('');
  if(mode==='account' && session.user)return <section className="member-auth pa-access">
    <header className="member-auth-heading"><h1>내 계정</h1></header>
    <div className="member-card"><span className="member-tag">{{brand:'브랜드',packaging:'패키징 제작업체',both:'패키징 제작업체',admin:'운영팀'}[session.user.kind] || '회원'}</span>
      <h2 className="pa-section-title">{session.user.name}</h2>{session.user.email && <p className="member-hint">{session.user.email}</p>}
      <div className="pa-account-actions"><Button onClick={()=>onNavigate('contracts')}>거래 현황</Button>
        {!session.demo && session.user.kind!=='admin' && onMembers && <Button tone="outline" onClick={onMembers}>회원 정보·발주 확인</Button>}
        <Button tone="ghost" onClick={async()=>{try{await onExit();}catch(e){setAccountError(e.message);}}}>로그아웃</Button>
      </div>{accountError && <p className="member-error" role="alert">{accountError}</p>}
    </div></section>;
  const accountMode=['signup','find-id','recover-password','reset-password'].includes(mode)?mode:'login';
  return <CustomerAccount key={accountMode==='signup'?session.registration?.consentVersion:undefined} mode={accountMode} session={session} onNavigate={onNavigate} onAuth={onAuth}/>;
}
