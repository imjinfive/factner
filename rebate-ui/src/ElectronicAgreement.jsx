import {useEffect, useRef, useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {SUBMISSION_AGREEMENT} from '../../shared/submission-agreement.js';
import './review-confirm.css';
import './electronic-agreement.css';

export default function ElectronicAgreement({open,onCancel,onConfirm,busy=false,error='',confirmLabel='서명하고 심사 요청',description='내용을 확인하고 서명자 이름을 입력해주세요. 서명 기록은 제출 내용과 함께 저장됩니다.',children}) {
  const [signature,setSignature]=useState(''),[accepted,setAccepted]=useState(false);
  const title=useRef(null),returnFocus=useRef(null),lock=useRef(false);
  useEffect(()=>{if(!open){setSignature('');setAccepted(false);}},[open]);
  async function submit(event) {
    event.preventDefault();
    if(busy || lock.current || !accepted || !signature.trim())return;
    lock.current=true;
    try{await onConfirm({accepted:true,version:SUBMISSION_AGREEMENT.version,signature:signature.trim()});}
    finally{lock.current=false;}
  }
  return <Dialog.Root open={open} onOpenChange={value=>{if(!value&&!busy)onCancel();}}><Dialog.Portal>
    <Dialog.Overlay className="review-overlay"/>
    <Dialog.Content className="review-dialog electronic-agreement"
      onOpenAutoFocus={event=>{event.preventDefault();returnFocus.current=document.activeElement;title.current?.focus();}}
      onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus({preventScroll:true});}}
      onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}
      onPointerDownOutside={event=>event.preventDefault()}>
      <Dialog.Title ref={title} tabIndex={-1}>{SUBMISSION_AGREEMENT.title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
      <article className="electronic-agreement-document" aria-label="심사 제출 확인서 본문"><p>{SUBMISSION_AGREEMENT.body}</p></article>
      <p className="electronic-agreement-version">문서 버전 {SUBMISSION_AGREEMENT.version}</p>
      {children&&<details className="electronic-agreement-summary"><summary>제출 내용 다시 보기</summary><div className="review-content">{children}</div></details>}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="electronic-agreement-name"><span>서명자 이름</span><input name="signature" autoComplete="off" maxLength={80} required value={signature} onChange={event=>setSignature(event.target.value)} placeholder="직접 이름을 입력해주세요"/></label>
          <label className="electronic-agreement-check"><input type="checkbox" checked={accepted} required onChange={event=>setAccepted(event.target.checked)}/><span>이번 제출 내용과 확인서를 읽었으며, 위 이름으로 서명합니다.</span></label>
        </fieldset>
        {error&&<p className="member-error" role="alert">{error}</p>}
        <div className="review-actions"><button type="button" disabled={busy} onClick={onCancel}>돌아가서 수정</button><button type="submit" className="review-submit" disabled={busy||!accepted||!signature.trim()}>{busy?'제출 중…':confirmLabel}</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
