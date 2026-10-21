import {useEffect,useId,useRef,useState} from 'react';
import {packagingOptions,splitAddress,joinAddress} from './packaging-input.js';

export function PackagingChoice({label,kind,value,onChange,required=false}){
 const id=useId(),options=packagingOptions[kind],isPreset=options.includes(value)||(!required&&value==='없음');
 const [custom,setCustom]=useState(!!value&&!isPreset),[draft,setDraft]=useState(!isPreset?value:'');
 return <div className="member-field"><label htmlFor={id}>{label}</label><select id={id} value={custom?'custom':value} required={required} onChange={e=>{const next=e.target.value;setCustom(next==='custom');onChange(next==='custom'?draft:next);}}><option value="">선택해주세요</option>{!required&&<option value="없음">없음</option>}{options.map(option=><option key={option} value={option}>{option}</option>)}<option value="custom">직접 입력</option></select>{custom&&<input aria-label={`${label} 직접 입력`} value={value} onChange={e=>{setDraft(e.target.value);onChange(e.target.value);}} placeholder="직접 입력" required maxLength={kind==='material'?100:200}/>}</div>;
}

let postcodeLoading;
function loadPostcode(){
 if(window.kakao?.Postcode||window.daum?.Postcode)return Promise.resolve(window.kakao?.Postcode||window.daum.Postcode);
 if(postcodeLoading)return postcodeLoading;
 postcodeLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';script.async=true;
  const fail=()=>{clearTimeout(timer);script.remove();postcodeLoading=null;reject(new Error('주소 검색에 연결하지 못했어요. 아래에 주소를 직접 입력해주세요.'));};
  const timer=setTimeout(fail,15000);
  script.onerror=fail;script.onload=()=>{clearTimeout(timer);const Postcode=window.kakao?.Postcode||window.daum?.Postcode;if(Postcode)resolve(Postcode);else fail();};document.head.append(script);
 });return postcodeLoading;
}

export function PostcodeAddress({initialValue='',name='address',onChange,required=true}){
 const [value,setValue]=useState(()=>splitAddress(initialValue)),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const container=useRef(null),detail=useRef(null),mounted=useRef(true),request=useRef(0),readyTimer=useRef(null),id=useId();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++;clearTimeout(readyTimer.current);};},[]);
 const update=next=>{setValue(next);onChange?.(joinAddress(next));};
 const closeSearch=()=>{request.current++;clearTimeout(readyTimer.current);setBusy(false);setOpen(false);container.current?.replaceChildren();};
 const search=async()=>{
  const generation=++request.current;clearTimeout(readyTimer.current);setBusy(true);setError('');setOpen(true);
  const current=()=>mounted.current&&request.current===generation;
  const ready=()=>{if(current()){clearTimeout(readyTimer.current);setBusy(false);}};
  try{
   const Postcode=await loadPostcode();if(!current())return;container.current.replaceChildren();
   // The vendor sends onresize after its initial search view is ready.
   readyTimer.current=setTimeout(()=>{if(current()){setError('검색창을 불러오지 못했어요. 주소를 직접 입력하거나 우편번호 찾기를 다시 눌러주세요.');closeSearch();}},12000);
   new Postcode({width:'100%',height:430,onresize:ready,onsearch:ready,oncomplete:data=>{if(!current())return;ready();update({postcode:data.zonecode||'',address:(data.userSelectedType==='R'?data.roadAddress:data.jibunAddress)||data.address||'',detail:''});closeSearch();detail.current?.focus();}}).embed(container.current);
  }catch(problem){if(current()){setError(problem.message);closeSearch();}}
 };
 return <div className="member-address"><input type="hidden" name={name} value={joinAddress(value)}/><div className="member-field"><label htmlFor={`${id}-postcode`}>배송지{required?'':' (선택)'}</label><div className="member-address-search"><input id={`${id}-postcode`} aria-label="우편번호" inputMode="numeric" autoComplete="shipping postal-code" placeholder="우편번호" value={value.postcode} pattern="[0-9]{5}" maxLength={5} onChange={e=>update({...value,postcode:e.target.value.replace(/\D/g,'')})}/><button type="button" className="member-address-button" onClick={search} disabled={busy}>{busy?'불러오는 중…':'우편번호 찾기'}</button></div><input aria-label="배송지 기본 주소" autoComplete="shipping address-line1" placeholder="주소 검색 또는 직접 입력" value={value.address} required={required||!!value.postcode||!!value.detail} maxLength={200} onChange={e=>update({...value,address:e.target.value})}/><input ref={detail} aria-label="배송지 상세 주소" autoComplete="shipping address-line2" placeholder="상세 주소 (동·호수 등)" value={value.detail} maxLength={90} onChange={e=>update({...value,detail:e.target.value})}/></div>{error&&<p role="alert" className="member-error">{error}</p>}<div className="member-postcode" hidden={!open}><div className="member-postcode-heading"><strong>우편번호 찾기</strong><button type="button" onClick={closeSearch}>닫기</button></div><div ref={container} className="member-postcode-frame"/>{busy&&<p role="status">주소 검색을 불러오고 있어요.</p>}</div></div>;
}
