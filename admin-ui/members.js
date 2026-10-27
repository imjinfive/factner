import {ordersView} from './orders.js';
import {partnersView} from './partners.js';
import {formatPhone,formatInput} from './input-format.js';

const states={pending:'심사 대기',approved:'이용 중',rejected:'가입 보류',suspended:'이용 중지'};
const legal={individual:'개인',sole:'개인사업자',corporate:'법인사업자'};
const roles={brand:'브랜드',supplier:'제작 업체'};
const date=value=>new Date(value).toLocaleString('ko-KR');

export async function membersView(context){
 const {api,send,shell,esc,submit,notice}=context;
 let page=1,status='',q='',role='',legalType='';
 const showError=error=>notice(error.message);
 const badge=m=>`<span class="badge member-state member-state-${m.status}">${states[m.status]}</span>`;
 const options=(items,selected)=>Object.entries(items).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${label}</option>`).join('');

 async function list(){
  const params=new URLSearchParams({page,status,q,role,legalType});
  const [data,{requests}]=await Promise.all([api(`admin/members?${params}`),api('admin/members/recovery')]);page=data.page;
  shell(`<header><div><h1>회원 관리</h1><p class="muted">브랜드와 제작 업체를 한곳에서 관리하세요.</p></div><button id="member-refresh" class="secondary">새로고침</button></header>
   <section class="panel"><h2>비밀번호 재설정 요청 ${requests.length}건</h2><p class="muted">등록된 연락처로 본인을 확인한 뒤 재설정 코드를 안내해주세요.</p>
    ${requests.length?`<div class="table-scroll"><table><thead><tr><th>업체 / 담당자</th><th>이메일</th><th>등록된 연락처</th><th>요청일</th></tr></thead><tbody>${requests.map(r=>`<tr><td><button class="link-button" data-member="${esc(r.member_id)}">${esc(r.name)}</button><small>${esc(r.contact)}</small></td><td>${esc(r.email)}</td><td>${esc(r.phone)}</td><td>${date(r.requested_at)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">대기 중인 요청이 없습니다.</p>'}
   </section>
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
   </section>`);
  const readFilters=()=>{const f=new FormData(document.querySelector('#member-filter'));q=f.get('q');role=f.get('role');legalType=f.get('legalType');page=1;};
  document.querySelector('#member-filter').onsubmit=e=>{e.preventDefault();readFilters();list().catch(showError);};
  document.querySelectorAll('[data-member-status]').forEach(b=>b.onclick=()=>{readFilters();status=b.dataset.memberStatus;list().catch(showError);});
  document.querySelector('#member-reset').onclick=()=>{page=1;status=q=role=legalType='';list().catch(showError);};
  document.querySelector('#member-refresh').onclick=()=>list().catch(showError);
  document.querySelector('#member-prev').onclick=()=>{page--;list().catch(showError);};
  document.querySelector('#member-next').onclick=()=>{page++;list().catch(showError);};
  document.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>detail(b.dataset.member).catch(showError));
 }

 async function detail(id){
  const [{member:m,files,reviews,orderCounts,profileEvents=[]},{partners}]=await Promise.all([api(`admin/members/${id}`),api(`admin/partners?memberId=${encodeURIComponent(id)}`)]);
  const reviewing=['pending','rejected'].includes(m.status),choices=reviewing?{approved:'가입 승인',rejected:'가입 보류'}:{approved:'이용 재개',suspended:'이용 중지'};
  shell(`<header><div><button class="quiet" id="member-back">← 회원 목록</button><h1>${esc(m.name)}</h1><p>${roles[m.role]} · ${legal[m.legal_type]}</p></div>${badge(m)}</header>
   <div class="detail-grid">
    <section class="panel"><h2>회원 정보</h2><dl>${[['담당자',m.contact],['이메일',m.email],['연락처',m.phone],['사업자번호',m.business_number||'해당 없음'],['가입일',date(m.created_at)]].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><details class="member-profile-edit"><summary>회원정보 수정</summary><form id="member-profile"><label>업체명 / 브랜드명<input name="name" value="${esc(m.name)}" maxlength="100" required></label><label>담당자<input name="contact" value="${esc(m.contact)}" maxlength="60" required></label><label>연락처<input name="phone" type="tel" value="${esc(m.phone)}" maxlength="30" required></label><button type="submit">회원정보 저장</button></form></details></section>
    <section class="panel"><h2>${reviewing?'가입 심사':'이용 상태 관리'}</h2>
     <form id="member-review"><label>변경할 상태<select name="status" required><option value="">선택해주세요</option>${options(choices,'')}</select></label>
      <label>회원에게 보이는 안내<textarea name="note" rows="3" maxlength="1000" placeholder="보류·중지 시 사유를 남겨주세요."></textarea></label>
      <p class="muted">이용 중지 시 로그인이 차단됩니다. 기존 발주 기록은 유지됩니다.</p>
      <label class="check"><input type="checkbox" required>${reviewing?'가입 정보와 첨부 자료를 확인했습니다.':'상태 변경과 안내 내용을 확인했습니다.'}</label>
      <button type="submit" disabled>${reviewing?'심사 결과 저장':'상태 변경'}</button>
     </form>
    </section>
    <section class="panel wide"><h2>비밀번호 재설정</h2><p class="muted">등록된 연락처로 직접 전화해 본인을 확인해주세요. 회원은 안내받은 코드로 새 비밀번호를 설정할 수 있습니다.</p>
     <form id="member-recovery"><label class="check"><input name="verified" type="checkbox" required>등록된 연락처 ${esc(m.phone)}로 통화해 본인임을 확인했습니다.</label><button type="submit" disabled>재설정 코드 발급</button></form><div id="member-recovery-result" aria-live="polite"></div>
    </section>
    <section class="panel wide"><div class="member-section-heading"><h2>${m.role==='brand'?'연결된 제작 업체':'연결된 브랜드'}</h2><button id="member-partners" class="secondary">매칭 관리 →</button></div><div class="member-partner-list">${partners.filter(p=>p.status==='active').map(p=>`<div><strong>${esc(m.role==='brand'?p.supplier_name:p.brand_name)}</strong><span class="badge">${p.available?'거래 연결 중':'회원 상태 확인 필요'}</span><small>${esc(m.role==='brand'?p.supplier_contact:p.brand_contact)} · ${esc(m.role==='brand'?p.supplier_phone:p.brand_phone)}</small></div>`).join('')||'<p class="muted">아직 연결된 거래 업체가 없습니다.</p>'}</div></section>
    <section class="panel wide"><div class="member-section-heading"><h2>발주 현황</h2><button id="member-orders" class="secondary">발주 내역 보기 →</button></div>
     <dl class="member-order-stats">${[['전체',orderCounts.total],['진행 중',orderCounts.active],['입고 완료',orderCounts.received],['취소',orderCounts.cancelled]].map(([label,count])=>`<div><dt>${label}</dt><dd>${count.toLocaleString('ko-KR')}<small>건</small></dd></div>`).join('')}</dl>
    </section>
    <section class="panel wide"><h2>가입 자료</h2><div class="review-files">${files.map(f=>`<a href="/api/admin/members/files/${f.id}" target="_blank" rel="noreferrer" class="review-file">${f.mime.startsWith('image/')?`<img src="/api/admin/members/files/${f.id}" alt="${esc(f.name)}">`:'<span class="review-document">PDF</span>'}<strong>${f.kind==='certificate'?'사업자등록증':'현장·패키징 사진'}</strong><span>${esc(f.name)}</span></a>`).join('')||'<p class="muted">첨부 자료가 없습니다.</p>'}</div></section>
    <section class="panel wide"><h2>상태 변경 기록</h2><ul class="timeline">${reviews.map(r=>`<li><strong>${r.status==='approved'?'승인 / 이용 재개':states[r.status]}</strong><p class="pre">${esc(r.note)||'별도 안내 없음'}</p><small>${esc(r.actor)} · ${date(r.created_at)}</small></li>`).join('')||'<li>아직 심사하지 않았습니다.</li>'}</ul></section>
    ${profileEvents.length?`<section class="panel wide"><details><summary>회원정보 수정 기록 ${profileEvents.length}건</summary><ul class="timeline">${profileEvents.map(event=>`<li><small>${esc(event.actor)} · ${date(event.created_at)}</small>${Object.entries(event.changes).map(([key,value])=>`<p>${{name:'업체명',contact:'담당자',phone:'연락처'}[key]||esc(key)}: ${esc(value.before)} → ${esc(value.after)}</p>`).join('')}</li>`).join('')}</ul></details></section>`:''}
   </div>`);
  document.querySelector('#member-back').onclick=()=>list().catch(showError);
  document.querySelector('#member-orders').onclick=()=>ordersView({...context,memberId:id,memberName:m.name,onBack:()=>detail(id)}).catch(showError);
  document.querySelector('#member-partners').onclick=()=>partnersView({...context,initialMember:m,onBack:()=>detail(id)}).catch(showError);
  const profile=document.querySelector('#member-profile');profile.elements.phone.oninput=e=>formatInput(e,formatPhone);
  profile.onsubmit=e=>submit(e,async data=>{await send(`admin/members/${id}`,{...data,action:'profile',version:m.version},'PATCH');notice('회원정보를 저장했어요.');await detail(id);});
  const recovery=document.querySelector('#member-recovery'),recoveryResult=document.querySelector('#member-recovery-result');
  recovery.elements.verified.onchange=()=>{recovery.querySelector('[type=submit]').disabled=!recovery.elements.verified.checked;};
  recovery.onsubmit=e=>submit(e,async data=>{
   if(data.verified!=='on')throw new Error('등록된 연락처로 본인을 확인해주세요.');
   const {code,expiresAt}=await send(`admin/members/${id}/recovery-code`,{verified:true,version:m.version});
   if(!recoveryResult.isConnected)return;
   recovery.hidden=true;
   recoveryResult.innerHTML=`<label>재설정 코드<input value="${esc(code)}" readonly autocomplete="off"></label><button type="button" class="secondary">코드 복사</button><p>유효기간: ${esc(date(expiresAt))}까지 · 1회 사용</p><p class="muted">코드는 이 화면에서만 확인할 수 있습니다. 본인 확인한 회원에게 전달해주세요.</p>`;
   recoveryResult.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(code);notice('재설정 코드를 복사했어요.');}catch{recoveryResult.querySelector('input').select();notice('자동 복사가 되지 않아 코드를 선택했어요. 직접 복사해주세요.');}};
  });
  const form=document.querySelector('#member-review');
  form.elements.status.onchange=()=>{form.querySelector('[type=submit]').disabled=!form.elements.status.value||form.elements.status.value===m.status;form.elements.note.required=form.elements.status.value!=='approved';};
  form.onsubmit=e=>submit(e,async data=>{await send(`admin/members/${id}`,{...data,version:m.version},'PATCH');notice('회원 상태를 변경했어요.');await detail(id);});
 }
 await list();
}
