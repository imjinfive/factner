const date = value => value ? new Date(value).toLocaleString('ko-KR') : '아직 없음';
const labels = {pending:'대기',processing:'발송 처리 중',failed:'확인 필요',sent:'발송 접수'};
const kinds = {quote:'새 견적',incident:'운영 오류',test:'연결 테스트'};
const errors = {REQUEST_FAILED:'요청 처리 오류',SCHEDULED_FAILED:'예약 작업 오류',EMAIL_DELIVERY_FAILED:'이메일 발송 오류',UPTIME_MAIN_FAILED:'메인사이트 응답 오류',UPTIME_ADMIN_FAILED:'관리자사이트 응답 오류'};

export async function operationsView({api,send,shell,esc,submit,notice}) {
  const data=await api('admin/operations');
  const counts=Object.fromEntries(data.counts.map(row=>[row.status,row.count]));
  const again=()=>operationsView({api,send,shell,esc,submit,notice});
  shell(`<header><div><h1>알림 발송</h1></div><button id="ops-refresh" class="secondary">새로고침</button></header>
    <p class="badge">${data.readiness.ready?'이메일 알림 켜짐':data.readiness.configured?'이메일 알림 꺼짐':'이메일 연결 필요'}</p>
    <div class="metrics">${[['대기',(counts.pending||0)+(counts.processing||0)],['확인 필요',counts.failed||0],['발송 접수',counts.sent||0],['최근 오류 기록',data.incidents.length]].map(([label,count])=>`<div class="metric"><small>${label}</small><strong>${count}</strong></div>`).join('')}</div>
    <div class="detail-grid"><section class="panel"><h2>이메일 알림</h2><form id="ops-form"><label>알림 받을 이메일<input name="recipient" type="email" maxlength="254" value="${esc(data.settings.recipient)}" placeholder="name@example.com"></label><label class="check"><input type="checkbox" name="enabled" ${data.settings.enabled?'checked':''}> 이메일 알림 켜기</label><button type="submit">알림 설정 저장</button></form><p><button id="ops-test" class="secondary" ${data.readiness.ready?'':'disabled'}>테스트 알림 예약</button></p></section>
    <section class="panel"><h2>작업 상태</h2><dl><dt>알림 확인 주기</dt><dd>5분</dd><dt>마지막 예약 작업</dt><dd>${date(data.lastRunAt)}</dd><dt>마지막 발송 접수</dt><dd>${date(data.lastSentAt)}</dd></dl></section>
    <section class="panel wide"><h2>발송 기록</h2><div class="table-scroll"><table><thead><tr><th>알림</th><th>상태</th><th>시도</th><th>접수일</th><th>작업</th></tr></thead><tbody>${data.notifications.map(row=>`<tr><td>${kinds[row.kind]}${row.quote_id?`<small>${esc(row.quote_id)}</small>`:''}</td><td>${labels[row.status]}${row.last_error?`<small>${esc(row.last_error)}</small>`:''}${row.status==='pending'&&row.attempts?`<small>다음 시도 ${date(row.next_attempt_at)}</small>`:''}</td><td>${row.attempts} / 8</td><td>${date(row.created_at)}</td><td>${['pending','failed'].includes(row.status)?`<button class="secondary" data-retry="${esc(row.id)}" ${data.readiness.ready?'':'disabled'}>다시 예약</button>`:'—'}</td></tr>`).join('')}</tbody></table>${!data.notifications.length?'<p class="empty">등록된 알림이 없습니다.</p>':''}</div></section>
    <section class="panel wide"><h2>최근 운영 오류</h2><div class="table-scroll"><table><thead><tr><th>오류</th><th>위치</th><th>발생 횟수</th><th>마지막 발생</th></tr></thead><tbody>${data.incidents.map(row=>`<tr><td>${errors[row.code]||'처리 오류'}</td><td>${esc(row.context)}</td><td>${row.occurrences}</td><td>${date(row.last_at)}</td></tr>`).join('')}</tbody></table>${!data.incidents.length?'<p class="empty">기록된 운영 오류가 없습니다.</p>':''}</div></section></div>`);
  document.querySelector('#ops-form').onsubmit=event=>submit(event,async form=>{await send('admin/operations',{recipient:form.recipient,enabled:form.enabled==='on'},'PUT');notice('알림 설정을 저장했어요.');await again();});
  document.querySelector('#ops-refresh').addEventListener('click',()=>again().catch(error=>notice(error.message)));
  document.querySelector('#ops-test').addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await send('admin/operations/test',{});notice('테스트 알림을 예약했어요.');await again();}catch(error){notice(error.message);event.target.disabled=false;}});
  document.querySelectorAll('[data-retry]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await send(`admin/operations/notifications/${button.dataset.retry}/retry`,{});notice('다시 발송하도록 예약했어요.');await again();}catch(error){notice(error.message);button.disabled=false;}}));
}
