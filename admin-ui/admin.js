import {membersView} from './members.js';
import {partnersView} from './partners.js';
import {ordersView} from './orders.js';
import {createSecurity} from './security.js';
import {policyView,memberIntakeView} from './policy.js';
import {marketView} from './market.js';

const root=document.querySelector('#app');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settingsLabels={password:'비밀번호 변경',users:'관리자 계정',policy:'운영 문서',intake:'회원가입 접수'};
function sharedReview(){
  const match=location.hash.match(/^#review-room\/([a-f0-9]{64})\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/);
  if(match)history.replaceState({reviewLink:{room:match[1],id:match[2]}},'',location.pathname);
  const ref=history.state?.reviewLink;
  return ref && /^[a-f0-9]{64}$/.test(ref.room) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(ref.id)?ref:null;
}
let testPost=sharedReview();
const gearIcon='<svg viewBox="0 0 256 256" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M216,130.16q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.6,107.6,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.29,107.29,0,0,0-26.25-10.86,8,8,0,0,0-7.06,1.48L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.6,107.6,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg>';
let user,view,noticeTimer,dirty=false,renderId=0;

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

function shell(content) {
  const owner=user.role==='owner';
  const items=owner?[['market','공고 심사'],['members','회원·업체'],['partners','거래 연결'],['orders','발주']]:[['orders','발주']];
  const inSettings=view==='settings'||Object.hasOwn(settingsLabels,view);
  root.innerHTML=`<div class="layout"><aside><div class="wordmark">factner.</div><small>관리자</small>
    <nav aria-label="관리자 업무">${items.map(([key,label])=>`<button type="button" data-nav="${key}" ${view===key?'class="selected" aria-current="page"':''}>${label}</button>`).join('')}</nav>
    <div class="account"><p>${esc(user.display_name)}<br><small>${owner?'대표 관리자':'관리자'}</small></p>
      <div class="account-actions"><button type="button" id="logout" class="quiet">로그아웃</button>
        <button type="button" class="settings-button ${inSettings?'selected':''}" data-nav="settings" aria-label="설정" title="설정" aria-pressed="${inSettings}">${gearIcon}</button></div>
    </div></aside><main class="content">
      ${view==='intake'?'<button type="button" class="quiet settings-back" data-nav="policy">← 운영 문서</button>':Object.hasOwn(settingsLabels,view)?'<button type="button" class="quiet settings-back" data-nav="settings">← 설정</button>':''}
      ${content}</main></div>`;
  root.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>{
    if(!dirty||confirm('저장하지 않은 내용이 있습니다. 이동할까요?'))navigate(button.dataset.nav);
  });
  root.querySelector('#logout').onclick=async()=>{
    if(dirty&&!confirm('저장하지 않은 내용이 있습니다. 로그아웃할까요?'))return;
    try{await send('auth/logout',{});testPost=null;history.replaceState(null,'',location.pathname);await boot();}catch(error){notice(error.message);}
  };
}

function settings(render){
  const options=user.role==='owner'?['users','policy','password']:['password'];
  const help={users:'관리자 추가와 사용 중지',policy:'고객에게 게시하는 약관과 개인정보처리방침',password:'내 로그인 비밀번호 변경'};
  render(`<header><h1>설정</h1></header><section class="panel settings-list" aria-label="관리자 설정">
    ${options.map(key=>`<button type="button" data-nav="${key}"><strong>${settingsLabels[key]}</strong><span>${help[key]}</span></button>`).join('')}
    </section>`);
}

async function navigate(next,options={}) {
  if(testPost && next!=='sharedReview'){testPost=null;history.replaceState(null,'',location.pathname);}
  view=next;dirty=false;
  const generation=++renderId;
  const active=()=>Boolean(user)&&generation===renderId;
  const render=content=>{if(active())shell(content);};
  const context={api,send,esc,submit,notice,shell:render,isActive:active,setDirty:value=>{if(active())dirty=value;}};
  try{
    switch(next){
      case 'sharedReview':
        if(user.role==='owner' && testPost)await marketView({...context,initialPostId:testPost.id,testReview:testPost,onExitTest:()=>navigate('market')});
        break;
      case 'market':
        await marketView({...context,initialStatus:options.status,initialReview:options.review,initialPostId:options.postId,
          openMatching:(memberId,requestId)=>navigate('members',{memberId,requestId,section:'member-selections'})});
        break;
      case 'members':
        await membersView({...context,focusSection:options.section,initialStatus:options.status,initialMemberId:options.memberId,initialRequestId:options.requestId});
        break;
      case 'partners':await partnersView(context);break;
      case 'orders':await ordersView(context);break;
      case 'settings':settings(render);break;
      case 'password':security.password(render);break;
      case 'users':if(user.role==='owner')await users(render,active);break;
      case 'policy':if(user.role==='owner')await policyView(context);break;
      case 'intake':if(user.role==='owner')await memberIntakeView(context);break;
    }
  }catch(error){
    if(!active())return;
    render(`<h1>화면을 불러오지 못했습니다</h1><p role="alert">${esc(error.message)}</p><button type="button" id="retry">다시 시도</button>`);
    root.querySelector('#retry').onclick=()=>navigate(next,options);
  }
}

async function users(render,isActive) {
  const data=await api('admin/users');
  if(!isActive())return;
  render(`<header><div><h1>관리자 계정</h1></div></header><div class="detail-grid"><section class="panel"><h2>등록된 계정</h2>${data.users.map(u=>`<div class="user"><div><strong>${esc(u.display_name)}</strong><small> · ${esc(u.username)} · ${u.role==='owner'?'대표 관리자':u.active?'사용 중':'사용 중지'}</small></div>${u.role!=='owner'?`<button class="secondary" data-user="${u.id}" data-active="${u.active?'false':'true'}">${u.active?'사용 중지':'다시 사용'}</button>`:''}</div>`).join('')}</section><section class="panel"><h2>관리자 추가</h2><form id="user-form"><label>이름<input name="displayName" maxlength="60" required></label><label>아이디<input name="username" pattern="[a-z0-9][a-z0-9_.-]{2,39}" minlength="3" maxlength="40" required></label><label>초기 비밀번호<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button type="submit" class="full">관리자 만들기</button></form></section></div>`);
  document.querySelector('#user-form').onsubmit=e=>submit(e,async data=>{await send('admin/users',data);notice('관리자 계정을 만들었어요.');if(isActive())await users(render,isActive);});
  root.querySelectorAll('[data-user]').forEach(button=>button.addEventListener('click',async()=>{try{await send(`admin/users/${button.dataset.user}`,{active:button.dataset.active==='true'},'PATCH');if(isActive())await users(render,isActive);}catch(error){notice(error.message);}}));
}

async function boot(){
  user=null;dirty=false;renderId++;
  try{await security.accept(await api('auth/me'));}
  catch{try{security.auth((await api('auth/state')).setupRequired);}catch(error){
    root.innerHTML=`<main class="auth"><h1>서버 연결을 확인해주세요</h1><p>${esc(error.message)}</p><button id="reconnect">다시 연결</button></main>`;
    root.querySelector('#reconnect').onclick=boot;
  }}
}
const security=createSecurity({root,send,submit,boot,onAuthenticated:async current=>{
  user=current;await navigate(user.role==='owner'?(testPost?'sharedReview':'market'):'orders');
}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
boot();
