import {useEffect, useRef, useState} from 'react';
import {ArrowRight, Briefcase, Buildings, Factory, FileText, Storefront, UploadSimple, UserCircle, X} from '@phosphor-icons/react';
import {formatBusinessNumber, formatInput, formatPhone} from '../../admin-ui/input-format.js';
import {prepareUpload} from '../../shared/image-upload.js';
import {api} from './api';

export const legalTypes = {individual:'개인',sole:'개인사업자',corporate:'법인사업자'};

export function Field({label,children,...props}){return <label className="member-field"><span>{label}</span>{children||<input {...props}/>}</label>;}
export function Preview({file}){
 return file.mime?.startsWith('image/')?<img src={file.data?`data:${file.mime};base64,${file.data}`:`/api/member/files/${file.id}`} alt={file.name}/>:<FileText size={32}/>;
}
async function encodeFile(file,kind){
 if(!file.size)throw new Error('빈 파일은 첨부할 수 없습니다.');
 if((kind==='workplace' || kind==='sample') && file.type==='application/pdf')throw new Error('사진은 JPG, PNG 또는 WEBP 파일을 선택해주세요.');
 file=await prepareUpload(file);
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.'));reader.readAsDataURL(file);});
 return {name:file.name,mime:file.type,kind,data};
}
export function Upload({files,onChange,kind,label,max=5,remote=false,onBusy}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(true);
 useEffect(()=>{active.current=true;return ()=>{active.current=false;onBusy?.(false);};},[onBusy]);
 return <div className="member-upload"><label className="member-drop"><UploadSimple size={28}/><span><strong>{busy?'파일을 준비하고 있어요':label}</strong><small>{kind==='certificate' && '필수 1개 · '}{kind==='workplace' && `선택 최대 ${max}장 · `}{kind==='workplace'||kind==='sample'?'JPG · PNG · WEBP':'JPG · PNG · WEBP · PDF'} · 큰 사진은 자동 압축{kind!=='workplace'&&kind!=='sample'?' · PDF 원본 유지 (1.5MB 이하)':''}</small></span><input type="file" aria-label={label} multiple={max>1} disabled={busy} accept={kind==='workplace'||kind==='sample'?'.jpg,.jpeg,.png,.webp':'.jpg,.jpeg,.png,.webp,.pdf'} onChange={async e=>{
  const selected=[...e.target.files];e.target.value='';setError('');if(selected.length+files.length>max){setError(`최대 ${max}개까지 첨부할 수 있어요.`);return;}setBusy(true);onBusy?.(true);const next=[...files];
  try{
   for(const file of selected){
    const encoded=await encodeFile(file,kind);
    if(!active.current)return;
    const stored=remote?(await api('member/files',{method:'POST',body:JSON.stringify(encoded)})).file:encoded;
    if(!active.current)return;
    next.push(stored);onChange([...next]);
   }
  }catch(problem){if(active.current)setError(problem.message);}finally{if(active.current){setBusy(false);onBusy?.(false);}}
 }}/></label>{error&&<p className="member-error" role="alert">{error}</p>}
 <div className="member-files">{files.map((file,i)=><div className="member-file" key={file.id||`${file.name}-${i}`}><Preview file={file}/><span>{file.name}</span><button type="button" disabled={busy} aria-label={`${file.name} 제거`} onClick={()=>onChange(files.filter((_,index)=>index!==i))}><X size={18}/></button></div>)}</div></div>;
}

export function MemberLoginFields({Button, email, passwordRef, onEmailChange, onRecovery}) {
  return <>
    <Field label="이메일" name="email" type="email" autoComplete="username" maxLength={254} required defaultValue={email} onChange={onEmailChange}/>
    <Field label="비밀번호"><input name="password" type="password" ref={passwordRef} autoComplete="current-password" minLength={8} maxLength={128} required/></Field>
    <Button type="submit" className="member-full">로그인 <ArrowRight size={18}/></Button>
    <p className="member-hint">심사 중인 계정은 승인 후 이용할 수 있어요.</p>
    <div className="member-recovery-links"><button type="button" onClick={()=>onRecovery('find-id')}>아이디 찾기</button>
      <button type="button" onClick={()=>onRecovery('recover-password')}>비밀번호 찾기</button></div>
  </>;
}
export function MemberActivityChoices({onChoose,children}) {
  return <div className="member-choice-list">{[
    ['brand',Storefront,'브랜드','우리 제품에 맞는 패키징을 찾아요'],
    ['supplier',Factory,'박스·패키징 제작 업체','브랜드의 패키징 제작 의뢰를 찾아요']
  ].map(([key,Icon,title,copy]) => <button type="button" className="member-choice" key={key} onClick={()=>onChoose(key)}>
    <span className="member-symbol"><Icon size={32}/></span><span><strong>{title}</strong><small>{copy}</small></span>
  </button>)}{children}</div>;
}
export function MemberLegalChoices({onChoose}) {
  return <div className="member-choice-list">{[['individual',UserCircle],['sole',Briefcase],['corporate',Buildings]].map(([key,Icon])=>
    <button type="button" className="member-choice" key={key} onClick={()=>onChoose(key)}>
      <span className="member-symbol"><Icon size={30}/></span><strong>{legalTypes[key]}</strong>
    </button>)}</div>;
}
export function MemberRegistrationFields({role, legal, draft, cert, setCert, onCertBusy, photos, setPhotos, onPhotosBusy, passwordRef}) {
  return <>
    <p className="member-tag">{role==='brand'?'브랜드':'패키징 제작 업체'} · {legalTypes[legal]}</p>
    <Field label={role==='brand'?'브랜드명':'업체명 / 활동명'} name="name" defaultValue={draft.name||''} maxLength={100} required/>
    <div className="member-form-grid"><Field label="담당자" name="contact" defaultValue={draft.contact||''} maxLength={60} required/>
      <Field label="연락처" name="phone" defaultValue={draft.phone||''} type="tel" inputMode="tel" maxLength={30} onInput={e=>formatInput(e,formatPhone)} required/></div>
    <Field label="이메일" name="email" defaultValue={draft.email||''} type="email" autoComplete="username" maxLength={254} required/>
    <Field label="비밀번호 · 8자 이상"><input name="password" type="password" ref={passwordRef} defaultValue={draft.password||''} autoComplete="new-password" minLength={8} maxLength={128} required/></Field>
    {legal!=='individual' && <><Field label="사업자등록번호" name="businessNumber" defaultValue={draft.businessNumber||''} inputMode="numeric" onInput={e=>formatInput(e,formatBusinessNumber)} placeholder="000-00-00000" pattern="[0-9]{3}-?[0-9]{2}-?[0-9]{5}" maxLength={12} required/>
      <Upload label="사업자등록증 첨부" files={cert} onChange={setCert} onBusy={onCertBusy} kind="certificate" max={1}/></>}
    <Upload label="작업 현장·패키징 사진 첨부" files={photos} onChange={setPhotos} onBusy={onPhotosBusy} kind="workplace" max={4}/>
  </>;
}
