import {membersView} from './members.js';
import {partnersView} from './partners.js';
import {ordersView} from './orders.js';
import {createOrderAlerts} from './order-alerts.js';
import {createMemberAlerts} from './member-alerts.js';
import {reviewBeforeSave} from './review.js';
import {createSecurity} from './security.js';
import {renderSuppliers} from './suppliers.js';
import {operationsView} from './operations.js';
import {policyView} from './policy.js';
const root = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states = {received:'접수',reviewing:'검토 중',consulting:'상담 중',quoted:'견적 안내',completed:'완료',cancelled:'취소'};
const date = value => new Date(value).toLocaleString('ko-KR');
let user, view = 'quotes', page = 1, search = '', filter = '', currentId, currentVersion;
let refreshTimer, noticeTimer, dirty = false, renderId = 0;
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && user) { user = null; await boot(); }
    const error=new Error(data.error || '연결하지 못했습니다.');error.status=response.status;throw error;
  }
  return data;
}
const send = (path, data, method='POST') => api(path,{method,body:JSON.stringify(data)});
function notice(message) { clearTimeout(noticeTimer);document.querySelector('#notice').textContent=message;noticeTimer=setTimeout(()=>document.querySelector('#notice').textContent='',4500); }
function formError(form, error) { let el=form.querySelector('.error');if(!el){el=document.createElement('p');el.className='error';el.role='alert';form.prepend(el);}el.textContent=error.message; }
async function submit(event, action) {
  event.preventDefault();const form=event.currentTarget;if(form.dataset.submitting)return;
  const buttons=Array.from(form.querySelectorAll('[type=submit]')),disabled=buttons.map(button=>button.disabled);form.dataset.submitting='true';buttons.forEach(button=>button.disabled=true);form.querySelector('.error')?.remove();
  try{await action(Object.fromEntries(new FormData(form)),form);}catch(error){formError(form,error);}finally{delete form.dataset.submitting;buttons.forEach((button,index)=>button.disabled=disabled[index]);}
}
let attentionState={data:null,error:''};
let memberAttentionState={data:null,error:''};
const memberAlerts=createMemberAlerts({api,onUpdate:state=>{memberAttentionState=state;renderMemberAlerts();}});
function renderMemberAlerts(){
 const bar=document.querySelector('#member-attention-bar'),badge=document.querySelector('#member-attention-badge');if(!bar||user?.role!=='owner')return;
 const {data,error}=memberAttentionState,total=data?data.recovery+data.matching+data.packaging+data.service:0;
 if(badge){badge.textContent=data?.recovery?`비밀번호 요청 ${data.recovery}`:total?`검토 요청 ${total}`:error?'연결 확인':'';badge.hidden=!badge.textContent;}
 const counts=data?[[data.recovery,'비밀번호 재설정','recovery-queue'],[data.matching,'파트너 선택','workflow-queue'],[data.packaging,'패키징 검토','workflow-queue'],[data.service,'정보 수정·문의','workflow-queue']].filter(([count])=>count):[];
 const html=(error?`<p role="alert">${esc(error)}</p>`:'')+(counts.length?`<div class="member-alert-heading"><strong>운영팀 확인이 필요합니다</strong><span>미완료 ${total}건</span></div><div class="member-alert-actions">${counts.map(([count,label,section])=>`<button type="button" data-member-alert="${section}" class="${section==='recovery-queue'?'recovery-alert-action':''}"><span>${label}</span><strong>${count}건</strong><span>바로 확인 →</span></button>`).join('')}</div>`:'');
 bar.hidden=!html;if(bar.innerHTML===html)return;bar.innerHTML=html;
 bar.querySelectorAll('[data-member-alert]').forEach(button=>button.onclick=()=>{if(!dirty||confirm('저장하지 않은 내용이 있습니다. 이동할까요?'))navigate('members',{section:button.dataset.memberAlert});});
}
const orderAlerts=createOrderAlerts({api,onUpdate:state=>{attentionState=state;renderOrderAlerts();}});
function renderOrderAlerts(){
 const bar=document.querySelector('#order-attention-bar'),badge=document.querySelector('#order-attention-badge');if(!bar||!user)return;
 const {data,error}=attentionState;
 if(badge){badge.textContent=data?.overdue?'지연 '+data.overdue:data?.unread?'미확인 '+data.unread:error?'연결 확인':'';badge.hidden=!badge.textContent;}
 const html=error?'<p role="alert">'+esc(error)+'</p>':'';
 const counts=data&&(data.unread||data.overdue)?'<div class="order-alert-actions"><strong>확인이 필요한 발주</strong><button data-attention="unread">미확인 '+data.unread+'건</button><button data-attention="overdue" class="'+(data.overdue?'late':'')+'">답변 지연 '+data.overdue+'건</button></div>':'';
 bar.hidden=!html&&!counts;if(bar.innerHTML!==html+counts){bar.innerHTML=html+counts;bar.querySelectorAll('[data-attention]').forEach(b=>b.onclick=()=>{if(!dirty||confirm('저장하지 않은 내용이 있습니다. 이동할까요?'))navigate('orders',{attention:b.dataset.attention});});}
}
function shell(content) {
  root.innerHTML=`<div class="layout"><aside><div class="wordmark">factner.</div><small>관리자</small><nav><button data-nav="quotes" class="${view==='quotes'?'selected':''}">이전 견적 관리</button><button data-nav="orders" class="${view==='orders'?'selected':''}">발주 관리 <span id="order-attention-badge" class="order-nav-badge" hidden></span></button>${user.role==='owner'?`<button data-nav="members" class="${view==='members'?'selected':''}">회원·업체 관리 <span id="member-attention-badge" class="order-nav-badge" hidden></span></button><button data-nav="partners" class="${view==='partners'?'selected':''}">업체 매칭</button><button data-nav="policy" class="${view==='policy'?'selected':''}">운영 문서</button><button data-nav="operations" class="${view==='operations'?'selected':''}">알림 발송</button><button data-nav="users" class="${view==='users'?'selected':''}">관리자 계정</button>`:''}<button data-nav="password" class="${view==='password'?'selected':''}">비밀번호 변경</button></nav><div class="account"><p>${esc(user.display_name)}<br><small>${user.role==='owner'?'대표 관리자':'관리자'}</small></p><div class="account-actions"><button id="logout" class="quiet">로그아웃</button>${user.role==='owner'?`<button data-nav="settings" class="settings-button ${view==='settings'?'selected':''}" aria-label="운영 설정" title="운영 설정" aria-pressed="${view==='settings'}"><svg viewBox="0 0 256 256" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M216,130.16q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.6,107.6,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.29,107.29,0,0,0-26.25-10.86,8,8,0,0,0-7.06,1.48L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.6,107.6,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg></button>`:''}</div></div></aside><main class="content"><section id="member-attention-bar" class="member-attention-bar" aria-label="회원 요청 알림" aria-live="polite" hidden></section><section id="order-attention-bar" class="order-attention-bar" aria-label="발주 알림" aria-live="polite" hidden></section>${content}</main></div>`;
  renderOrderAlerts();renderMemberAlerts();
  root.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>{if(!dirty||confirm('저장하지 않은 내용이 있습니다. 이동할까요?'))navigate(button.dataset.nav);}));
  document.querySelector('#logout').addEventListener('click',async()=>{try{await send('auth/logout',{});user=null;await boot();}catch(error){notice(error.message);}});
}
async function navigate(next,options={}) {
  view=next;dirty=false;currentId=null;clearInterval(refreshTimer);renderId++;
  const generation=renderId,scopedShell=content=>{if(user&&renderId===generation)shell(content);};
  try{
    if(next==='quotes'){await list();refreshTimer=setInterval(()=>{if(!currentId&&!dirty&&document.visibilityState==='visible')list(false).catch(error=>notice(error.message));},20000);}
    if(next==='members')await membersView({api,send,shell:scopedShell,esc,submit,notice,setDirty:value=>dirty=value,isActive:()=>!!user&&renderId===generation,focusSection:options.section,refreshAlerts:()=>memberAlerts.refresh(),openLegacy:()=>navigate('suppliers')});
    if(next==='partners')await partnersView({api,send,shell,esc,submit,notice});
    if(next==='orders')await ordersView({api,send,shell:scopedShell,esc,submit,notice,initialAttention:options.attention||'',setDirty:value=>dirty=value,isActive:()=>!!user&&renderId===generation});
    if(next==='users')await users();
    if(next==='settings')await settings();
    if(next==='password')security.password(shell);
    if(next==='suppliers')await renderSuppliers({api,send,shell,esc,submit,notice,setDirty:value=>dirty=value,isActive:()=>view==='suppliers'});
    if(next==='operations')await operationsView({api,send,shell,esc,submit,notice});
    if(next==='policy')await policyView({api,send,shell,esc,submit,notice,setDirty:value=>dirty=value});
  }catch(error){if(!user||generation!==renderId)return;notice(error.message);if(user)shell(`<h1>연결을 확인해주세요</h1><p role="alert">${esc(error.message)}</p><button id="retry">다시 시도</button>`);document.querySelector('#retry')?.addEventListener('click',()=>navigate(next));}
}
async function list(reset=true) {
  const requestId=renderId;
  const data=await api(`admin/quotes?page=${page}&q=${encodeURIComponent(search)}&status=${filter}`);
  if(requestId!==renderId||currentId||!user)return;
  if(!reset&&document.activeElement?.closest('#search-form'))return;
  const counts=Object.fromEntries(data.counts.map(s=>[s.status,s.count]));
  shell(`<header><div><h1>이전 견적 관리</h1><p class="muted">이전 문의 양식으로 접수한 기록입니다. 현재 회원 거래의 견적은 발주 관리에서 확인해주세요.</p></div><button id="refresh" class="secondary">새로고침</button></header><div class="metrics">${[['전체',data.counts.reduce((s,x)=>s+x.count,0)],['새 요청',counts.received||0],['진행 중',['reviewing','consulting','quoted'].reduce((s,k)=>s+(counts[k]||0),0)],['완료',counts.completed||0]].map(([label,n])=>`<div class="metric"><small>${label}</small><strong>${n}</strong></div>`).join('')}</div><section class="panel"><form id="search-form" class="filters"><input name="q" aria-label="견적 검색" placeholder="브랜드, 담당자, 이메일, 접수 번호" value="${esc(search)}"><select name="status" aria-label="상태 필터"><option value="">모든 상태</option>${Object.entries(states).map(([k,v])=>`<option value="${k}" ${filter===k?'selected':''}>${v}</option>`).join('')}</select><button type="submit">검색</button></form><div class="table-scroll"><table><thead><tr><th>브랜드 / 담당자</th><th>제작 요청</th><th>진행 상태</th><th>담당</th><th>접수일</th></tr></thead><tbody>${data.quotes.map(q=>`<tr data-quote="${q.id}"><td><button class="link-button" data-open="${q.id}">${esc(q.brand)}</button><small>${esc(q.contact_name)} · ${esc(q.email)}</small></td><td>${esc(q.category)}<small>${Number(q.quantity).toLocaleString()}개</small></td><td><span class="badge">${states[q.status]}</span></td><td>${esc(q.assignee)||'미지정'}</td><td>${date(q.created_at)}</td></tr>`).join('')}</tbody></table>${!data.quotes.length?'<div class="empty">조건에 맞는 견적 요청이 없어요.</div>':''}</div><div class="pagination"><small>총 ${data.total}건 · ${page} / ${Math.max(1,Math.ceil(data.total/30))} 페이지</small><button id="prev" class="secondary" ${page<=1?'disabled':''}>이전</button><button id="next" class="secondary" ${page*30>=data.total?'disabled':''}>다음</button></div></section>`);
  document.querySelector('#search-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);search=f.get('q');filter=f.get('status');page=1;list().catch(error=>notice(error.message));};
  root.querySelectorAll('[data-quote]').forEach(row=>row.addEventListener('click',()=>detail(row.dataset.quote)));
  document.querySelector('#refresh').addEventListener('click',()=>list().catch(error=>notice(error.message)));
  document.querySelector('#prev').addEventListener('click',()=>{page--;list().catch(error=>notice(error.message));});
  document.querySelector('#next').addEventListener('click',()=>{page++;list().catch(error=>notice(error.message));});
}
async function detail(id) {
  currentId=id;renderId++;dirty=false;
  try{
    const {quote:q,events}=await api(`admin/quotes/${id}`);currentVersion=q.version;
    if(currentId!==id||!user)return;
    shell(`<header><div><button class="quiet" id="back">← 견적 목록</button><h1>${esc(q.brand)}</h1><p class="muted">${date(q.created_at)} 접수 · ${esc(q.id)}</p></div><span class="badge">${states[q.status]}</span></header><div class="detail-grid"><section class="panel"><h2>제작 조건</h2><dl>${[['패키징',q.category],['수량',`${Number(q.quantity).toLocaleString()}개`],['규격',q.size||'상담 후 결정'],['희망 납기',q.deadline||'협의 가능'],['선택 업체',q.supplier||'운영자 매칭']].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><h2>요청 내용</h2><p class="pre">${esc(q.description)}</p>${q.reference_url?`<p><a href="${esc(q.reference_url)}" target="_blank" rel="noopener noreferrer">고객 참고 자료 열기 ↗</a></p>`:''}<h2>연락처</h2><dl><dt>담당자</dt><dd>${esc(q.contact_name)}</dd><dt>이메일</dt><dd><a href="mailto:${esc(q.email)}">${esc(q.email)}</a></dd><dt>전화</dt><dd>${esc(q.phone)||'미입력'}</dd></dl></section><section class="panel"><h2>상담 관리</h2><form id="quote-form"><label>진행 상태<select name="status">${Object.entries(states).map(([k,v])=>`<option value="${k}" ${q.status===k?'selected':''}>${v}</option>`).join('')}</select></label><label>담당자<input name="assignee" value="${esc(q.assignee)}" maxlength="60" placeholder="담당자 이름"></label><label>고객 안내<textarea name="customerMessage" rows="4" maxlength="2000" placeholder="고객의 나의 활동 화면에 표시됩니다.">${esc(q.customer_message)}</textarea></label><label>내부 메모<textarea name="internalNote" rows="6" maxlength="5000" placeholder="관리자만 볼 수 있습니다.">${esc(q.internal_note)}</textarea></label><button type="submit" class="full">변경사항 저장</button></form><small>고객 안내는 나의 활동에 표시됩니다.</small></section><section class="panel wide"><h2>처리 기록</h2><ul class="timeline">${events.map(e=>`<li>${esc(e.action)}<small>${esc(e.actor)} · ${date(e.created_at)}</small></li>`).join('')}</ul></section></div>`);
    document.querySelector('#back').addEventListener('click',()=>{if(!dirty||confirm('저장하지 않은 내용이 있습니다. 이동할까요?'))navigate('quotes');});
    const form=document.querySelector('#quote-form');form.oninput=()=>dirty=true;
    form.onsubmit=e=>submit(e,async data=>{if(!await reviewBeforeSave({title:'견적 상담 기록 저장 확인',rows:[['브랜드',q.brand],['상태',states[data.status]],['담당자',data.assignee],['고객 안내',data.customerMessage],['내부 메모',data.internalNote]]}))return;await send(`admin/quotes/${id}`,{...data,version:currentVersion},'PATCH');dirty=false;notice('저장했어요.');await detail(id);});
  }catch(error){notice(error.message);await navigate('quotes');}
}
async function users() {
  const data=await api('admin/users');
  shell(`<header><div><h1>관리자 계정</h1></div></header><div class="detail-grid"><section class="panel"><h2>등록된 계정</h2>${data.users.map(u=>`<div class="user"><div><strong>${esc(u.display_name)}</strong><small> · ${esc(u.username)} · ${u.role==='owner'?'대표 관리자':u.active?'사용 중':'사용 중지'}</small></div>${u.role!=='owner'?`<button class="secondary" data-user="${u.id}" data-active="${u.active?'false':'true'}">${u.active?'사용 중지':'다시 사용'}</button>`:''}</div>`).join('')}</section><section class="panel"><h2>관리자 추가</h2><form id="user-form"><label>이름<input name="displayName" maxlength="60" required></label><label>아이디<input name="username" pattern="[a-z0-9][a-z0-9_.-]{2,39}" minlength="3" maxlength="40" required></label><label>초기 비밀번호<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button type="submit" class="full">관리자 만들기</button></form></section></div>`);
  document.querySelector('#user-form').onsubmit=e=>submit(e,async data=>{await send('admin/users',data);notice('관리자 계정을 만들었어요.');await users();});
  root.querySelectorAll('[data-user]').forEach(button=>button.addEventListener('click',async()=>{try{await send(`admin/users/${button.dataset.user}`,{active:button.dataset.active==='true'},'PATCH');await users();}catch(error){notice(error.message);}}));
}
async function settings() {
  const config=await api('admin/settings');
  shell(`<header><div><h1>운영 설정</h1></div></header><section class="panel narrow"><p class="badge">${config.accepting?'정식 접수 중':'테스트 접수 중'}</p><ul class="readiness">${config.readiness.map(item=>`<li>${item.ready?'✓':'○'} ${esc(item.label)} — ${item.ready?'준비됨':'확인 필요'}</li>`).join('')}</ul><form id="settings-form"><label>운영자명 / 상호<input name="operator" value="${esc(config.operator)}" maxlength="100"></label><label>문의 이메일<input name="contactEmail" type="email" value="${esc(config.contactEmail)}" maxlength="254"></label><label class="check"><input name="accepting" type="checkbox" ${config.accepting?'checked':''}> 정식 견적 접수 시작</label><button type="submit">운영 설정 저장</button></form></section>`);
  document.querySelector('#settings-form').oninput=()=>dirty=true;
  document.querySelector('#settings-form').onsubmit=e=>submit(e,async data=>{await send('admin/settings',{...data,accepting:data.accepting==='on'},'PUT');dirty=false;notice('운영 설정을 저장했어요.');await settings();});
}
async function boot() {
  clearInterval(refreshTimer);orderAlerts.stop();memberAlerts.stop();memberAttentionState={data:null,error:''};attentionState={data:null,error:''};user=null;renderId++;
  try{const data=await api('auth/me');await security.accept(data);}catch{try{const state=await api('auth/state');security.auth(state.setupRequired);}catch(error){root.innerHTML=`<main class="auth"><h1>서버 연결을 확인해주세요</h1><p>${esc(error.message)}</p><button id="reconnect">다시 연결</button></main>`;document.querySelector('#reconnect').addEventListener('click',boot);}}
}
const security=createSecurity({root,send,submit,boot,onAuthenticated:async current=>{user=current;orderAlerts.start();if(user.role==='owner')memberAlerts.start();await navigate(user.role==='owner'?'members':'orders');}});
window.addEventListener('focus',()=>{if(user){orderAlerts.refresh();if(user.role==='owner')memberAlerts.refresh();}});
window.addEventListener('visibilitychange',()=>{if(user&&document.visibilityState==='visible'){orderAlerts.refresh();if(user.role==='owner')memberAlerts.refresh();}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
boot();
