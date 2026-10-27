export function reviewBeforeSave({title='저장 전 다시 확인해주세요',rows,action='확인 후 저장',message='입력한 조건이 맞는지 다시 확인해주세요.'}) {
 const previous=document.activeElement,dialog=document.createElement('dialog');
 dialog.className='review-dialog';
 const heading=document.createElement('h2');heading.id='save-review-title';heading.textContent=title;
 dialog.setAttribute('aria-labelledby',heading.id);
 const description=document.createElement('p');description.textContent=message;
 const list=document.createElement('dl');list.className='review-summary';
 for(const [label,value] of rows){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=String(value??'').trim()||'미입력';list.append(term,detail);}
 const form=document.createElement('form');form.method='dialog';
 const check=document.createElement('label');check.className='check';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.required=true;check.append(checkbox,' 위 내용을 다시 확인했습니다.');
 const actions=document.createElement('div');actions.className='actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='돌아가서 수정';cancel.onclick=()=>dialog.close('cancel');
 const save=document.createElement('button');save.type='submit';save.value='save';save.textContent=action;save.disabled=true;checkbox.onchange=()=>{save.disabled=!checkbox.checked;};
 actions.append(cancel,save);form.append(check,actions);dialog.append(heading,description,list,form);document.body.append(dialog);
 return new Promise(resolve=>{dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='save';dialog.remove();if(previous?.isConnected)previous.focus();resolve(accepted);},{once:true});dialog.showModal();cancel.focus();});
}
