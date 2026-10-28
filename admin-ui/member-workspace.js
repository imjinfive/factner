import {reviewBeforeSave} from './review.js';
import {prepareUpload} from './shared/image-upload.js';
import {memberRequestKinds} from './member-support.js';

const categories={box:'박스',packaging:'제품 패키징',supplies:'부자재'};
const requestStates={pending:'접수',reviewing:'검토 중',completed:'처리 완료',rejected:'보류'};
const date=value=>value?new Date(value).toLocaleString('ko-KR'):'—';
const specFields={name:'패키징 이름',size:'규격',material:'소재',printing:'인쇄',finish:'후가공',description:'상세 사양'};
const specRows=spec=>[...Object.entries(specFields).map(([key,label])=>[label,spec[key]]),['첨부 자료',(spec.files||[]).map(f=>f.name||f.id).join('\n')||'없음']];

export async function memberWorkspace(context,member,reload){
 const {api,send,esc,submit,notice,setDirty=()=>{},refreshAlerts=()=>{}}=context;
 const id=member.id,brand=member.role==='brand';
 const [company,matching,packaging,reviews]=await Promise.all([
  api(`admin/members/${id}/company`),api(`admin/matching/requests?memberId=${id}`),
  brand?api(`admin/members/${id}/packagings`):Promise.resolve({packagings:[]}),
  brand?api(`admin/packaging-reviews?memberId=${id}&status=pending`):Promise.resolve({reviews:[]}),
 ]);
 const profile=company.profile||{},requests=matching.requests||[],packages=packaging.packagings||[],pending=reviews.reviews||[];
 function requestCard(r){
  const linked=(context.partners||[]).some(p=>p.status==='active'&&p.brand_id===(r.requester_role==='brand'?r.requester_id:r.target_id)&&p.supplier_id===(r.requester_role==='supplier'?r.requester_id:r.target_id));
  const terminal=['completed','rejected'].includes(r.status);
  const connect=r.status==='rejected'?'':linked&&terminal?'<span class="badge">거래 연결됨</span>':`<button type="button" data-connect-request="${esc(r.id)}">${linked?'연결 확인 · 요청 처리 완료':'양측 확인 후 거래 연결'}</button>`;
  return `<article class="workflow-request"><div class="member-section-heading"><div><strong>${esc(r.requester_name)} → ${esc(r.target_name)}</strong><p>${categories[r.category]||esc(r.category)} · ${date(r.created_at)}</p></div><span class="badge">${requestStates[r.status]||esc(r.status)}</span></div>${terminal?`<p class="pre">${esc(r.note)||'별도 안내 없음'}</p><div class="actions">${connect}</div>`:`<form data-matching-request="${esc(r.id)}"><label>진행 상태<select name="status" required><option value="" ${r.status==='pending'?'selected':''} disabled>처리할 상태 선택</option>${Object.entries(requestStates).filter(([value])=>value!=='pending').map(([value,label])=>`<option value="${value}" ${r.status===value?'selected':''}>${label}</option>`).join('')}</select></label><label>처리 안내<input name="note" maxlength="1000" value="${esc(r.note)}" placeholder="양측에 안내할 검토 결과와 후속 일정"></label><div class="actions"><button type="submit" class="secondary">처리 내용 저장</button>${connect}</div></form>`}</article>`;
 }
 const filesHtml=files=>`<div class="review-files">${(files||[]).map(f=>`<a class="review-file" href="/api/admin/members/files/${esc(f.id)}" target="_blank" rel="noreferrer">${f.mime?.startsWith('image/')?`<img src="/api/admin/members/files/${esc(f.id)}" alt="${esc(f.name)}">`:'<span class="review-document">PDF</span>'}<span>${esc(f.name)}</span></a>`).join('')}</div>`;
 const fields=spec=>Object.entries(specFields).map(([key,label])=>`<label>${label}${key==='description'?`<textarea name="${key}" maxlength="2000" rows="3">${esc(spec[key])}</textarea>`:`<input name="${key}" value="${esc(spec[key])}" maxlength="${['printing','finish'].includes(key)?200:100}" ${['name','size','material'].includes(key)?'required':''}>`}</label>`).join('');
 const attachmentEditor=spec=>`${filesHtml(spec.files)}<div class="packaging-file-controls">${(spec.files||[]).map(f=>`<label class="check"><input type="checkbox" name="keepFiles" value="${esc(f.id)}" checked>${esc(f.name)} 유지</label>`).join('')}</div><label>사진·도안 추가 (최대 6개, 사진 자동 압축 · PDF 1.5MB)<input name="attachments" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple></label><p class="muted">큰 사진은 확인용으로 자동 압축됩니다. 원본 도안은 별도로 보관하고 PDF는 1.5MB 이하로 선택해주세요. 사진과 도안은 ${esc(member.name)} 계정에 귀속됩니다.</p>`;
 const html=`<details class="panel wide member-fold" id="member-company"><summary>업체 상세 · 파트너 찾기 정보</summary><div class="member-section-heading"><div><p class="muted">실제 확인한 조건을 이 회원 계정에 저장합니다. 후보에는 익명 조건만 표시됩니다.</p></div><span class="badge">${profile.listed?'후보 표시 중':'후보 미표시'}</span></div>
  <form id="member-company-form"><div class="workspace-fields"><label class="wide">업체 소개<textarea name="summary" rows="3" maxlength="1000" placeholder="운영팀이 확인한 업체 특성과 패키징 조건">${esc(profile.summary)}</textarea></label><fieldset><legend>${brand?'필요한':'제작 가능한'} 품목</legend>${Object.entries(categories).map(([key,label])=>`<label class="check"><input type="checkbox" name="categories" value="${key}" ${(profile.categories||[]).includes(key)?'checked':''}>${label}</label>`).join('')}</fieldset><div><label>${brand?'월 패키징 예상 수량':'최소 제작 수량'} (개, 미확인 시 0)<input name="quantity" type="number" min="0" max="100000000" step="1" value="${Number(profile.quantity)||0}"></label><label>생산 희망 기간<input name="productionPeriod" maxlength="200" value="${esc(profile.productionPeriod)}" placeholder="예: 발주 후 2~3주, 일정 협의"></label></div><label>업종<input name="industry" maxlength="200" value="${esc(profile.industry)}"></label><label>납품 조건<input name="delivery" maxlength="300" value="${esc(profile.delivery)}"></label><label>소재<input name="material" maxlength="300" value="${esc(profile.material)}"></label><label>인쇄·후가공<input name="finish" maxlength="300" value="${esc(profile.finish)}"></label><label class="wide">추가 제작 조건<textarea name="note" maxlength="500" rows="3">${esc(profile.note)}</textarea></label><label class="wide">운영팀 내부 기록<textarea name="internalNote" maxlength="3000" rows="3" placeholder="현장 방문, 협의 내용과 확인할 사항. 회원에게 공개되지 않습니다.">${esc(profile.internalNote)}</textarea></label></div><label class="check"><input name="listed" type="checkbox" ${profile.listed?'checked':''}>운영팀이 조건을 확인했으며, 파트너 찾기 후보로 표시합니다.</label><p class="muted">가입 승인된 회원만 후보로 표시됩니다.</p><button type="submit">업체 상세 저장</button></form></details>
  <section class="panel wide" id="member-selections"><h2>파트너 선택 요청 ${requests.filter(r=>['pending','reviewing'].includes(r.status)).length}건 진행 중</h2><p class="muted">누가 누구를 선택했는지 확인한 뒤 양측과 소통해 실제 거래를 연결하세요.</p><div class="workflow-request-list">${requests.filter(r=>['pending','reviewing'].includes(r.status)).map(requestCard).join('')||'<p class="muted">진행 중인 파트너 선택 요청이 없습니다.</p>'}${requests.some(r=>['completed','rejected'].includes(r.status))?`<details class="completed-requests"><summary>완료·보류 요청 ${requests.filter(r=>['completed','rejected'].includes(r.status)).length}건</summary><div class="workflow-request-list">${requests.filter(r=>['completed','rejected'].includes(r.status)).map(requestCard).join('')}</div></details>`:''}</div></section>
  ${brand?`<section class="panel wide" id="member-packaging"><div class="member-section-heading"><div><h2>계정 패키징 · 승인 관리</h2><p class="muted">브랜드의 변경 요청은 운영팀 승인 후 적용됩니다. 이미 확정된 발주 사양은 바뀌지 않습니다.</p></div><span class="badge">검토 대기 ${pending.length}건</span></div>
  ${pending.map(r=>`<details class="packaging-editor pending-review" open><summary>검토 필요 · ${esc(r.spec.name)} <small>${r.approval_status==='approved'?'수정 요청':'추가 요청'} · ${date(r.created_at)}</small></summary>${r.approval_status==='approved'?`<details class="packaging-current"><summary>기존 승인 사양과 비교하기</summary><dl>${specRows(r.current_spec).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(value)||'미입력'}</dd>`).join('')}</dl></details>`:''}<form data-packaging-review="${esc(r.id)}"><div class="workspace-fields">${fields(r.spec)}</div><h3>검토 요청 자료</h3>${attachmentEditor(r.spec)}<label>검토 안내<textarea name="reviewNote" maxlength="1000" rows="2" placeholder="반려 시 수정할 내용을 반드시 적어주세요."></textarea></label><div class="actions"><button type="submit" name="decision" value="reject" class="secondary">수정 요청으로 반려</button><button type="submit" name="decision" value="approve">검토한 내용으로 승인</button></div></form></details>`).join('')}
  ${packages.map(p=>`<details class="packaging-editor"><summary>${esc(p.spec.name)} <span class="badge">${p.approval_status==='pending'?(p.pendingReview?'신규 검토 대기':'보완 필요'):'승인된 사양'}</span>${p.pendingReview?`<small>${p.approval_status==='approved'?'변경 요청 검토 중 · 기존 승인 사양 유지':'운영팀 승인 후 발주에 사용할 수 있습니다.'}</small>`:''}</summary>${p.pendingReview?`<dl>${specRows(p.spec).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(value)||'미입력'}</dd>`).join('')}</dl>${filesHtml(p.spec.files)}<p class="muted">위 검토 대기 요청에서 승인하거나 반려해주세요.</p>`:`<form data-packaging-edit="${esc(p.id)}"><div class="workspace-fields">${fields(p.spec)}</div>${attachmentEditor(p.spec)}<button type="submit">확인 후 승인 사양 수정</button></form>`}</details>`).join('')||'<p class="muted">등록된 패키징이 없습니다. 브랜드와 확인한 사양과 사진을 등록해주세요.</p>'}
  <details class="packaging-editor"><summary>＋ 운영팀에서 패키징 등록</summary><form id="member-packaging-new"><div class="workspace-fields">${fields({})}</div>${attachmentEditor({files:[]})}<button type="submit">확인 후 패키징 등록</button></form></details></section>`:''}`;
 async function readSpec(form,values,original={files:[]}){
  const kept=new Set(new FormData(form).getAll('keepFiles')),files=(original.files||[]).filter(f=>kept.has(f.id)),selected=Array.from(form.elements.attachments?.files||[]);
  if(files.length+selected.length>6)throw new Error('첨부 자료는 최대 6개입니다.');
  const prepared=[];for(const file of selected)prepared.push(await prepareUpload(file));
  const spec=Object.fromEntries(Object.keys(specFields).map(key=>[key,values[key]||'']));spec.files=files;
  return {spec,selected:prepared};
 }
 async function saveFiles(spec,selected){
  for(const file of selected){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다. 다시 선택해주세요.'));reader.readAsDataURL(file);});const result=await send(`admin/members/${id}/files`,{name:file.name,mime:file.type,kind:file.type==='application/pdf'?'design':'sample',data});spec.files.push(result.file);}
 }
 const refresh=async()=>{setDirty(false);refreshAlerts();await reload();};
 function bind(){
  for(const form of document.querySelectorAll('#member-company-form, [data-matching-request], [data-packaging-review], [data-packaging-edit], #member-packaging-new'))form.addEventListener('input',()=>setDirty(true));
  document.querySelector('#member-company-form').onsubmit=e=>submit(e,async(data,form)=>{
   const payload={...data,categories:new FormData(form).getAll('categories'),quantity:Number(data.quantity),listed:data.listed==='on',version:profile.version||0,confirmed:true};
   if(payload.listed&&(!payload.summary.trim()||!payload.categories.length))throw new Error('후보로 표시하려면 업체 소개와 품목을 입력해주세요.');
   const rows=[['회원',member.name],['업체 소개',payload.summary],['품목',payload.categories.map(c=>categories[c]).join(', ')],['수량',`${payload.quantity.toLocaleString()}개`],['생산 희망 기간',payload.productionPeriod],['업종',payload.industry],['납품 조건',payload.delivery],['소재',payload.material],['인쇄·후가공',payload.finish],['추가 조건',payload.note],['내부 기록',payload.internalNote],['후보 표시',payload.listed?'표시':'미표시']];
   if(!await reviewBeforeSave({title:'업체 상세 저장 전 확인',rows}))return;
   await send(`admin/members/${id}/company`,payload,'PUT');notice('회원 계정에 업체 상세를 저장했어요.');await refresh();
  });
  document.querySelectorAll('[data-matching-request]').forEach(form=>form.onsubmit=e=>submit(e,async values=>{
   const r=requests.find(r=>r.id===form.dataset.matchingRequest);if(values.status==='pending')throw new Error('검토 중, 처리 완료 또는 보류를 선택해주세요.');
   if(!await reviewBeforeSave({title:'선택 요청 처리 확인',rows:[['선택한 회원',r.requester_name],['선택된 회원',r.target_name],['상태',requestStates[values.status]],['안내',values.note]],message:'처리 완료만으로 거래가 연결되지는 않습니다. 거래 연결 버튼에서 양측을 확인해주세요.'}))return;
   await send(`admin/matching/requests/${r.id}`,{...values,version:r.version,confirmed:true},'PATCH');notice('선택 요청 처리 내용을 저장했어요.');await refresh();
  }));
  document.querySelectorAll('[data-connect-request]').forEach(button=>button.onclick=async()=>{
   const r=requests.find(r=>r.id===button.dataset.connectRequest),form=button.closest('form'),note=form?.elements.note.value||r.note||'';
   if(!await reviewBeforeSave({title:'실제 거래 연결을 확인해주세요',rows:[['브랜드',r.requester_role==='brand'?r.requester_name:r.target_name],['제작 업체',r.requester_role==='supplier'?r.requester_name:r.target_name],['선택 품목',categories[r.category]||r.category],['운영 메모',note]],action:'양측 확인 완료 · 거래 연결',message:'양측과 거래 조건을 확인한 뒤 연결하세요. 연결 후 브랜드가 이 제작 업체로 발주할 수 있습니다.'}))return;
   try{await context.withMemberSave(async()=>{await send('admin/partners',{brandId:r.requester_role==='brand'?r.requester_id:r.target_id,supplierId:r.requester_role==='supplier'?r.requester_id:r.target_id,note,confirmed:true});notice('거래를 연결하고 양방향 선택 요청을 함께 완료했어요.');await refresh();},form);}catch(error){notice(error.message);}
  });
  async function savePackaging(event,original,review){
   const decision=event.submitter?.value||'approve';
   return submit(event,async(values,form)=>{
    if(review&&decision==='reject'){
     if(!values.reviewNote?.trim())throw new Error('수정할 내용을 검토 안내에 적어주세요.');
     if(!await reviewBeforeSave({title:'패키징 반려 내용 확인',rows:[['회원',member.name],...specRows(review.spec),['검토 안내',values.reviewNote]],action:'수정 요청으로 반려'}))return;
     await send(`admin/packaging-reviews/${review.id}`,{action:'reject',version:review.version,note:values.reviewNote,confirmed:true},'PATCH');
    }else{
     const {spec,selected}=await readSpec(form,values,original?.spec||review?.spec);
     const preview={...spec,files:[...spec.files,...selected.map(file=>({name:file.name}))]};
     if(!await reviewBeforeSave({title:review?'패키징 승인 전 사양 확인':'패키징 저장 전 사양 확인',rows:[['귀속 계정',member.name],...specRows(preview),...(review?[['검토 안내',values.reviewNote]]:[])],action:review?'검토 완료 · 승인':'확인 후 저장'}))return;
     form.inert=true;
     try{await saveFiles(spec,selected);if(review)await send(`admin/packaging-reviews/${review.id}`,{action:'approve',version:review.version,note:values.reviewNote,spec,confirmed:true},'PATCH');else await send(`admin/members/${id}/packagings${original?'/'+original.id:''}`,{spec,version:original?.version,confirmed:true},original?'PATCH':'POST');}finally{form.inert=false;}
    }
    notice(review?'패키징 검토 결과를 저장했어요.':'계정의 승인된 패키징을 저장했어요.');await refresh();
   });
  }
  document.querySelectorAll('[data-packaging-review]').forEach(form=>form.onsubmit=e=>savePackaging(e,null,pending.find(r=>r.id===form.dataset.packagingReview)));
  document.querySelectorAll('[data-packaging-edit]').forEach(form=>form.onsubmit=e=>savePackaging(e,packages.find(p=>p.id===form.dataset.packagingEdit)));
  const create=document.querySelector('#member-packaging-new');if(create)create.onsubmit=e=>savePackaging(e);
 }
 return {html,bind};
}

export function workflowQueue({esc,requests=[],reviews=[],service=[]}){
 const rows=[
  ...requests.map(r=>({member:r.requester_id,section:'member-selections',kind:'파트너 선택',title:`${r.requester_name} → ${r.target_name}`,status:r.status,created:r.created_at})),
  ...reviews.map(r=>({member:r.brand_id,section:'member-packaging',kind:'패키징 검토',title:`${r.brand_name} · ${r.spec.name}`,status:r.status==='approved'?'completed':r.status,created:r.created_at})),
  ...service.map(r=>({member:r.member_id,section:'member-service-requests',kind:memberRequestKinds[r.kind]||r.kind,title:r.member_name,status:r.status,created:r.created_at})),
 ];
 const group=status=>rows.filter(row=>row.status===status);
 const render=items=>items.map(row=>`<button type="button" class="workflow-queue-row" data-member="${esc(row.member)}" data-section="${row.section}"><span class="badge">${esc(row.kind)}</span><strong>${esc(row.title)}</strong><span>${date(row.created)}</span><span>확인하기 →</span></button>`).join('')||'<p class="muted">해당 요청이 없습니다.</p>';
 return `<section class="panel workflow-queue" id="workflow-queue"><h2>처리할 회원 요청</h2><p class="muted">접수와 검토 중인 업무는 완료할 때까지 계속 표시됩니다. 회원 이름을 눌러 처리해주세요.</p>${['pending','reviewing'].map(status=>`<section class="workflow-status-group"><h3>${requestStates[status]} <strong>${group(status).length}건</strong></h3><div class="workflow-queue-rows">${render(group(status))}</div></section>`).join('')}<details class="completed-requests"><summary>완료·보류 ${group('completed').length+group('rejected').length}건</summary>${['completed','rejected'].map(status=>`<h3>${requestStates[status]} ${group(status).length}건</h3><div class="workflow-queue-rows">${render(group(status))}</div>`).join('')}</details></section>`;
}
