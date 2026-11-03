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
const price = (quantity,unitPrice) => `${count(quantity)}개 × ${count(unitPrice)}원`;

export async function marketView({api,send,shell,esc,notice,isActive=()=>true,inventory=false,initialStatus='all',initialReview,initialPostId,openMatching,testReview,onExitTest}) {
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
    screen.innerHTML=`<header><div><h1>${inventory?'전체 공고':'공고 심사'}</h1><p class="muted">${inventory?'브랜드가 제출한 공고와 비회원에게 보이는 예시 공고를 관리합니다.':'브랜드가 제출한 공고를 읽고 게시 여부를 결정하세요.'}</p></div>
      <button type="button" data-refresh class="secondary">새로고침</button></header>
      ${inventory?'':`<div class="am-queues" role="group" aria-label="공고 심사 상태">${Object.entries(reviewLabels).map(([key,label])=>`<button type="button" data-review="${key}" aria-pressed="${key===review}">${label}${key==='pending'?' <span data-queue-count></span>':''}</button>`).join('')}</div>`}
      <section class="panel">${inventory?'<div class="am-list-heading"><h2>회원 공고</h2><span data-result-count aria-live="polite"></span></div>':''}<form class="filters" aria-label="공고 검색">
        <input type="search" name="q" aria-label="공고명 또는 브랜드명" placeholder="공고명 또는 브랜드명" value="${esc(query)}" maxlength="100">
        ${inventory?`<select name="review" aria-label="회원 공고 심사 상태"><option value="all">모든 심사 상태</option>${Object.entries(reviewLabels).map(([key,label])=>`<option value="${key}" ${key===review?'selected':''}>${label}</option>`).join('')}</select>`:''}
        ${review==='approved'?`<select name="status" aria-label="공고 및 연결 상태">${options()}</select>`:''}<button type="submit">검색</button>
      </form><div data-results></div></section>
      ${inventory?`<section class="panel am-examples"><div class="am-list-heading"><h2>사이트 예시 공고</h2></div><p class="muted">공개할 회원 공고가 없을 때 비회원에게 표시되는 예시입니다.</p><div data-examples></div></section>`:''}`;
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
  async function loadList() {
    const id=++sequence,target=at('[data-results]');
    target.setAttribute('aria-busy','true');target.innerHTML='<p class="muted" role="status">공고를 불러오고 있습니다.</p>';
    if(inventory){at('[data-examples]').replaceChildren();at('[data-result-count]').textContent='';}
    try {
      const params=new URLSearchParams({q:query,status,review,page:String(listPage)});
      if(inventory)params.set('includeExamples','1');
      const data=await api('admin/market/posts?'+params);
      if (!active(id)) return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>last){listPage=last;return loadList();}
      listPage=data.page;target.setAttribute('aria-busy','false');
      if(inventory){
        at('[data-result-count]').textContent=count(data.total)+'건';
        showExamples(data.examples,id);
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
          <td>${count(post.quantity)}개<small>${count(post.unitPrice)}원/개</small></td><td>${review==='pending'?date(post.createdAt):count(post.offerCount)+'건'}</td><td>${date(post.deadline)}</td>
          <td><span class="badge am-status" data-state="${esc(post.reviewStatus)}">${review==='approved'?(filters[post.status]||'확인 필요'):reviewLabels[post.reviewStatus]}</span>${review==='all'&&post.reviewStatus==='approved'?`<small>${filters[post.status]||'확인 필요'}</small>`:''}${post.connection?`<small>연결 요청 · ${requestStates[post.connection.status]||'확인 필요'}</small>`:''}${!post.eligible?'<small>브랜드 승인 상태 확인</small>':''}</td></tr>`).join('')}
        </tbody></table></div>${pager(data.total,data.page,data.pageSize,'건')}`;
      target.querySelectorAll('[data-post]').forEach(button=>button.onclick=()=>showDetail(button.dataset.post));
      pages(target,next=>{listPage=next;loadList();});
    } catch(error) {if(active(id))loadError(target,error);}
  }
  function showExamples(examples,id) {
    const target=at('[data-examples]');
    if(!examples.length){target.innerHTML='<p class="empty">조건에 맞는 예시 공고가 없습니다.</p>';return;}
    target.innerHTML=`<ul class="am-example-list">${examples.map(post=>`<li>
      <details><summary>${esc(post.title)}</summary><p>${esc(post.description)}</p><small>${esc(post.brandAlias)} · ${price(post.quantity,post.unitPrice)} · ${esc(post.size)}</small></details>
      <span class="am-example-state">${post.visible?'표시 허용':'숨김'}</span>
      <button type="button" class="secondary" data-example="${esc(post.id)}" aria-label="${esc(post.title)} ${post.visible?'숨기기':'표시하기'}">${post.visible?'숨기기':'표시하기'}</button>
    </li>`).join('')}</ul>`;
    target.querySelectorAll('[data-example]').forEach(button=>button.onclick=async()=>{
      const post=examples.find(item=>item.id===button.dataset.example);
      const action=post.visible?'숨기기':'표시하기';
      try{
        const ok=await reviewBeforeSave({title:'예시 공고 '+action,rows:[['공고',post.title]],action,
          message:post.visible?'이 예시를 고객 화면에서 숨깁니다.':'공개할 회원 공고가 없으면 고객 화면에 이 예시를 표시합니다.'});
        if(!ok||!active(id))return;
        button.disabled=true;
        await send('admin/market/examples/'+encodeURIComponent(post.id)+'/visibility',{visible:!post.visible,confirmed:true});
        if(screen.isConnected && isActive()){
          notice('예시 공고 표시 설정을 저장했습니다.');
          if(at('[data-results]')){
            const restoreFocus=active(id);
            await loadList();
            if(restoreFocus && document.activeElement===document.body)at(`[data-example="${post.id}"]`)?.focus();
          }
        }
      }catch(error){if(screen.isConnected && isActive())notice(error.message);}
      finally{if(button.isConnected)button.disabled=false;}
    });
  }
  function tierTable(offer,selected) {
    return `<div class="table-scroll"><table class="am-tiers"><thead><tr><th scope="col">제안 수량</th><th scope="col">개당 단가</th><th scope="col">수량 × 단가</th></tr></thead><tbody>
      ${offer.tiers.map(tier=>`<tr class="${selected?.quantity===tier.quantity?'am-picked':''}"><td>${count(tier.quantity)}개 ${selected?.quantity===tier.quantity?'<span class="badge">선정</span>':''}</td><td>${count(tier.unitPrice)}원</td><td>${count(tier.quantity*tier.unitPrice)}원</td></tr>`).join('')}</tbody></table></div>`;
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
      ${work && !c.eligible?'<p class="muted">양측 회원의 가입 승인 상태를 확인해주세요.</p>':''}
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
  async function showDetail(postId,offerPage=1) {
    const id=++sequence;
    if(draft.id!==postId)draft={id:postId};
    screen.innerHTML=`<header><div><button type="button" class="quiet am-back" data-back>${inventory?'← 전체 공고':'← 공고 목록'}</button><h1>공고 상세</h1></div><button type="button" class="secondary" data-refresh>새로고침</button></header><div data-detail aria-busy="true"><p class="muted" role="status">공고와 제안을 불러오고 있습니다.</p></div>`;
    at('[data-back]').onclick=testReview?onExitTest:showList;
    if(testReview){
      at('[data-back]').textContent='← 운영 공고 목록';
      at('header').insertAdjacentHTML('afterend','<p class="hint">테스트 공고 심사 · 승인하면 이 테스트 공간에서만 공개됩니다.</p>');
    }
    at('[data-refresh]').onclick=()=>showDetail(postId,offerPage);
    const target=at('[data-detail]');
    try {
      const data=testReview?{...await api(testPath,{headers:testHeaders}),offers:[],total:0,page:1,pageSize:1}:
        await api(`admin/market/posts/${encodeURIComponent(postId)}?page=${offerPage}`);
      if(!active(id))return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>last)return showDetail(postId,last);
      const {offers,selectedOffer}=data;
      const post=testReview?{...data.post,eligible:true}:data.post;
      const pending=post.reviewStatus==='pending',showOffers=!testReview&&(post.reviewStatus==='approved'||data.total>0||post.connection);
      at('h1').textContent=pending?'공고 심사':post.title;target.setAttribute('aria-busy','false');
      target.innerHTML=`<section class="panel am-preview">${pending?`<h2>${esc(post.title)}</h2>`:'<h2>공고 내용</h2>'}
        <dl><dt>요청 브랜드</dt><dd>${esc(post.brandName)} <small>관리자에게만 표시</small>${!post.eligible?' · 가입 승인 상태 확인':''}</dd><dt>분야</dt><dd>${category(post.category)}</dd>
        <dt>요청 수량</dt><dd>${count(post.quantity)}개</dd><dt>희망 단가</dt><dd>${count(post.unitPrice)}원/개</dd><dt>규격</dt><dd>${esc(post.size)||'미기재'}</dd>
        <dt>제출일</dt><dd>${date(post.createdAt)}</dd><dt>제안 마감</dt><dd>${date(post.deadline)}</dd></dl>
        <div class="am-description"><h3>제작 조건</h3><p class="pre">${esc(post.description)||'미기재'}</p></div></section>
        ${reviewPanel(post,data.reviewEvents||[])}
        ${selection(post,selectedOffer)}
        ${showOffers?`<section class="panel"><div class="am-heading"><h2>받은 제안</h2><strong>${count(data.total)}건</strong></div>
          ${offers.map(offer=>`<article class="am-offer"><div class="am-heading"><h3>${esc(offer.supplierName)} <small>${esc(offer.alias)}</small></h3><small>${date(offer.createdAt)}</small></div>
            ${!offer.eligible?'<p class="muted">제작업체 가입 승인 상태 확인 필요</p>':''}
            ${tierTable(offer,post.connection?.offerId===offer.id?post.connection:null)}
            ${offer.note?`<p class="pre am-note">${esc(offer.note)}</p>`:''}</article>`).join('')||'<p class="empty">아직 도착한 제안이 없습니다.</p>'}
          ${data.total>data.pageSize?pager(data.total,data.page,data.pageSize,'건'):''}</section>`:''}`;
      bindReview(post,data.page,id,target);
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
          const ok=await reviewBeforeSave({title:'거래 연결 전 양측 확인',rows,action:'거래 연결 확인',message:'양측에 전화해 거래 조건과 확정 후 변경 제한을 안내하고 동의를 확인했나요? 확인 후 거래를 연결하세요.'});
          if(!ok || !active(id))return;
          await send(`admin/market/posts/${encodeURIComponent(post.id)}/connect`,{version:c.version,confirmed:true,note:''});
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
