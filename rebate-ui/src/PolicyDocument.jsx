import {useEffect,useState} from 'react';
import {api} from './api.js';

export const policyTitles = {terms:'이용약관',privacy:'개인정보처리방침',policy:'운영정책'};
const operatingGuide = [
  ['가입과 승인','브랜드와 패키징 제작업체는 활동 및 가입 유형을 선택해 가입을 신청합니다. 운영팀이 신청 정보를 확인한 뒤 승인합니다. 디자이너의 신규 가입은 아직 열리지 않았습니다.'],
  ['공고 열람과 제안','가입 전에 파트너와 공고를 둘러볼 수 있습니다. 공고는 브랜드가 등록하고 운영팀이 승인한 뒤 공개됩니다. 예시로 표시된 업체는 실제 거래 대상이 아닙니다. 공고를 본 뒤 가입해도 해당 업체에 제안이나 매칭 요청이 전송되지 않습니다.'],
  ['익명 정보와 거래','공고와 제안에는 상호, 연락처, 외부 링크를 적지 않습니다. 회원가입이나 공고 열람만으로 계약이 성립하거나 비용이 청구되지 않습니다.'],
];

export default function PolicyDocument({kind}) {
  const [document,setDocument]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(kind==='policy')return;
    let active=true;
    setError('');
    api('policy').then(data=>{if(active)setDocument(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[kind,retry]);
  if(kind==='policy')return <div className="policy-guide">{operatingGuide.map(([title,copy])=><section key={title}><h2>{title}</h2><p>{copy}</p></section>)}</div>;
  if(error)return <div role="alert"><p>{error}</p><button className="button outline" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></div>;
  if(!document)return <p role="status">문서를 불러오는 중입니다.</p>;
  return <div className="policy-document">
    {!document.published&&<p className="demo-note">검토 중인 초안입니다. 정식 게시 전에는 내용이 바뀔 수 있습니다.</p>}
    <p className="request-description">{document[kind]}</p>
    {(document.operator||document.contactEmail)&&<p className="helper-text">{[document.operator,document.contactEmail].filter(Boolean).join(' · ')}</p>}
  </div>;
}
