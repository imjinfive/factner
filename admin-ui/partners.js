import {reviewBeforeSave} from './review.js';
const statusLabel={active:'거래 연결 중',ended:'매칭 종료'};
const date=value=>new Date(value).toLocaleString('ko-KR');

export async function partnersView(context){
 const {api,send,shell,esc,submit,notice,initialMember,onBack}=context;
 const pickers={brand:{page:1,q:'',selected:initialMember?.role==='brand'?initialMember:null},supplier:{page:1,q:'',selected:initialMember?.role==='supplier'?initialMember:null}};
 let status='',q='',page=1;
 const showError=error=>notice(error.message);
 const load=()=>api(`admin/partners${initialMember?`?memberId=${encodeURIComponent(initialMember.id)}`:''}`);
 const back=()=>list().catch(showError);
 function syncSelection(){
  const brand=pickers.brand.selected,supplier=pickers.supplier.selected;
  const form=document.querySelector('#partner-create');if(!form)return;
  form.querySelector('[type=submit]').disabled=!brand||!supplier||brand.status!=='approved'||supplier.status!=='approved';
  document.querySelector('#partner-selection').textContent=brand&&supplier?`${brand.name} ↔ ${supplier.name}`:'연결할 브랜드와 제작 업체를 각각 선택해주세요.';
 }
 async function picker(role){
  const state=pickers[role],label=role==='brand'?'브랜드':'제작 업체',target=document.querySelector(`#partner-picker-${role}`);
  if(initialMember?.role===role){target.innerHTML=`<h3>${label}</h3><div class="partner-picked"><strong>${esc(initialMember.name)}</strong><small>${esc(initialMember.contact)} · ${esc(initialMember.phone)}</small>${initialMember.status!=='approved'?'<small>가입 승인 후 매칭할 수 있습니다.</small>':''}</div>`;return;}
  const request=state.request=(state.request||0)+1;
  const params=new URLSearchParams({role,status:'approved',q:state.q,page:state.page});
  const data=await api(`admin/members?${params}`);if(!target.isConnected||request!==state.request)return;state.page=data.page;
  target.innerHTML=`<h3>${label}</h3>${state.selected?`<div class="partner-picked"><strong>선택됨 · ${esc(state.selected.name)}</strong><small>${esc(state.selected.contact)} · ${esc(state.selected.phone)}</small>${state.selected.status!=='approved'?'<small>가입 승인이 필요합니다.</small>':''}</div>`:'<p class="muted">승인된 회원 중에서 선택하세요.</p>'}
   <form class="filters" data-picker-search="${role}"><input type="search" name="q" aria-label="${label} 검색" placeholder="업체명·담당자·이메일" value="${esc(state.q)}" maxlength="100"><button type="submit" class="secondary">검색</button></form>
   <div class="partner-candidates">${data.members.map(m=>`<button class="partner-candidate" type="button" data-candidate="${m.id}" aria-pressed="${state.selected?.id===m.id}"><strong>${esc(m.name)}</strong><span>${esc(m.contact)} · ${esc(m.phone)}</span><small>${esc(m.email)}</small></button>`).join('')||'<p class="muted">조건에 맞는 승인 회원이 없습니다.</p>'}</div>
   <div class="pagination"><small>${data.total}명 · ${data.page} / ${Math.max(1,Math.ceil(data.total/30))}</small><button type="button" class="secondary" data-picker-prev ${data.page<=1?'disabled':''}>이전</button><button type="button" class="secondary" data-picker-next ${data.page*30>=data.total?'disabled':''}>다음</button></div>`;
  target.querySelector('form').onsubmit=e=>{e.preventDefault();state.q=new FormData(e.currentTarget).get('q');state.page=1;picker(role).catch(showError);};
  target.querySelector('[data-picker-prev]').onclick=()=>{state.page--;picker(role).catch(showError);};
  target.querySelector('[data-picker-next]').onclick=()=>{state.page++;picker(role).catch(showError);};
  target.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>{if(state.selected?.id!==button.dataset.candidate)document.querySelector('#partner-create input[type=checkbox]').checked=false;state.selected=data.members.find(m=>m.id===button.dataset.candidate);syncSelection();picker(role).catch(showError);});
 }
 async function list(){
  const {partners}=await load();
  const query=q.toLocaleLowerCase(),filtered=partners.filter(p=>(!status||p.status===status)&&`${p.brand_name} ${p.supplier_name} ${p.brand_contact} ${p.supplier_contact}`.toLocaleLowerCase().includes(query));
  page=Math.min(page,Math.max(1,Math.ceil(filtered.length/30)));const rows=filtered.slice((page-1)*30,page*30);
  shell(`<header><div>${onBack?'<button id="partner-return" class="quiet">← 회원 정보</button>':''}<h1>업체 매칭</h1><p class="muted">${initialMember?esc(initialMember.name)+'의 거래 연결':'브랜드와 제작 업체의 거래를 연결합니다.'}</p></div><button id="partner-refresh" class="secondary">새로고침</button></header>
   <details class="panel partner-create-panel" ${partners.length?'':'open'}><summary>새 매칭 만들기</summary><div class="partner-picker-grid"><section id="partner-picker-brand"></section><section id="partner-picker-supplier"></section></div>
    <form id="partner-create"><p id="partner-selection" class="partner-selection"></p><label>관리 메모<input name="note" maxlength="1000" placeholder="선택 사항"></label><p class="muted">새 발주를 전달할 거래 업체를 연결합니다. 기존 발주는 유지되며 계약서 체결은 별도로 진행합니다.</p><label class="check"><input type="checkbox" required>양측의 거래 연결을 확인했습니다.</label><button type="submit" disabled>매칭 등록</button></form>
   </details>
   <section class="panel"><form id="partner-filter" class="filters"><input type="search" name="q" aria-label="매칭 검색" placeholder="브랜드·제작 업체·담당자" maxlength="100" value="${esc(q)}"><select name="status" aria-label="매칭 상태"><option value="">전체 매칭</option>${Object.entries(statusLabel).map(([value,label])=>`<option value="${value}" ${status===value?'selected':''}>${label}</option>`).join('')}</select><button type="submit">검색</button></form>
    <div class="table-scroll"><table><thead><tr><th>브랜드</th><th>제작 업체</th><th>매칭 상태</th><th>연결일</th><th>관리</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.brand_name)}<small>${esc(p.brand_contact)} · ${esc(p.brand_phone)}</small></td><td>${esc(p.supplier_name)}<small>${esc(p.supplier_contact)} · ${esc(p.supplier_phone)}</small></td><td><span class="badge ${p.status==='ended'?'member-state-suspended':''}">${statusLabel[p.status]}</span>${p.status==='active'&&!p.available?'<small>회원 이용 상태 확인 필요</small>':''}</td><td>${new Date(p.created_at).toLocaleDateString('ko-KR')}</td><td><button type="button" class="secondary" data-partner="${p.id}">관리</button></td></tr>`).join('')}</tbody></table>${filtered.length?'':'<div class="empty">등록된 매칭이 없습니다.</div>'}</div>
    <div class="pagination"><span>${filtered.length}건 · ${page} / ${Math.max(1,Math.ceil(filtered.length/30))}</span><button id="partner-prev" class="secondary" ${page<=1?'disabled':''}>이전</button><button id="partner-next" class="secondary" ${page*30>=filtered.length?'disabled':''}>다음</button></div>
   </section>`);
  document.querySelector('#partner-refresh').onclick=back;
  if(onBack)document.querySelector('#partner-return').onclick=()=>onBack().catch(showError);
  document.querySelector('#partner-filter').onsubmit=e=>{e.preventDefault();const values=new FormData(e.currentTarget);status=values.get('status');q=values.get('q');page=1;back();};
  document.querySelector('#partner-prev').onclick=()=>{page--;back();};document.querySelector('#partner-next').onclick=()=>{page++;back();};
  document.querySelectorAll('[data-partner]').forEach(button=>button.onclick=()=>detail(button.dataset.partner).catch(showError));
  document.querySelector('#partner-create').onsubmit=e=>submit(e,async values=>{const brand=pickers.brand.selected,supplier=pickers.supplier.selected;if(!brand||!supplier)throw new Error('브랜드와 제작 업체를 선택해주세요.');if(!await reviewBeforeSave({title:'거래 연결 전 양측 확인',rows:[['브랜드',brand.name],['제작 업체',supplier.name],['운영 메모',values.note]],action:'확인 후 거래 연결',message:'연결 후 브랜드가 이 제작 업체로 발주할 수 있습니다. 양측과 협의한 거래인지 확인해주세요.'}))return;const result=await send('admin/partners',{brandId:brand.id,supplierId:supplier.id,note:values.note,confirmed:true});notice('양측 마이페이지에 거래 업체를 연결했어요.');await detail(result.id);});
  syncSelection();await Promise.all([picker('brand'),picker('supplier')]);
 }
 async function detail(id){
  const {partners}=await load(),p=partners.find(item=>item.id===id);if(!p)throw new Error('매칭을 찾을 수 없습니다.');
  const next=p.status==='active'?'ended':'active';
  shell(`<header><div><button id="partner-back" class="quiet">← 매칭 목록</button><h1>거래 연결</h1><p>${esc(p.brand_name)} ↔ ${esc(p.supplier_name)}</p></div><span class="badge">${statusLabel[p.status]}</span></header>
   <div class="detail-grid"><section class="panel"><h2>브랜드</h2><dl><dt>업체명</dt><dd>${esc(p.brand_name)}</dd><dt>담당자</dt><dd>${esc(p.brand_contact)}</dd><dt>연락처</dt><dd>${esc(p.brand_phone)}</dd></dl></section><section class="panel"><h2>제작 업체</h2><dl><dt>업체명</dt><dd>${esc(p.supplier_name)}</dd><dt>담당자</dt><dd>${esc(p.supplier_contact)}</dd><dt>연락처</dt><dd>${esc(p.supplier_phone)}</dd></dl></section>
    <section class="panel wide"><h2>매칭 상태 변경</h2><p class="muted">${next==='ended'?'매칭 종료 후에는 이 업체로 새 발주를 보낼 수 없습니다. 진행 중인 발주는 그대로 유지됩니다.':'양측 회원이 이용 중인 경우 다시 연결할 수 있습니다.'}</p><form id="partner-status"><label>변경 사유<input name="note" maxlength="1000" required></label><label class="check"><input type="checkbox" required>대상 업체와 변경 내용을 확인했습니다.</label><button type="submit" class="${next==='ended'?'secondary':''}">${next==='ended'?'매칭 종료':'다시 매칭'}</button></form></section>
    <section class="panel wide"><h2>매칭 기록</h2><ul class="timeline">${(p.events||[]).map(event=>`<li><strong>${esc(event.action)}</strong><p class="pre">${esc(event.note)||'별도 메모 없음'}</p><small>${esc(event.actor)} · ${date(event.created_at)}</small></li>`).join('')}</ul></section>
   </div>`);
  document.querySelector('#partner-back').onclick=back;
  document.querySelector('#partner-status').onsubmit=e=>submit(e,async values=>{if(!await reviewBeforeSave({title:'거래 상태 변경 확인',rows:[['브랜드',p.brand_name],['제작 업체',p.supplier_name],['변경 상태',statusLabel[next]],['사유',values.note]]}))return;await send(`admin/partners/${p.id}`,{status:next,version:p.version,note:values.note,confirmed:true},'PATCH');notice('매칭 상태를 변경했어요.');await detail(id);});
 }
 await list();
}
