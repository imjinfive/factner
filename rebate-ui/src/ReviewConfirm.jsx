import * as Dialog from '@radix-ui/react-dialog';
import './review-confirm.css';

export default function ReviewConfirm({open,onCancel,onConfirm,title='입력 내용을 다시 확인해주세요',children,busy=false,error='',confirmLabel='확인하고 제출'}){
 return <Dialog.Root open={open} onOpenChange={value=>{if(!value&&!busy)onCancel();}}><Dialog.Portal>
  <Dialog.Overlay className="review-overlay"/>
  <Dialog.Content className="review-dialog" onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onPointerDownOutside={event=>event.preventDefault()}>
   <Dialog.Title>{title}</Dialog.Title><Dialog.Description>아래 내용이 맞는지 한 번 더 확인한 뒤 제출해주세요. 수정하려면 이전 화면으로 돌아갈 수 있어요.</Dialog.Description>
   <div className="review-content">{children}</div>
   {error&&<p className="member-error" role="alert">{error}</p>}
   <div className="review-actions"><button type="button" disabled={busy} onClick={onCancel}>돌아가서 수정</button><button type="button" className="review-submit" disabled={busy} onClick={onConfirm}>{busy?'처리 중…':confirmLabel}</button></div>
  </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}
