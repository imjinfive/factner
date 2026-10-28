import {ordersView} from './orders.js';
import {partnersView} from './partners.js';
import {formatPhone,formatInput} from './input-format.js';
import {memberWorkspace,workflowQueue} from './member-workspace.js';
import {reviewBeforeSave} from './review.js';
import {memberSupport} from './member-support.js';
import {captureDrafts,restoreDrafts,showMemberSection} from './member-editor.js';

const states={pending:'심사 대기',approved:'이용 중',rejected:'가입 보류',suspended:'이용 중지'};
const legal={individual:'개인',sole:'개인사업자',corporate:'법인사업자'};
const roles={brand:'브랜드',supplier:'제작 업체'};
const date=value=>new Date(value).toLocaleString('ko-KR');

export async function membersView(context){
 const {api,send,shell,esc,submit,notice,refreshAlerts=()=>{}}=context;
 let edited=false;
 const setDirty=value=>{edited=value;context.setDirty?.(value);};
 const leave=()=>!edited||confirm('저장하지 않은 내용이 있습니다. 이동할까요?');
 let page=1,status='',q='',role='',legalType='',request=0;
 const showError=error=>notice(error.message);
 const badge=m=>`<span class="badge member-state member-state-${m.status}">${states[m.status]}</span>`;
 const options=(items,selected)=>Object.entries(items).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${label}</option>`).join('');

 async function list(){
  const requestId=++request;
  const params=new URLSearchParams({page,status,q,role,legalType});
  const [data,{requests},matching,packaging,service]=await Promise.all([api(`admin/members?${params}`),api('admin/members/recovery'),api('admin/matching/requests'),api('admin/packaging-reviews'),api('admin/member-requests')]);page=data.page;
  if(requestId!==request||context.isActive&&!context.isActive())return;setDirty(false);
  shell(`<header><div><h1>회원·업체 관리</h1><p class="muted">가입 승인부터 업체 정보, 패키징 검토와 거래 연결까지 한곳에서 관리하세요.</p></div><button id="member-refresh" class="secondary">새로고침</button></header>
   <section class="panel recovery-queue ${requests.length?'needs-attention':''}" id="recovery-queue"><div class="member-section-heading"><div><span class="eyebrow">먼저 확인해주세요</span><h2>비밀번호 재설정 요청 <strong class="recovery-count">${requests.length}건</strong></h2></div></div><p class="muted">등록된 연락처로 본인을 확인한 뒤 재설정 코드를 안내해주세요.</p>
    ${requests.length?`<div class="workflow-queue-rows">${requests.map(r=>`<button class="workflow-queue-row recovery-row" type="button" data-member="${esc(r.member_id)}" data-section="member-recovery-panel"><strong>${esc(r.name)} · ${esc(r.contact)}</strong><span>${esc(r.phone)}<small>${esc(r.email)}</small></span><span>${date(r.requested_at)}</span><span class="recovery-action">본인 확인 · 코드 발급 →</span></button>`).join('')}</div>`:'<p class="muted">대기 중인 요청이 없습니다.</p>'}
   </section>
   ${workflowQueue({esc,requests:matching.requests,reviews:packaging.reviews,service:service.requests})}
   <section class="panel">
    <form id="member-filter" class="filters member-filters">
     <input type="search" name="q" aria-label="회원 검색" placeholder="업체명 · 담당자 · 이메일 · 연락처 · 사업자번호" value="${esc(q)}" maxlength="100">
     <select name="role" aria-label="활동 구분"><option value="">모든 활동</option>${options(roles,role)}</select>
     <select name="legalType" aria-label="회원 유형"><option value="">모든 유형</option>${options(legal,legalType)}</select>
     <button type="submit">검색</button><button id="member-reset" class="quiet" type="button">초기화</button>
    </form>
    <div class="member-status-tabs" role="group" aria-label="회원 상태">
     ${Object.entries({'':'전체',...states}).map(([key,label])=>`<button type="button" data-member-status="${key}" aria-pressed="${status===key}">${label}<span>${data.counts[key||'all'].toLocaleString('ko-KR')}</span></button>`).join('')}
    </div>
    <div class="table-scroll"><table><thead><tr><th>업체 / 담당자</th><th>활동</th><th>유형</th><th>연락처</th><th>상태</th><th>가입일</th></tr></thead><tbody>
     ${data.members.map(m=>`<tr><td><button class="link-button" data-member="${m.id}">${esc(m.name)}</button><small>${esc(m.contact)} · ${esc(m.email)}</small></td><td>${roles[m.role]}</td><td>${legal[m.legal_type]}</td><td>${esc(m.phone)}</td><td>${badge(m)}</td><td>${new Date(m.created_at).toLocaleDateString('ko-KR')}</td></tr>`).join('')}
    </tbody></table>${data.total?'':'<div class="empty">조건에 맞는 회원이 없습니다.</div>'}</div>
    <div class="pagination"><span>${data.total}명 · ${page} / ${Math.max(1,Math.ceil(data.total/30))}</span><button id="member-prev" class="secondary" ${page===1?'disabled':''}>이전</button><button id="member-next" class="secondary" ${page*30>=data.total?'disabled':''}>다음</button></div>
   </section>${context.openLegacy?'<details class="legacy-company"><summary>이전 업체 자료</summary><p class="muted">회원 계정에 연결되지 않은 이전 업체 자료는 보관됩니다. 새 업체 조건과 패키징은 해당 회원 상세에서 입력해주세요.</p><button type="button" id="member-legacy" class="secondary">이전 업체 자료 확인</button></details>':''}`);
  const readFilters=()=>{const f=new FormData(document.querySelector('#member-filter'));q=f.get('q');role=f.get('role');legalType=f.get('legalType');page=1;};
  document.querySelector('#member-filter').onsubmit=e=>{e.preventDefault();readFilters();list().catch(showError);};
  document.querySelectorAll('[data-member-status]').forEach(b=>b.onclick=()=>{readFilters();status=b.dataset.memberStatus;list().catch(showError);});
  document.querySelector('#member-reset').onclick=()=>{page=1;status=q=role=legalType='';list().catch(showError);};
  document.querySelector('#member-refresh').onclick=()=>list().catch(showError);
  document.querySelector('#member-prev').onclick=()=>{page--;list().catch(showError);};
  document.querySelector('#member-next').onclick=()=>{page++;list().catch(showError);};
  document.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>detail(b.dataset.member,b.dataset.section).catch(showError));
  const legacy=document.querySelector('#member-legacy');if(legacy)legacy.onclick=context.openLegacy;
  if(context.focusSection){document.getElementById(context.focusSection)?.scrollIntoView({block:'start'});context.focusSection='';}
 }

 async function detail(id,section,drafts=[],compare=false){
  const requestId=++request;
  const [{member:m,files,reviews,orderCounts,profileEvents=[]},{partners}]=await Promise.all([api(`admin/members/${id}`),api(`admin/partners?memberId=${encodeURIComponent(id)}`)]);
  const reviewing=['pending','rejected'].includes(m.status),choices=reviewing?{approved:'가입 승인',rejected:'가입 보류'}:{approved:'이용 재개',suspended:'이용 중지'};
  let pendingDrafts=[];
  const reload=async()=>{await detail(id,undefined,pendingDrafts);refreshAlerts();};
  const guardedSubmit=async(event,action)=>{
   const form=event.currentTarget,editor=document.querySelector('[data-member-editor]'),layout=editor?.closest('.layout');
   pendingDrafts=captureDrafts(editor,form);let conflict=false;
   if(layout){layout.inert=true;layout.setAttribute('aria-busy','true');}
   try{await submit(event,async(data,form)=>{try{await action(data,form);}catch(error){conflict=error.status===409;throw error;}});}
   finally{if(layout){layout.inert=false;layout.removeAttribute('aria-busy');}pendingDrafts=[];}
   if(conflict&&form.isConnected){
    form.querySelector('[data-reload-drafts]')?.remove();
    const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.reloadDrafts='true';button.textContent='입력 유지하고 최신 내용 불러오기';
    button.onclick=async()=>{const keep=captureDrafts(editor);layout.inert=true;try{await detail(id,undefined,keep,true);}catch(error){notice(error.message);}finally{layout.inert=false;}};
    form.querySelector('.error')?.append(document.createElement('br'),button);
   }
  };
  const withMemberSave=async(action,except)=>{
   const editor=document.querySelector('[data-member-editor]'),layout=editor.closest('.layout');pendingDrafts=captureDrafts(editor,except);layout.inert=true;
   try{return await action();}finally{layout.inert=false;pendingDrafts=[];}
  };
  const scoped={...context,submit:guardedSubmit,withMemberSave,setDirty,partners};
  const [workspace,support]=await Promise.all([memberWorkspace(scoped,m,reload),memberSupport(scoped,m,reload)]);
  if(requestId!==request||context.isActive&&!context.isActive())return;setDirty(false);
  shell(`<header><div><button class="quiet" id="member-back">← 회원 목록</button><h1>${esc(m.name)}</h1><p>${roles[m.role]} · ${legal[m.legal_type]}</p></div>${badge(m)}</header>
   <nav class="member-workspace-nav" aria-label="회원 상세 바로가기"><button type="button" data-member-section="member-service-requests">회원 요청</button><button type="button" data-member-section="member-support">담당자·처리 시간</button><button type="button" data-member-section="member-company">업체 상세 입력</button><button type="button" data-member-section="member-selections">파트너 선택 요청</button>${m.role==='brand'?'<button type="button" data-member-section="member-packaging">패키징·사진 관리</button>':''}<button type="button" data-member-section="member-recovery-panel">비밀번호 재설정</button></nav>
   <div class="detail-grid" data-member-editor>
    ${support.html}
    ${workspace.html}
    <details class="panel member-fold" id="member-profile-panel"><summary>회원 정보 · 수정</summary><dl>${[['담당자',m.contact],['이메일',m.email],['연락처',m.phone],['사업자번호',m.business_number||'해당 없음'],['가입일',date(m.created_at)]].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><details class="member-profile-edit"><summary>회원정보 수정</summary><form id="member-profile"><label>업체명 / 브랜드명<input name="name" value="${esc(m.name)}" maxlength="100" required></label><label>담당자<input name="contact" value="${esc(m.contact)}" maxlength="60" required></label><label>연락처<input name="phone" type="tel" value="${esc(m.phone)}" maxlength="30" required></label><button type="submit">회원정보 저장</button></form></details></details>
    <details class="panel member-fold ${reviewing?'pending-member-review':''}" id="member-status-panel" ${reviewing?'open':''}><summary>${reviewing?'가입 심사':'이용 상태 관리'}</summary>
     <form id="member-review"><label>변경할 상태<select name="status" required><option value="">선택해주세요</option>${options(choices,'')}</select></label>
      <label>회원에게 보이는 안내<textarea name="note" rows="3" maxlength="1000" placeholder="보류·중지 시 사유를 남겨주세요."></textarea></label>
      <p class="muted">이용 중지 시 로그인이 차단됩니다. 기존 발주 기록은 유지됩니다.</p>
      <label class="check"><input type="checkbox" required>${reviewing?'가입 정보와 첨부 자료를 확인했습니다.':'상태 변경과 안내 내용을 확인했습니다.'}</label>
      <button type="submit" disabled>${reviewing?'심사 결과 저장':'상태 변경'}</button>
     </form>
    </details>
    <details class="panel wide recovery-queue member-fold" id="member-recovery-panel"><summary>비밀번호 재설정 · 본인 확인 후 코드 발급</summary><p class="muted">등록된 연락처로 직접 전화해 본인을 확인해주세요. 회원은 안내받은 코드로 새 비밀번호를 설정할 수 있습니다.</p>
     <form id="member-recovery"><label class="check"><input name="verified" type="checkbox" required>등록된 연락처 ${esc(m.phone)}로 통화해 본인임을 확인했습니다.</label><button type="submit" disabled>재설정 코드 발급</button></form><div id="member-recovery-result" aria-live="polite"></div>
    </details>
    <section class="panel wide"><div class="member-section-heading"><h2>${m.role==='brand'?'연결된 제작 업체':'연결된 브랜드'}</h2><button id="member-partners" class="secondary">매칭 관리 →</button></div><div class="member-partner-list">${partners.filter(p=>p.status==='active').map(p=>`<div><strong>${esc(m.role==='brand'?p.supplier_name:p.brand_name)}</strong><span class="badge">${p.available?'거래 연결 중':'회원 상태 확인 필요'}</span><small>${esc(m.role==='brand'?p.supplier_contact:p.brand_contact)} · ${esc(m.role==='brand'?p.supplier_phone:p.brand_phone)}</small></div>`).join('')||'<p class="muted">아직 연결된 거래 업체가 없습니다.</p>'}</div></section>
    <section class="panel wide"><div class="member-section-heading"><h2>발주 현황</h2><button id="member-orders" class="secondary">발주 내역 보기 →</button></div>
     <dl class="member-order-stats">${[['전체',orderCounts.total],['진행 중',orderCounts.active],['입고 완료',orderCounts.received],['취소',orderCounts.cancelled]].map(([label,count])=>`<div><dt>${label}</dt><dd>${count.toLocaleString('ko-KR')}<small>건</small></dd></div>`).join('')}</dl>
    </section>
    <details class="panel wide member-fold"><summary>가입 자료 ${files.length}개</summary><div class="review-files">${files.map(f=>`<a href="/api/admin/members/files/${f.id}" target="_blank" rel="noreferrer" class="review-file">${f.mime.startsWith('image/')?`<img src="/api/admin/members/files/${f.id}" alt="${esc(f.name)}">`:'<span class="review-document">PDF</span>'}<strong>${f.kind==='certificate'?'사업자등록증':'현장·패키징 사진'}</strong><span>${esc(f.name)}</span></a>`).join('')||'<p class="muted">첨부 자료가 없습니다.</p>'}</div></details>
    <details class="panel wide member-fold"><summary>상태 변경 기록 ${reviews.length}건</summary><ul class="timeline">${reviews.map(r=>`<li><strong>${r.status==='approved'?'승인 / 이용 재개':states[r.status]}</strong><p class="pre">${esc(r.note)||'별도 안내 없음'}</p><small>${esc(r.actor)} · ${date(r.created_at)}</small></li>`).join('')||'<li>아직 심사하지 않았습니다.</li>'}</ul></details>
    ${profileEvents.length?`<section class="panel wide"><details><summary>회원정보 수정 기록 ${profileEvents.length}건</summary><ul class="timeline">${profileEvents.map(event=>`<li><small>${esc(event.actor)} · ${date(event.created_at)}</small>${Object.entries(event.changes).map(([key,value])=>`<p>${{name:'업체명',contact:'담당자',phone:'연락처',company:'업체 상세',packaging:'패키징'}[key]||esc(key)}: ${esc(typeof value.before==='object'?JSON.stringify(value.before,null,2):value.before)} → ${esc(typeof value.after==='object'?JSON.stringify(value.after,null,2):value.after)}</p>`).join('')}</li>`).join('')}</ul></details></section>`:''}
   </div>`);
  workspace.bind();support.bind();
  const editor=document.querySelector('[data-member-editor]');
  for(const form of editor.querySelectorAll('form'))for(const event of ['input','change'])form.addEventListener(event,()=>{form.dataset.edited='true';setDirty(true);});
  document.querySelectorAll('[data-member-section]').forEach(button=>button.onclick=()=>showMemberSection(button.dataset.memberSection));
  if(section)showMemberSection(section);
  document.querySelector('#member-back').onclick=()=>{if(leave())list().catch(showError);};
  document.querySelector('#member-orders').onclick=()=>{if(leave())ordersView({...context,memberId:id,memberName:m.name,onBack:()=>detail(id)}).catch(showError);};
  document.querySelector('#member-partners').onclick=()=>{if(leave())partnersView({...context,initialMember:m,onBack:()=>detail(id)}).catch(showError);};
  const profile=document.querySelector('#member-profile');profile.elements.phone.oninput=e=>formatInput(e,formatPhone);
  profile.oninput=()=>setDirty(true);
  profile.onsubmit=e=>guardedSubmit(e,async data=>{if(!await reviewBeforeSave({title:'회원정보 수정 확인',rows:[['업체명',data.name],['담당자',data.contact],['연락처',data.phone]]}))return;await send(`admin/members/${id}`,{...data,action:'profile',version:m.version},'PATCH');notice('회원정보를 저장했어요.');await reload();});
  const recovery=document.querySelector('#member-recovery'),recoveryResult=document.querySelector('#member-recovery-result');
  recovery.elements.verified.onchange=()=>{recovery.querySelector('[type=submit]').disabled=!recovery.elements.verified.checked;};
  recovery.onsubmit=e=>guardedSubmit(e,async data=>{
   if(data.verified!=='on')throw new Error('등록된 연락처로 본인을 확인해주세요.');
   if(!await reviewBeforeSave({title:'비밀번호 재설정 대상 확인',rows:[['업체명',m.name],['담당자',m.contact],['등록된 연락처',m.phone],['이메일',m.email]],action:'본인 확인 완료 · 코드 발급'}))return;
   const {code,expiresAt}=await send(`admin/members/${id}/recovery-code`,{verified:true,version:m.version});
   if(!recoveryResult.isConnected)return;
   recovery.hidden=true;
   refreshAlerts();
   recoveryResult.innerHTML=`<label>재설정 코드<input value="${esc(code)}" readonly autocomplete="off"></label><button type="button" class="secondary">코드 복사</button><p>유효기간: ${esc(date(expiresAt))}까지 · 1회 사용</p><p class="muted">코드는 이 화면에서만 확인할 수 있습니다. 본인 확인한 회원에게 전달해주세요.</p>`;
   recoveryResult.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(code);notice('재설정 코드를 복사했어요.');}catch{recoveryResult.querySelector('input').select();notice('자동 복사가 되지 않아 코드를 선택했어요. 직접 복사해주세요.');}};
  });
  const form=document.querySelector('#member-review');
  form.elements.status.onchange=()=>{form.querySelector('[type=submit]').disabled=!form.elements.status.value||form.elements.status.value===m.status;form.elements.note.required=form.elements.status.value!=='approved';};
  form.oninput=()=>setDirty(true);
  form.onsubmit=e=>guardedSubmit(e,async data=>{if(!await reviewBeforeSave({title:'가입·이용 상태 변경 확인',rows:[['회원',m.name],['현재 상태',states[m.status]],['변경 상태',states[data.status]],['회원 안내',data.note]]}))return;await send(`admin/members/${id}`,{...data,version:m.version},'PATCH');notice('회원 상태를 변경했어요.');await reload();});
  const {changes,missing}=restoreDrafts(editor,drafts);form.elements.status.onchange();
  if(drafts.length){
   const message=document.createElement('section');message.className='panel wide draft-restored';message.setAttribute('role','status');
   message.innerHTML=`<strong>${compare?'최신 내용을 불러왔고 수정 가능한 항목의 입력·선택 파일을 유지했습니다.':'다른 항목에서 작성하던 입력·선택 파일을 유지했습니다.'}</strong><p class="muted">아직 저장되지 않은 내용입니다. 최신 내용과 비교해 확인 후 다시 저장해주세요.</p>${compare&&changes.length?`<details open><summary>최신 저장 내용과 작성 중인 내용 비교</summary><div class="table-scroll"><table><thead><tr><th>항목</th><th>최신 저장 내용</th><th>작성 중인 내용</th></tr></thead><tbody>${changes.map(change=>`<tr><td>${esc(change.label)}</td><td class="pre">${esc(change.latest)||'미입력'}</td><td class="pre">${esc(change.draft)||'미입력'}</td></tr>`).join('')}</tbody></table></div></details>`:''}${missing.length?`<p class="error">이미 처리되어 수정할 수 없는 요청 ${missing.length}건은 아래에 작성 내용을 남겼습니다. 필요한 내용을 복사해 새 요청에서 사용하고, 첨부 파일은 다시 선택해주세요.</p>${missing.map(draft=>`<pre class="pre">${esc(draft.fields.filter(field=>field.type!=='submit').map(field=>field.type==='file'?`첨부: ${[...field.node.files].map(file=>file.name).join(', ')}`:`${field.name}: ${field.value}`).join('\n'))}</pre>`).join('')}`:''}`;
   editor.prepend(message);setDirty(true);if(compare)message.scrollIntoView({block:'start'});
  }
 }
 await list();
}
