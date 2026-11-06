import {businessFields,registeredCompany} from './business-fields.js';
import {salePrivacy,saleTerms} from './consumer-sale.js';

export async function policyView(context) {
 const {api,send,shell,esc,submit,notice,setDirty,isActive}=context;
 const doc=await api('admin/policy');
 if(!isActive())return;
 shell(`<header><div><h1>운영 문서</h1><p class="muted">운영 정보를 확정한 뒤 문서를 검토하고 게시해주세요.</p></div><button type="button" class="quiet" data-nav="intake">회원가입 접수 설정</button></header><section class="panel"><p class="hint">${doc.published?'게시된 문서':'검토 중인 초안'} · 문서 버전 ${esc(doc.version)}<br>문서를 저장하면 접수가 닫힙니다. 게시 후 회원가입 접수 설정에서 다시 열어주세요.</p><form id="policy-form">${[['privacy','개인정보 처리방침',5000,14],['terms','이용약관',4000,10],['collection','회원·견적 수집·이용 안내',1500,7],['transfer','거래 상대방 제공 절차',1500,5]].map(([key,label,max,rows])=>`<label>${label}<textarea name="${key}" maxlength="${max}" rows="${rows}" required>${esc(doc[key])}</textarea></label>`).join('')}<label class="check"><input type="checkbox" name="reviewed"> 실제 운영과 일치하도록 문서·위탁·국외 처리 조건을 검토했습니다.</label><label class="check"><input type="checkbox" name="published"> 검토한 문서 게시</label><button type="submit">문서 저장</button></form></section>`);
 const form=document.querySelector('#policy-form');form.addEventListener('input',()=>setDirty(true));
 const loadDraft=document.createElement('button');
 loadDraft.type='button';loadDraft.textContent='직접판매 약관·처리방침 초안 불러오기';
 form.prepend(loadDraft);
 loadDraft.onclick=()=>{
   if(!confirm('편집 중인 이용약관과 개인정보 처리방침을 직접판매 초안으로 교체할까요? 저장 전에는 게시되지 않습니다.'))return;
   form.elements.terms.value=saleTerms;form.elements.privacy.value=salePrivacy;
   form.elements.reviewed.checked=false;form.elements.published.checked=false;setDirty(true);
 };
 form.addEventListener('submit',event=>submit(event,async data=>{await send('admin/policy',{...data,version:doc.version,reviewed:data.reviewed==='on',published:data.published==='on'},'PUT');if(!isActive())return;setDirty(false);notice('운영 문서를 저장했습니다.');await policyView(context);}));
}

export async function memberIntakeView(context) {
 const {api,send,shell,esc,submit,notice,setDirty,isActive}=context;
 const config=await api('admin/settings');
 if(!isActive())return;
 const intake=config.memberIntake;
 const missing=intake.checks.filter(item=>!item.ready);
 shell(`<header><div><h1>회원가입 접수</h1><p class="muted">브랜드와 패키징 제작업체의 가입 신청을 관리합니다. 현재 ${intake.available?'접수 중':'접수 중단'}입니다.</p></div></header>
   <section class="panel narrow"><form id="member-intake-form">
   <label>운영 상호<input name="operator" value="${esc(config.operator||registeredCompany.operator)}" maxlength="100" required></label>
   <label>문의 이메일<input name="contactEmail" type="email" value="${esc(config.contactEmail||registeredCompany.email)}" maxlength="254" required></label>
   <fieldset><legend>사이트 하단 사업자 정보</legend>
   ${businessFields.map(([key,label,max])=>`<label>${label}<input name="${key}" value="${esc(config.business?.[key]??registeredCompany[key])}" maxlength="${max}" type="${key==='verificationUrl'?'url':'text'}"></label>`).join('')}
   <label class="check"><input type="checkbox" name="businessPublished" ${config.businessPublished?'checked':''}>사이트 하단의 기본 사업자 표시를 위 정보로 변경합니다.</label></fieldset>
   ${missing.length?`<p>접수를 열기 전에 확인해주세요.</p><ul class="readiness">${missing.map(item=>`<li>${esc(item.label)}</li>`).join('')}</ul>`:''}
   <label class="check"><input type="checkbox" name="memberAccepting" ${intake.enabled?'checked':''} ${missing.length&&!intake.enabled?'disabled':''}>가입 신청 받기</label>
   <button type="submit">설정 저장</button></form></section>`);
 const form=document.querySelector('#member-intake-form');
 form.oninput=()=>setDirty(true);
 form.onsubmit=event=>submit(event,async data=>{
   const business=Object.fromEntries(businessFields.map(([key])=>[key,data[key]]));
   await send('admin/settings',{operator:data.operator,contactEmail:data.contactEmail,business,businessPublished:data.businessPublished==='on',memberAccepting:data.memberAccepting==='on',policyVersion:config.policyVersion},'PUT');
   if(!isActive())return;
   setDirty(false);notice('회원가입 접수 설정을 저장했습니다.');await memberIntakeView(context);
 });
}
