import {reviewBeforeSave} from './review.js';

const requestStates = {pending:'접수',reviewing:'검토 중',completed:'처리 완료',rejected:'보류'};
const reviewLabels={pending:'심사 대기',approved:'승인·공개',rejected:'반려',withdrawn:'삭제 보관'};
const actions={approve:'승인하고 게시',reject:'공고 반려',withdraw:'공고 삭제'};
const filters = {all:'모든 진행 상태',open:'모집 중',expired:'모집 마감',inactive:'브랜드 승인 필요',selected:'제안 선정',...Object.fromEntries(Object.entries(requestStates).map(([key,label])=>[key,'연결 요청 · '+label]))};
const format = new Intl.NumberFormat('ko-KR');
const time = new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'});
const count = value => format.format(value);
const date = value => value ? time.format(new Date(value)) : '—';
const category = value => value === 'design' ? '디자인' : '패키징 제작';

function pager(total,page,pageSize,unit) {
  const last = Math.max(1,Math.ceil(total/pageSize));
  return `<div class="pagination"><small>총 ${count(total)}${unit} · ${page} / ${last}페이지</small>
    <button type="button" class="secondary" data-page="${page-1}" ${page<=1?'disabled':''}>이전</button>
    <button type="button" class="secondary" data-page="${page+1}" ${page>=last?'disabled':''}>다음</button></div>`;
}
const requestedQuantity = value => value == null ? '수량 협의' : `${count(value)}개`;
const requestedPrice = value => value == null ? '단가 제안 요청' : `${count(value)}원/개`;
const price = (quantity,unitPrice) => `${requestedQuantity(quantity)} · ${requestedPrice(unitPrice)}`;

export async function marketView({api,send,shell,esc,notice,isActive=()=>true,inventory=false,offerQueue=false,initialStatus='all',initialReview,initialPostId,openMatching,testReview,onExitTest}) {
  shell('<section class="admin-market" id="admin-market"></section>');
  const screen = document.getElementById('admin-market');
  if (!screen || !isActive()) return;
  let sequence=0, query='', status=Object.hasOwn(filters,initialStatus)?initialStatus:'all', listPage=1;
  let review=inventory?'all':Object.hasOwn(reviewLabels,initialReview)?initialReview:status==='all'?'pending':'approved';
  let draft={};
  const active = id => screen.isConnected && isActive() && id===sequence;
  const at = selector => screen.querySelector(selector);
  const testPath=testReview?'admin/review-room/posts/'+encodeURIComponent(testReview.id):null;
  const testHeaders=testReview?{'X-Factner-Review':testReview.room}:null;
  const options = () => Object.entries(filters).map(([key,label])=>`<option value="${key}" ${key===status?'selected':''}>${label}</option>`).join('');
  function pages(target,load) {
    target.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>load(Number(button.dataset.page)));
  }
  function loadError(target,error) {
    target.setAttribute('aria-busy','false');
    target.innerHTML=`<p class="error" role="alert">${esc(error.message || '자료를 불러오지 못했습니다. 다시 조회해주세요.')}</p>`;
  }
  function showList() {
    if(offerQueue)return showOfferList();
    screen.innerHTML=`<header><div><h1>${inventory?'전체 공고':'공고 심사'}</h1><p class="muted">${inventory?'브랜드가 제출한 공고를 심사 상태별로 확인합니다.':'브랜드가 제출한 공고를 읽고 게시 여부를 결정하세요.'}</p></div>
      <button type="button" data-refresh class="secondary">새로고침</button></header>
      ${inventory?'':`<div class="am-queues" role="group" aria-label="공고 심사 상태">${Object.entries(reviewLabels).map(([key,label])=>`<button type="button" data-review="${key}" aria-pressed="${key===review}">${label}${key==='pending'?' <span data-queue-count></span>':''}</button>`).join('')}</div>`}
      <section class="panel">${inventory?'<div class="am-list-heading"><h2>회원 공고</h2><span data-result-count aria-live="polite"></span></div>':''}<form class="filters" aria-label="공고 검색">
        <input type="search" name="q" aria-label="공고명 또는 브랜드명" placeholder="공고명 또는 브랜드명" value="${esc(query)}" maxlength="100">
        ${inventory?`<select name="review" aria-label="회원 공고 심사 상태"><option value="all">모든 심사 상태</option>${Object.entries(reviewLabels).map(([key,label])=>`<option value="${key}" ${key===review?'selected':''}>${label}</option>`).join('')}</select>`:''}
        ${review==='approved'?`<select name="status" aria-label="공고 및 연결 상태">${options()}</select>`:''}<button type="submit">검색</button>
      </form><div data-results></div></section>`;
    const form=at('form');
    screen.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>{
      review=button.dataset.review;status='all';query='';listPage=1;showList();
    });
    form.onsubmit=event=>{event.preventDefault();query=form.elements.q.value.trim();status=form.elements.status?.value||'all';listPage=1;loadList();};
    if(form.elements.review)form.elements.review.onchange=()=>{
      review=form.elements.review.value;query=form.elements.q.value.trim();status='all';listPage=1;showList();at('[name="review"]').focus();
    };
    if(form.elements.status)form.elements.status.onchange=()=>form.requestSubmit();
    at('[data-refresh]').onclick=()=>loadList();
    return loadList();
  }
  function showOfferList(){
    screen.innerHTML=`<header><div><h1>입찰 심사</h1><p class="muted">제작업체의 제안과 연락처 포함 여부를 확인합니다. 승인한 입찰만 브랜드에 전달됩니다.</p></div><button type="button" data-refresh class="secondary">새로고침</button></header>
      <div class="am-queues" role="group" aria-label="입찰 심사 상태">${Object.entries(reviewLabels).map(([key,label])=>`<button type="button" data-review="${key}" aria-pressed="${key===review}">${label}</button>`).join('')}</div>
      <section class="panel"><form class="filters" aria-label="입찰 검색"><input type="search" name="q" aria-label="공고명 또는 업체명" placeholder="공고명·브랜드명·제작업체명" maxlength="100" value="${esc(query)}"><button type="submit">검색</button></form><div data-results></div></section>`;
    screen.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>{review=button.dataset.review;listPage=1;showOfferList();});
    at('form').onsubmit=event=>{event.preventDefault();query=event.currentTarget.elements.q.value.trim();listPage=1;loadOfferList();};
    at('[data-refresh]').onclick=loadOfferList;
    return loadOfferList();
  }
  async function loadOfferList(){
    const id=++sequence,target=at('[data-results]');target.setAttribute('aria-busy','true');
    target.innerHTML='<p class="muted" role="status">입찰을 불러오고 있습니다.</p>';
    try{
      const data=await api('admin/market/offers?'+new URLSearchParams({q:query,review,page:String(listPage)}));
      if(!active(id))return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));if(data.page>last){listPage=last;return loadOfferList();}
      target.setAttribute('aria-busy','false');
      target.innerHTML=data.offers.length?`<div class="table-scroll"><table class="am-posts am-offer-queue"><thead><tr><th scope="col">공고 · 브랜드</th><th scope="col">제작업체</th><th scope="col">접수일</th><th scope="col">상태</th></tr></thead>
        <tbody>${data.offers.map(offer=>`<tr><td><button type="button" class="link-button am-title" data-offer="${esc(offer.id)}">${esc(offer.title)}</button><small>${esc(offer.brandName)}</small></td><td>${esc(offer.supplierName)}<small>${esc(offer.alias)}</small></td><td>${date(offer.createdAt)}</td><td><span class="badge am-status" data-state="${esc(offer.reviewStatus)}">${reviewLabels[offer.reviewStatus]}</span></td></tr>`).join('')}</tbody></table></div>${pager(data.total,data.page,data.pageSize,'건')}`:
        `<div class="empty"><strong>${query?'검색 조건에 맞는 입찰이 없습니다.':review==='pending'?'심사할 입찰이 없습니다.':'해당 상태의 입찰이 없습니다.'}</strong></div>`;
      target.querySelectorAll('[data-offer]').forEach(button=>button.onclick=()=>{const offer=data.offers.find(o=>o.id===button.dataset.offer);showDetail(offer.postId,offer.offerPage,offer.id);});
      pages(target,next=>{listPage=next;loadOfferList();});
    }catch(error){if(active(id))loadError(target,error);}
  }
  async function loadList() {
    const id=++sequence,target=at('[data-results]');
    target.setAttribute('aria-busy','true');target.innerHTML='<p class="muted" role="status">공고를 불러오고 있습니다.</p>';
    if(inventory)at('[data-result-count]').textContent='';
    try {
      const params=new URLSearchParams({q:query,status,review,page:String(listPage)});
      const data=await api('admin/market/posts?'+params);
      if (!active(id)) return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>last){listPage=last;return loadList();}
      listPage=data.page;target.setAttribute('aria-busy','false');
      if(inventory){
        at('[data-result-count]').textContent=count(data.total)+'건';
      } else if(Number.isSafeInteger(data.counts?.pendingPosts))at('[data-queue-count]').textContent=count(data.counts.pendingPosts);
      if (!data.posts.length) {
        const filtered=Boolean(query||status!=='all'||(inventory&&review!=='all'));
        const empty={all:'등록된 회원 공고가 없습니다.',pending:'심사할 공고가 없습니다.',approved:'승인된 공고가 없습니다.',rejected:'반려된 공고가 없습니다.',withdrawn:'삭제된 공고가 없습니다.'};
        target.innerHTML=`<div class="empty"><strong>${filtered?'조건에 맞는 공고가 없습니다.':empty[review]}</strong>${filtered?'<p>검색어나 상태를 바꿔 확인하세요.</p>':review==='pending'?'<p>브랜드가 공고를 제출하면 이곳에 표시됩니다.</p>':''}
          ${filtered?'<button type="button" class="secondary" data-reset>검색 조건 지우기</button>':''}</div>`;
        const reset=at('[data-reset]');if(reset)reset.onclick=()=>{query='';status='all';if(inventory)review='all';listPage=1;showList();};
        return;
      }
      target.innerHTML=`<div class="table-scroll"><table class="am-posts ${review==='pending'?'am-queue-table':''}"><thead><tr><th scope="col">공고 · 브랜드</th><th scope="col">요청 수량 · 희망 단가</th><th scope="col">${review==='pending'?'제출일':'받은 제안'}</th><th scope="col">마감일</th><th scope="col">상태</th></tr></thead>
        <tbody>${data.posts.map(post=>`<tr><td><button type="button" class="link-button am-title" data-post="${esc(post.id)}">${esc(post.title)}</button><small>${esc(post.brandName)} · ${category(post.category)}</small></td>
          <td>${requestedQuantity(post.quantity)}<small>${requestedPrice(post.unitPrice)}</small></td><td>${review==='pending'?date(post.createdAt):count(post.offerCount)+'건'}</td><td>${date(post.deadline)}</td>
          <td><span class="badge am-status" data-state="${esc(post.reviewStatus)}">${review==='approved'?(filters[post.status]||'확인 필요'):reviewLabels[post.reviewStatus]}</span>${review==='all'&&post.reviewStatus==='approved'?`<small>${filters[post.status]||'확인 필요'}</small>`:''}${post.connection?`<small>연결 요청 · ${requestStates[post.connection.status]||'확인 필요'}</small>`:''}${!post.eligible?'<small>브랜드 승인 상태 확인</small>':''}</td></tr>`).join('')}
        </tbody></table></div>${pager(data.total,data.page,data.pageSize,'건')}`;
      target.querySelectorAll('[data-post]').forEach(button=>button.onclick=()=>showDetail(button.dataset.post));
      pages(target,next=>{listPage=next;loadList();});
    } catch(error) {if(active(id))loadError(target,error);}
  }
  function tierTable(offer,selected) {
    return `<div class="table-scroll"><table class="am-tiers"><thead><tr><th scope="col">제안 수량</th><th scope="col">개당 단가</th><th scope="col">수량 × 단가</th></tr></thead><tbody>
      ${offer.tiers.map(tier=>`<tr class="${selected?.quantity===tier.quantity?'am-picked':''}"><td>${count(tier.quantity)}개 ${selected?.quantity===tier.quantity?'<span class="badge">선정</span>':''}</td><td>${count(tier.unitPrice)}원</td><td>${count(tier.quantity*tier.unitPrice)}원</td></tr>`).join('')}</tbody></table></div>`;
  }
  function contactDetails(member){
    if(!member)return '';
    return `<details class="am-private"><summary>담당자·연락처 확인 <small>관리자 전용</small></summary><dl>
      <dt>업체명</dt><dd>${esc(member.name)||'미기재'}</dd><dt>담당자</dt><dd>${esc(member.contact)||'미기재'}</dd>
      <dt>전화번호</dt><dd>${esc(member.phone)||'미기재'}</dd><dt>이메일</dt><dd>${esc(member.email)||'미기재'}</dd>
      <dt>사업자번호</dt><dd>${esc(member.businessNumber)||'미기재'}</dd></dl></details>`;
  }
  function agreementDetails(agreements,purpose,resourceId){
    const records=agreements.filter(a=>a.purpose===purpose&&a.resourceId===resourceId);
    return records.map(record=>`<details class="am-private"><summary>제출 당시 서명 기록</summary>
      <dl><dt>문서 버전</dt><dd>${esc(record.version)}</dd><dt>서명자</dt><dd>${esc(record.signature)}</dd><dt>서명 시각</dt><dd>${esc(new Date(record.signedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</dd></dl>
      <p class="pre">${esc(record.document.body)}</p></details>`).join('');
  }
  function offerReviewPanel(offer){
    const pending=offer.reviewStatus==='pending';
    return `<div class="am-offer-review"><p><span class="badge am-status" data-state="${esc(offer.reviewStatus)}">${reviewLabels[offer.reviewStatus]||'확인 필요'}</span>${pending?' <span class="muted">승인 전에는 브랜드에 보이지 않습니다.</span>':''}</p>
      ${offer.reviewReason?`<p class="pre">${esc(offer.reviewReason)}</p>`:''}
      ${pending?`<button type="button" data-offer-action="approve" ${offer.eligible?'':'disabled'}>입찰 승인</button>`:''}
      ${pending||offer.reviewStatus==='approved'?`<details class="am-reason"><summary>${pending?'반려 사유 입력':'입찰 공개 중단'}</summary><form data-offer-reason="${pending?'reject':'withdraw'}">
        <label>${pending?'반려':'공개 중단'} 사유<textarea name="reason" required maxlength="500" rows="2" placeholder="제작업체에 안내할 이유를 적으세요.">${esc(draft['offer-'+offer.id]||'')}</textarea></label>
        <button type="submit" class="secondary am-negative">${pending?'입찰 반려':'공개 중단'}</button></form></details>`:''}
      ${offer.reviewEvents?.length?`<details class="am-events"><summary>입찰 심사 기록 ${count(offer.reviewEvents.length)}건</summary><ul class="timeline">${offer.reviewEvents.map(event=>`<li><strong>${{approve:'승인',reject:'반려',withdraw:'공개 중단'}[event.action]}</strong><small>관리자 · ${date(event.createdAt)}</small>${event.reason?`<p class="pre">${esc(event.reason)}</p>`:''}</li>`).join('')}</ul></details>`:''}
      <div data-offer-error></div></div>`;
  }
  function bindOfferReviews(offers,post,page,id){
    for(const offer of offers){
      const article=at(`[data-offer-detail="${offer.id}"]`);let locked=false;
      const approve=article.querySelector('[data-offer-action]'),form=article.querySelector('[data-offer-reason]');
      if(approve)approve.onclick=()=>submit('approve','');
      if(form){
        form.elements.reason.oninput=()=>{draft['offer-'+offer.id]=form.elements.reason.value;form.elements.reason.setCustomValidity('');};
        form.onsubmit=event=>{event.preventDefault();const reason=form.elements.reason.value.trim();if(!reason){form.elements.reason.setCustomValidity('제작업체에 안내할 사유를 입력해주세요.');form.elements.reason.reportValidity();return;}submit(form.dataset.offerReason,reason);};
      }
      async function submit(action,reason){
        if(locked||!active(id))return;locked=true;
        try{
          const label={approve:'입찰 승인',reject:'입찰 반려',withdraw:'입찰 공개 중단'}[action];
          const rows=[['공고',post.title],['제작업체',offer.supplierName],...offer.tiers.map(tier=>['수량별 단가',price(tier.quantity,tier.unitPrice)]),['제안 내용',offer.note||'미기재']];
          if(reason)rows.push(['제작업체 안내 사유',reason]);
          if(!await reviewBeforeSave({title:label,action:label,rows,message:action==='approve'?'연락처와 업체 식별 정보가 없는지 확인한 입찰을 브랜드에 전달합니다.':'이 입찰을 브랜드에 표시하지 않습니다. 기존 거래 기록은 보관합니다.'})||!active(id))return;
          article.querySelectorAll('button,textarea').forEach(control=>control.disabled=true);
          const payload={action,version:offer.reviewVersion,confirmed:true,reason};
          if(testReview)await api(testPath+'/offers/'+encodeURIComponent(offer.id)+'/review',{method:'POST',headers:testHeaders,body:JSON.stringify(payload)});
          else await send('admin/market/offers/'+encodeURIComponent(offer.id)+'/review',payload);
          delete draft['offer-'+offer.id];
          if(active(id)){notice(label+'을 처리했습니다.');await showDetail(post.id,page,offer.id);}
        }catch(error){
          if(!active(id))return;
          if(error.status===409){notice(error.message);await showDetail(post.id,page,offer.id);}
          else loadError(article.querySelector('[data-offer-error]'),error);
        }finally{locked=false;if(article.isConnected){article.querySelectorAll('button,textarea').forEach(control=>control.disabled=false);if(approve)approve.disabled=!offer.eligible;}}
      }
    }
  }
  function selection(post,chosen) {
    const c=post.connection;
    if(!c)return '';
    const work=['pending','reviewing'].includes(c.status);
    const save=post.reviewStatus==='approved' && work && c.eligible && c.partnerStatus!=='ended' && chosen;
    const linked=c.partnerStatus==='active';
    return `<section class="panel am-selection"><div class="am-heading"><h2>선정된 제안</h2><span class="badge">연결 요청 · ${requestStates[c.status]||'확인 필요'}</span></div>
      <dl><dt>제작업체</dt><dd>${esc(chosen?.supplierName||'업체 정보 확인 필요')}</dd><dt>선정 조건</dt><dd>${price(c.quantity,c.unitPrice)} · 합계 ${count(c.quantity*c.unitPrice)}원</dd>
      <dt>거래 연결</dt><dd>${linked?'연결 중':c.partnerStatus==='ended'?'거래 종료':'미연결'}</dd></dl>
      ${c.linkedPostCount>1?`<p class="hint">이 공고를 포함한 ${count(c.linkedPostCount)}건이 같은 연결 요청을 사용합니다. 요청 처리 결과는 해당 공고에 함께 반영됩니다.</p>`:''}
      ${work && !c.eligible?'<p class="muted">공고·입찰과 양측 회원의 승인 상태를 확인해주세요.</p>':''}
      ${c.partnerStatus==='ended'?'<p class="muted">종료된 거래입니다. 거래를 재개하려면 기존 업체 매칭에서 양측을 확인해주세요.</p>':''}
      <div class="am-actions">${save?`<button type="button" data-connect>${linked?'연결 확인 · 요청 완료':'양측 확인 후 거래 연결'}</button>`:''}
      ${openMatching?'<button type="button" class="secondary" data-matching>회원의 연결 요청 보기</button>':''}</div><div data-action-error></div>
    </section>`;
  }
  function reasonForm(action) {
    const remove=action==='withdraw';
    return `<details class="am-reason" ${draft[action]?'open':''}><summary>${remove?'공고 삭제':'반려 사유 입력'}</summary>
      <form data-reason="${action}"><p class="muted">${remove?'공개 목록에서 공고를 내립니다. 기존 제안과 거래 연결 기록은 보관합니다.':'반려된 공고는 공개되지 않습니다.'} 사유는 작성자에게 표시됩니다.</p>
        <label>${remove?'삭제':'반려'} 사유<textarea name="reason" required maxlength="500" rows="3" placeholder="작성자에게 안내할 이유를 적으세요.">${esc(draft[action]||'')}</textarea></label>
        <button type="submit" class="secondary am-negative">${actions[action]}</button>
      </form></details>`;
  }
  function reviewPanel(post,events) {
    const pending=post.reviewStatus==='pending', removed=post.reviewStatus==='withdrawn';
    return `<section class="panel am-review"><div class="am-heading"><h2>${pending?'게시 여부 결정':'게시 상태'}</h2><span class="badge">${reviewLabels[post.reviewStatus]||'확인 필요'}</span></div>
      ${pending?`<p class="muted">공개할 제목과 제작 조건에 연락처, 업체 식별 정보 또는 부적절한 표현이 없는지 확인하세요.</p>
        ${!post.eligible?'<p class="am-caution">브랜드의 가입 승인 상태를 확인해야 게시할 수 있습니다.</p>':''}
        <div class="am-decision"><button type="button" data-approve ${post.eligible?'':'disabled'}>${actions.approve}</button></div>${reasonForm('reject')}`
        :`<p>${{approved:'공개 승인된 공고입니다.',rejected:'반려되어 공개되지 않는 공고입니다.',withdrawn:'삭제되어 공개되지 않는 공고입니다.'}[post.reviewStatus]||'공고 상태를 다시 확인해주세요.'}</p>
         ${post.reviewReason?`<dl><dt>작성자 안내 사유</dt><dd class="pre">${esc(post.reviewReason)}</dd></dl>`:''}`}
      ${events.length?`<details class="am-events"><summary>심사 기록 ${count(events.length)}건</summary><ul class="timeline">
        ${events.map(event=>`<li><strong>${{approve:'승인',reject:'반려',withdraw:'삭제'}[event.action]||'심사'}</strong>
          <small>${event.actor==='author'?'작성자':'관리자'} · ${esc(date(event.createdAt))}</small>${event.reason?`<p class="pre">${esc(event.reason)}</p>`:''}</li>`).join('')}</ul></details>`:''}
      ${!removed?reasonForm('withdraw'):''}
      ${!pending&&draft.reject?`<p class="hint pre"><strong>저장되지 않은 반려 초안</strong><br>${esc(draft.reject)}</p>`:''}
      ${removed&&draft.withdraw?`<p class="hint pre"><strong>저장되지 않은 삭제 초안</strong><br>${esc(draft.withdraw)}</p>`:''}
      <div data-review-error></div></section>`;
  }
  function bindReview(post,page,id,target) {
    let locked=false;
    const approve=at('[data-approve]');
    if(approve)approve.onclick=()=>submitReview('approve','');
    for(const form of screen.querySelectorAll('[data-reason]')) {
      const action=form.dataset.reason;
      form.elements.reason.oninput=()=>{draft[action]=form.elements.reason.value;form.elements.reason.setCustomValidity('');};
      form.onsubmit=event=>{
        event.preventDefault();
        const reason=form.elements.reason.value.trim();
        if(!reason){form.elements.reason.setCustomValidity('작성자에게 전달할 사유를 입력해주세요.');form.elements.reason.reportValidity();return;}
        submitReview(action,reason);
      };
    }
    async function submitReview(action,reason) {
      if(locked || !active(id))return;
      locked=true;
      try{
        const rows=[['공고 제목',post.title],['브랜드',post.brandName],['수량 · 희망 단가',price(post.quantity,post.unitPrice)],['제안 마감',post.deadline]];
        if(action==='approve')rows.push(['규격',post.size||'미기재'],['공개할 제작 조건',post.description||'미기재']);
        else rows.push(['작성자에게 전달할 사유',reason]);
        const message={approve:'확인한 내용 그대로 공고 게시를 승인합니다.',reject:'반려 사유가 작성자에게 전달됩니다. 공고는 공개되지 않습니다.',withdraw:'고객 화면에서 공고를 내립니다. 기존 제안과 거래 기록은 삭제 보관에서 확인할 수 있습니다.'}[action];
        if(!await reviewBeforeSave({title:actions[action]+' 확인',rows,action:actions[action],message}) || !active(id))return;
        for(const control of screen.querySelectorAll('.am-review button,.am-review textarea'))control.disabled=true;
        const payload={action,version:post.reviewVersion,confirmed:true,reason};
        if(testReview)await api(testPath,{method:'POST',headers:testHeaders,body:JSON.stringify(payload)});
        else await send(`admin/market/posts/${encodeURIComponent(post.id)}/review`,payload);
        if(!active(id))return;
        draft={id:post.id};notice({approve:'공고 게시를 승인했습니다.',reject:'공고를 반려했습니다.',withdraw:'공고를 삭제 보관했습니다.'}[action]);await showDetail(post.id,page);
      }catch(error){
        if(!active(id))return;
        if(error.status===403)loadError(target,error);
        else if(error.status===409){notice(error.message);await showDetail(post.id,page);}
        else loadError(at('[data-review-error]'),error);
      }finally{
        locked=false;
        if(active(id)){for(const control of screen.querySelectorAll('.am-review button,.am-review textarea'))control.disabled=false;if(approve)approve.disabled=!post.eligible;}
      }
    }
  }
  async function showDetail(postId,offerPage=1,focusOfferId=null) {
    const id=++sequence;
    if(draft.id!==postId)draft={id:postId};
    screen.innerHTML=`<header><div><button type="button" class="quiet am-back" data-back>${offerQueue?'← 입찰 심사':inventory?'← 전체 공고':'← 공고 목록'}</button><h1>공고 상세</h1></div><button type="button" class="secondary" data-refresh>새로고침</button></header><div data-detail aria-busy="true"><p class="muted" role="status">공고와 제안을 불러오고 있습니다.</p></div>`;
    at('[data-back]').onclick=testReview?onExitTest:showList;
    if(testReview){
      at('[data-back]').textContent='← 운영 공고 목록';
      at('header').insertAdjacentHTML('afterend','<p class="hint">테스트 공고 심사 · 승인하면 이 테스트 공간에서만 공개됩니다.</p>');
    }
    at('[data-refresh]').onclick=()=>showDetail(postId,offerPage);
    const target=at('[data-detail]');
    try {
      const data=testReview?await api(testPath+'?page='+offerPage,{headers:testHeaders}):
        await api(`admin/market/posts/${encodeURIComponent(postId)}?page=${offerPage}`);
      if(!active(id))return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>last)return showDetail(postId,last);
      const {offers,selectedOffer}=data;
      const post=testReview?{...data.post,eligible:true}:data.post;
      const pending=post.reviewStatus==='pending',showOffers=post.reviewStatus==='approved'||data.total>0||post.connection;
      at('h1').textContent=pending?'공고 심사':post.title;target.setAttribute('aria-busy','false');
      target.innerHTML=`<section class="panel am-preview">${pending?`<h2>${esc(post.title)}</h2>`:'<h2>공고 내용</h2>'}
        <dl><dt>요청 브랜드</dt><dd>${esc(post.brandName)} <small>관리자에게만 표시</small>${!post.eligible?' · 가입 승인 상태 확인':''}</dd><dt>분야</dt><dd>${category(post.category)}</dd>
        <dt>요청 수량</dt><dd>${requestedQuantity(post.quantity)}</dd><dt>희망 단가</dt><dd>${requestedPrice(post.unitPrice)}</dd><dt>규격</dt><dd>${esc(post.size)||'미기재'}</dd>
        <dt>제출일</dt><dd>${date(post.createdAt)}</dd><dt>제안 마감</dt><dd>${date(post.deadline)}</dd></dl>
        <div class="am-description"><h3>제작 조건</h3><p class="pre">${esc(post.description)||'미기재'}</p></div>${contactDetails(post.brand)}${agreementDetails(data.agreements||[],'post',post.id)}</section>
        ${reviewPanel(post,data.reviewEvents||[])}
        ${selection(post,selectedOffer)}
        ${showOffers?`<section class="panel"><div class="am-heading"><h2>받은 제안</h2><strong>${count(data.total)}건</strong></div>
          ${offers.map(offer=>`<article class="am-offer" data-offer-detail="${esc(offer.id)}" tabindex="-1"><div class="am-heading"><h3>${esc(offer.supplierName)} <small>${esc(offer.alias)}</small></h3><small>${date(offer.createdAt)}</small></div>
            ${!offer.eligible?'<p class="muted">공고와 양측 회원의 승인 상태를 확인해주세요.</p>':''}
            ${tierTable(offer,post.connection?.offerId===offer.id?post.connection:null)}
            ${offer.note?`<p class="pre am-note">${esc(offer.note)}</p>`:''}${contactDetails(offer.supplier)}${agreementDetails(data.agreements||[],'offer',offer.id)}${offerReviewPanel(offer)}</article>`).join('')||'<p class="empty">아직 도착한 제안이 없습니다.</p>'}
          ${data.total>data.pageSize?pager(data.total,data.page,data.pageSize,'건'):''}</section>`:''}`;
      bindReview(post,data.page,id,target);
      if(showOffers)bindOfferReviews(offers,post,data.page,id);
      if(focusOfferId)at(`[data-offer-detail="${focusOfferId}"]`)?.focus();
      pages(target,next=>showDetail(postId,next));
      const handoff=at('[data-matching]'), connect=at('[data-connect]');
      if(handoff)handoff.onclick=async()=>{try{await openMatching(post.brandId,post.connection.id);}catch(error){if(active(id))loadError(at('[data-action-error]'),error);}};
      if(connect)connect.onclick=async()=>{
        if(connect.disabled)return;
        connect.disabled=true;
        try {
          const c=post.connection;
          const rows=[['공고',post.title],['브랜드',post.brandName],['제작업체',selectedOffer.supplierName],['선정 조건',price(c.quantity,c.unitPrice)]];
          if(c.linkedPostCount>1)rows.push(['같은 연결 요청',`${c.linkedPostCount}개 공고에 함께 반영`]);
          const ok=await reviewBeforeSave({title:'거래 연결 전 양측 확인',rows,action:'거래 연결 확인',message:'서명한 계약 내용과 거래 조건을 양쪽에 전화로 다시 설명한 후 연결하세요.',confirmation:'양쪽에 계약 내용을 유선으로 설명했습니다.'});
          if(!ok || !active(id))return;
          await send(`admin/market/posts/${encodeURIComponent(post.id)}/connect`,{version:c.version,confirmed:true,explained:true,note:''});
          if(active(id)){notice('거래 연결을 확인했습니다.');await showDetail(post.id,data.page);}
        } catch(error) {
          if(!active(id))return;
          if(error.status===403)loadError(target,error);
          else if(error.status===409){notice(error.message);await showDetail(post.id,data.page);}
          else loadError(at('[data-action-error]'),error);
        } finally {if(connect.isConnected)connect.disabled=false;}
      };
    } catch(error) {if(active(id))loadError(target,error);}
  }
  return initialPostId ? showDetail(initialPostId) : showList();
}
