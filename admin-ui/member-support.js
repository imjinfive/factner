import {reviewBeforeSave} from './review.js';
import {showMemberSection} from './member-editor.js';

export const memberRequestKinds={profile:'회원정보 수정',company:'업체정보 수정',matching:'후보 조건 상담',inquiry:'담당자 문의'};
const states={pending:'접수',reviewing:'검토 중',completed:'처리 완료',rejected:'보류'};
const fields={managerName:'팩트너 담당자 이름',managerPhone:'팩트너 담당자 전화번호',managerEmail:'팩트너 담당자 이메일',signupEta:'가입 심사 예상 처리 시간',packagingEta:'패키징 검토 예상 처리 시간',matchingEta:'파트너 연결 예상 처리 시간',responseEta:'문의 예상 답변 시간'};
const labels={name:'업체명',contact:'회원 담당자',phone:'회원 연락처',email:'이메일',summary:'업체 소개',categories:'품목',quantity:'수량',productionPeriod:'생산 희망 기간',industry:'업종',delivery:'납품 조건',material:'소재',finish:'인쇄·후가공',note:'추가 조건',category:'품목',role:'활동',capacity:'제작 가능 수량'};
const values={box:'박스',packaging:'제품 패키징',supplies:'부자재',brand:'브랜드',supplier:'제작 업체'};
const format=value=>Array.isArray(value)?value.map(item=>values[item]||item).join(', '):value&&typeof value==='object'?JSON.stringify(value,null,2):values[value]||value;
const active=request=>['pending','reviewing'].includes(request.status);

export async function memberSupport(context,member,reload){
 const {api,send,esc,submit,notice}=context;
 const [{support},{requests}]=await Promise.all([api(`admin/members/${member.id}/support`),api(`admin/member-requests?memberId=${member.id}`)]);
 function card(request){
  const editable=['profile','company'].includes(request.kind),target=request.kind==='profile'?'member-profile':'member-company';
  return `<article class="workflow-request"><div class="member-section-heading"><strong>${memberRequestKinds[request.kind]||esc(request.kind)}</strong><span class="badge">${states[request.status]}</span></div><small>${new Date(request.created_at).toLocaleString('ko-KR')}</small><p class="pre">${esc(request.message)}</p>${Object.keys(request.details||{}).length?`<dl class="request-details">${Object.entries(request.details).map(([key,value])=>`<dt>${esc(labels[key]||key)}</dt><dd class="pre">${esc(format(value))}</dd>`).join('')}</dl>`:''}${active(request)?`<form data-member-request="${esc(request.id)}">${editable?`<p class="wide muted">요청 내용은 자동 적용되지 않습니다. 아래 버튼으로 실제 정보를 수정·저장한 뒤 처리 완료로 바꿔주세요.</p><button type="button" class="secondary wide" data-request-edit="${target}">실제 ${request.kind==='profile'?'회원':'업체'}정보 수정하기 →</button>`:''}<label>진행 상태<select name="status" required><option value="" disabled ${request.status==='pending'?'selected':''}>처리할 상태 선택</option>${Object.entries(states).filter(([key])=>key!=='pending').map(([key,label])=>`<option value="${key}" ${key===request.status?'selected':''}>${label}</option>`).join('')}</select></label><label>회원에게 보이는 처리 안내<textarea name="note" rows="3" maxlength="2000" required>${esc(request.note)}</textarea></label>${editable?'<label class="check wide"><input name="applied" type="checkbox">처리 완료 시 요청 내용을 실제 회원·업체 정보에 반영했음을 확인합니다.</label>':''}<button type="submit" class="wide">요청 처리 내용 저장</button></form>`:`<p class="pre">${esc(request.note)||'별도 안내 없음'}</p>`}</article>`;
 }
 const html=`<section class="panel wide" id="member-service-requests"><h2>정보 수정 · 조건 상담 요청 ${requests.filter(active).length}건 진행 중</h2><div class="workflow-request-list">${requests.filter(active).map(card).join('')||'<p class="muted">진행 중인 요청이 없습니다.</p>'}</div>${requests.some(r=>!active(r))?`<details class="completed-requests"><summary>완료·보류 요청 ${requests.filter(r=>!active(r)).length}건</summary><div class="workflow-request-list">${requests.filter(r=>!active(r)).map(card).join('')}</div></details>`:''}</section>
 <details class="panel wide member-fold" id="member-support"><summary>팩트너 담당자 · 예상 처리 시간</summary><p class="muted">저장한 담당자와 처리 시간은 이 회원의 마이페이지에 표시됩니다. 실제 응대 가능한 연락처와 운영 기준을 입력해주세요.</p><form id="member-support-form"><div class="workspace-fields">${Object.entries(fields).map(([key,label])=>`<label>${label}<input name="${key}" type="${key==='managerEmail'?'email':key==='managerPhone'?'tel':'text'}" maxlength="${key==='managerEmail'?254:key==='managerPhone'?30:key==='managerName'?60:200}" value="${esc(support[key])}" placeholder="${key.endsWith('Eta')?'예: 영업일 기준 1~2일':''}"></label>`).join('')}</div><button type="submit">담당자·처리 시간 저장</button></form></details>`;
 function bind(){
  document.querySelector('#member-support-form').onsubmit=event=>submit(event,async data=>{
   if(!await reviewBeforeSave({title:'담당자·처리 시간 확인',rows:[['회원',member.name],...Object.entries(fields).map(([key,label])=>[label,data[key]])]}))return;
   await send(`admin/members/${member.id}/support`,{...data,version:support.version,confirmed:true},'PUT');notice('마이페이지에 담당자와 예상 처리 시간을 반영했어요.');await reload();
  });
  document.querySelectorAll('[data-request-edit]').forEach(button=>button.onclick=()=>showMemberSection(button.dataset.requestEdit));
  document.querySelectorAll('[data-member-request]').forEach(form=>form.onsubmit=event=>submit(event,async data=>{
   const request=requests.find(item=>item.id===form.dataset.memberRequest);
   if(['profile','company'].includes(request.kind)&&data.status==='completed'&&data.applied!=='on')throw new Error('실제 회원·업체 정보를 수정·저장한 뒤 반영 확인을 선택해주세요.');
   if(!await reviewBeforeSave({title:'회원 요청 처리 확인',rows:[['회원',member.name],['요청',memberRequestKinds[request.kind]],['상태',states[data.status]],['처리 안내',data.note]]}))return;
   await send(`admin/member-requests/${request.id}`,{status:data.status,note:data.note,version:request.version,confirmed:true},'PATCH');notice('요청 처리 내용을 저장했어요.');await reload();
  }));
 }
 return {html,bind,activeCount:requests.filter(active).length};
}
