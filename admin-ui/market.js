import {reviewBeforeSave} from './review.js';

const requestStates = {pending:'접수',reviewing:'검토 중',completed:'처리 완료',rejected:'보류'};
const filters = {all:'전체 공고',open:'모집 중',expired:'모집 마감',inactive:'브랜드 승인 필요',selected:'제안 선정',...Object.fromEntries(Object.entries(requestStates).map(([key,label])=>[key,'연결 요청 · '+label]))};
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

export async function marketView({api,send,shell,esc,notice,isActive=()=>true,initialStatus='all',initialPostId,openMatching}) {
  shell('<section class="admin-market" id="admin-market"></section>');
  const screen = document.getElementById('admin-market');
  if (!screen || !isActive()) return;
  let sequence=0, query='', status=Object.hasOwn(filters,initialStatus)?initialStatus:'all', listPage=1;
  const active = id => screen.isConnected && isActive() && id===sequence;
  const at = selector => screen.querySelector(selector);
  const options = () => Object.entries(filters).map(([key,label])=>`<option value="${key}" ${key===status?'selected':''}>${label}</option>`).join('');
  function pages(target,load) {
    target.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>load(Number(button.dataset.page)));
  }
  function loadError(target,error) {
    target.setAttribute('aria-busy','false');
    target.innerHTML=`<p class="error" role="alert">${esc(error.message || '자료를 불러오지 못했습니다. 다시 조회해주세요.')}</p>`;
  }
  function showList() {
    screen.innerHTML=`<header><div><h1>공고·제안 관리</h1><p class="muted">브랜드의 제작 의뢰와 제안을 확인하고, 선정된 업체의 거래 연결을 검토하세요.</p></div>
      <button type="button" data-refresh class="secondary">새로고침</button></header>
      <section class="panel"><form class="filters" aria-label="공고 검색">
        <input type="search" name="q" aria-label="공고명 또는 브랜드명" placeholder="공고명 또는 브랜드명" value="${esc(query)}" maxlength="100">
        <select name="status" aria-label="공고 및 연결 상태">${options()}</select><button type="submit">검색</button>
      </form><div data-results></div></section>`;
    const form=at('form');
    form.onsubmit=event=>{event.preventDefault();query=form.elements.q.value.trim();status=form.elements.status.value;listPage=1;loadList();};
    form.elements.status.onchange=()=>form.requestSubmit();
    at('[data-refresh]').onclick=()=>loadList();
    return loadList();
  }
  async function loadList() {
    const id=++sequence,target=at('[data-results]');
    target.setAttribute('aria-busy','true');target.innerHTML='<p class="muted" role="status">공고를 불러오고 있습니다.</p>';
    try {
      const params=new URLSearchParams({q:query,status,page:String(listPage)});
      const data=await api('admin/market/posts?'+params);
      if (!active(id)) return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>last){listPage=last;return loadList();}
      listPage=data.page;target.setAttribute('aria-busy','false');
      if (!data.posts.length) {
        const filtered=Boolean(query||status!=='all');
        target.innerHTML=`<div class="empty"><strong>${filtered?'조건에 맞는 공고가 없습니다.':'등록된 공고가 아직 없습니다.'}</strong><p>${filtered?'검색어나 상태를 바꿔 확인하세요.':'브랜드가 공고를 등록하면 이곳에서 수량, 희망 단가와 받은 제안을 확인할 수 있습니다.'}</p>
          ${filtered?'<button type="button" class="secondary" data-reset>전체 공고 보기</button>':''}</div>`;
        const reset=at('[data-reset]');if(reset)reset.onclick=()=>{query='';status='all';listPage=1;showList();};
        return;
      }
      target.innerHTML=`<div class="table-scroll"><table class="am-posts"><thead><tr><th scope="col">공고 · 브랜드</th><th scope="col">요청 수량 · 희망 단가</th><th scope="col">받은 제안</th><th scope="col">마감일</th><th scope="col">상태</th></tr></thead>
        <tbody>${data.posts.map(post=>`<tr><td><button type="button" class="link-button am-title" data-post="${esc(post.id)}">${esc(post.title)}</button><small>${esc(post.brandName)} · ${category(post.category)}</small></td>
          <td>${count(post.quantity)}개<small>${count(post.unitPrice)}원/개</small></td><td>${count(post.offerCount)}건</td><td>${esc(post.deadline)}</td>
          <td><span class="badge">${filters[post.status]||'확인 필요'}</span>${post.connection?`<small>연결 요청 · ${requestStates[post.connection.status]||'확인 필요'}</small>`:''}${!post.eligible?'<small>브랜드 승인 상태 확인</small>':''}</td></tr>`).join('')}
        </tbody></table></div>${pager(data.total,data.page,data.pageSize,'건')}`;
      target.querySelectorAll('[data-post]').forEach(button=>button.onclick=()=>showDetail(button.dataset.post));
      pages(target,next=>{listPage=next;loadList();});
    } catch(error) {if(active(id))loadError(target,error);}
  }
  function tierTable(offer,selected) {
    return `<div class="table-scroll"><table class="am-tiers"><thead><tr><th scope="col">제안 수량</th><th scope="col">개당 단가</th><th scope="col">수량 × 단가</th></tr></thead><tbody>
      ${offer.tiers.map(tier=>`<tr class="${selected?.quantity===tier.quantity?'am-picked':''}"><td>${count(tier.quantity)}개 ${selected?.quantity===tier.quantity?'<span class="badge">선정</span>':''}</td><td>${count(tier.unitPrice)}원</td><td>${count(tier.quantity*tier.unitPrice)}원</td></tr>`).join('')}</tbody></table></div>`;
  }
  function selection(post,chosen) {
    const c=post.connection;
    if(!c)return '';
    const work=['pending','reviewing'].includes(c.status);
    const save=work && c.eligible && c.partnerStatus!=='ended' && chosen;
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
  async function showDetail(postId,offerPage=1) {
    const id=++sequence;
    screen.innerHTML=`<header><div><button type="button" class="quiet am-back" data-back>← 공고 목록</button><h1>공고 상세</h1></div><button type="button" class="secondary" data-refresh>새로고침</button></header><div data-detail aria-busy="true"><p class="muted" role="status">공고와 제안을 불러오고 있습니다.</p></div>`;
    at('[data-back]').onclick=showList;at('[data-refresh]').onclick=()=>showDetail(postId,offerPage);
    const target=at('[data-detail]');
    try {
      const data=await api(`admin/market/posts/${encodeURIComponent(postId)}?page=${offerPage}`);
      if(!active(id))return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));
      if(data.page>last)return showDetail(postId,last);
      const {post,offers,selectedOffer}=data;
      at('h1').textContent=post.title;target.setAttribute('aria-busy','false');
      target.innerHTML=`<section class="panel"><div class="am-heading"><h2>공고 조건</h2><span class="badge">${filters[post.status]||'확인 필요'}</span></div>
        <dl><dt>브랜드</dt><dd>${esc(post.brandName)}${!post.eligible?' · 가입 승인 상태 확인':''}</dd><dt>분야</dt><dd>${category(post.category)}</dd>
        <dt>요청 수량</dt><dd>${count(post.quantity)}개</dd><dt>희망 단가</dt><dd>${count(post.unitPrice)}원/개</dd><dt>규격</dt><dd>${esc(post.size)||'미기재'}</dd>
        <dt>등록일</dt><dd>${date(post.createdAt)}</dd><dt>제안 마감</dt><dd>${date(post.deadline)}</dd><dt>제작 조건</dt><dd class="pre">${esc(post.description)||'미기재'}</dd></dl></section>
        ${selection(post,selectedOffer)}
        <section class="panel"><div class="am-heading"><h2>받은 제안</h2><strong>${count(data.total)}건</strong></div>
          ${offers.map(offer=>`<article class="am-offer"><div class="am-heading"><h3>${esc(offer.supplierName)} <small>${esc(offer.alias)}</small></h3><small>${date(offer.createdAt)}</small></div>
            ${!offer.eligible?'<p class="muted">제작업체 가입 승인 상태 확인 필요</p>':''}
            ${tierTable(offer,post.connection?.offerId===offer.id?post.connection:null)}
            ${offer.note?`<p class="pre am-note">${esc(offer.note)}</p>`:''}</article>`).join('')||'<p class="empty">아직 도착한 제안이 없습니다.</p>'}
          ${data.total>data.pageSize?pager(data.total,data.page,data.pageSize,'건'):''}</section>`;
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
          const ok=await reviewBeforeSave({title:'거래 연결 전 양측 확인',rows,action:'거래 연결 확인',message:'양측의 거래 의사를 확인했나요? 연결 후 브랜드가 이 제작업체에 발주할 수 있습니다.'});
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
