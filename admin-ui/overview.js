export async function overviewView({api,shell,navigate,isActive}) {
  const [market,settings]=await Promise.all([api('admin/market/posts'),api('admin/settings')]);
  if(!isActive())return;
  const {counts}=market;
  const stats=[
    ['가입 심사 대기',counts.pendingRegistrations,'members','pending'],
    ['모집 중 공고',counts.openPosts,'market','open'],
    ['접수된 연결 요청',counts.pendingConnections,'market','pending'],
    ['검토 중인 연결',counts.reviewingConnections,'market','reviewing']
  ];
  shell(`<header><div><span class="eyebrow">팩트너 운영</span><h1>운영 현황</h1><p class="muted">가입 신청부터 제안 선정과 거래 연결까지 확인하세요.</p></div>
    <button type="button" id="overview-refresh" class="secondary">새로고침</button></header>
    <section class="metrics overview-metrics" aria-label="운영 지표">${stats.map(([label,count,view,status])=>`
      <button class="metric" data-overview-view="${view}" data-overview-status="${status}"><span>${label}</span><strong>${Number(count).toLocaleString('ko-KR')}</strong></button>`).join('')}</section>
    <section class="panel overview-intake"><div><span class="eyebrow">고객 사이트</span><h2>브랜드·제작업체 회원가입</h2>
      <p>${settings.memberIntake.available?'가입 신청을 접수하고 있습니다. 신청은 승인 후 이용할 수 있습니다.':settings.memberIntake.enabled?'접수 조건 확인이 필요합니다. 현재 가입 신청을 받지 않습니다.':'현재 가입 신청 접수가 닫혀 있습니다.'}</p></div>
      <button type="button" class="secondary" data-overview-view="settings">가입 접수 설정</button></section>
    <section class="panel overview-shortcuts"><h2>운영 업무</h2>
      <button data-overview-view="members"><strong>회원·업체 관리</strong><span>가입 심사와 업체 정보 확인</span></button>
      <button data-overview-view="market"><strong>공고·제안 관리</strong><span>브랜드 의뢰와 수량별 제안 비교</span></button>
      <button data-overview-view="partners"><strong>거래 연결 관리</strong><span>연결된 브랜드·제작업체와 거래 상태 확인</span></button>
    </section>`);
  document.querySelector('#overview-refresh').onclick=()=>navigate('overview');
  document.querySelectorAll('[data-overview-view]').forEach(button=>{
    button.onclick=()=>{
      const view=button.dataset.overviewView,status=button.dataset.overviewStatus;
      navigate(view,{status,service:view==='members'&&status==='pending'?'market':undefined});
    };
  });
}
