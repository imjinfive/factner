import {body,fail,json,now,stmt,text} from './http.js';
import {owner} from './auth.js';
import {notificationReadiness} from './operations.js';

const draft = {
 version:'draft-2026-10-20',published:false,
 privacy:`개인정보 처리방침 초안 — 정식 운영 전 검토 중
현재는 가상 정보로만 테스트하는 상태입니다. 실제 개인정보와 기밀 자료를 입력하지 마세요.

1. 처리 목적과 항목
견적 요청 확인, 제작 조건 검토, 고객 상담을 위해 브랜드명, 담당자명, 이메일, 제작 조건을 수집합니다. 전화번호와 참고 링크는 선택 사항입니다. 개인정보가 포함된 불필요한 자료는 입력하지 마세요.

2. 보유와 파기
접수 정보를 최대 1년 보유하고 자동 삭제합니다. 목적 달성 또는 삭제 요청이 있으면 필요한 확인 후 먼저 삭제합니다. 법률상 별도 보존이 필요한 정보가 발생하면 항목·근거·기간을 별도로 안내합니다. 백업의 잔존 기간과 삭제 절차는 정식 운영 전 확정합니다.

3. 제공과 위탁
현재 접수 내용은 팩트너 운영자만 확인하며 제작 업체에 자동 전달되지 않습니다. 제공이 필요하면 업체명, 목적, 항목, 보유 기간, 거부 시 영향을 별도로 안내하고 동의를 받아야 합니다.
Cloudflare를 웹 서비스와 데이터 저장에 사용합니다. 위탁 업무, 계약, 처리 국가, 국외 이전 근거·시기·방법·보유 기간·거부 방법은 운영자가 확인해 이 문서에 확정 기재한 뒤 정식 접수를 시작합니다.

4. 권리와 보호 조치
고객은 운영자에게 열람·정정·삭제·처리 정지·동의 철회를 요청할 수 있습니다. 본인 확인 후 처리합니다. 운영자명, 개인정보 담당자와 연락처는 아직 미정입니다. 관리자 접근 권한과 암호화 통신을 적용합니다.

5. 브라우저 저장
관심 업체와 견적 조회 키는 현재 브라우저에 저장됩니다. 공용 기기 이용 시 유의하세요. 기기를 바꾸면 자동 복원되지 않습니다. 보안 검증 서비스의 처리 정보와 보관 조건은 운영 전 검토합니다.`,
 terms:`이용약관 초안 — 정식 운영 전 검토 중
팩트너는 브랜드의 패키징 제작 조건을 접수하고 업체 비교와 상담 연결을 돕습니다.
견적 요청은 주문이나 계약 체결이 아닙니다. 가격, 제작 가능 여부, 납기와 품질 기준은 실제 상담과 계약에서 확정합니다. 현장 확인은 확인 시점의 자료를 뜻하며 모든 거래의 품질이나 수주를 보장하지 않습니다.
현재 테스트에 표시되는 예시 업체·리뷰와 AI 이미지는 실제 거래 또는 검증 자료가 아닙니다.
허위 요청, 타인의 개인정보와 권리를 침해하는 자료, 악성 파일과 링크를 등록할 수 없습니다.
수수료, 멤버십 가격, 결제·취소·환불 조건은 미정이며 현재 사이트에서 결제나 계약을 처리하지 않습니다. 유료 서비스 시작 전 조건을 별도로 안내합니다.
운영자 정보, 분쟁 처리 창구, 책임 범위와 약관 변경 절차를 확정하고 검토한 후 정식 서비스를 시작합니다.`,
 collection:`목적: 견적 요청 확인, 제작 조건 검토와 상담.
필수 항목: 브랜드명, 담당자명, 이메일, 제작 조건. 선택 항목: 전화번호, 참고 링크.
보유 기간: 접수 후 최대 1년. 목적 달성 또는 적법한 삭제 요청이 있으면 먼저 삭제합니다.
동의를 거부할 수 있으며, 필수 항목의 수집에 동의하지 않으면 견적 상담을 접수할 수 없습니다.
현재는 가상 정보 테스트만 가능합니다.`,
 transfer:`현재 제작 업체에 개인정보를 자동 전달하지 않습니다. 업체에 제공할 때에는 제공받는 업체, 목적, 항목, 보유 기간과 거부 시 영향을 먼저 안내하고 별도 동의를 받아야 합니다. 운영자의 내부 메모는 고객 동의를 대신하지 않습니다.`,
};
export async function service(env) {
 const row=await stmt(env,"SELECT value FROM settings WHERE key='service'").first();
 return JSON.parse(row.value);
}
export async function policy(env) {
 const row=await stmt(env,'SELECT id,content,published FROM policy_versions ORDER BY created_at DESC,rowid DESC LIMIT 1').first();
 const config=await service(env);
 return row?{...JSON.parse(row.content),version:row.id,published:!!row.published}:{...draft,operator:config.operator,contactEmail:config.contactEmail};
}
export async function readiness(env,config) {
 const doc=await policy(env);
 const suppliers=await stmt(env,`SELECT count(*) AS n FROM suppliers WHERE state='published'`).first();
 const admin=await stmt(env,"SELECT count(*) AS n FROM admins WHERE active=1 AND role='owner' AND must_change_password=0").first();
 const op=await stmt(env,"SELECT value FROM settings WHERE key='operations'").first();
 const notify=op?JSON.parse(op.value):{};
 return [
  {label:'운영 상호·문의 이메일',ready:!!config.operator&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)},
  {label:'개인정보·약관 및 위탁·국외 처리 검토',ready:doc.published&&doc.operator===config.operator&&doc.contactEmail===config.contactEmail},
  {label:'대표 관리자 계정',ready:admin.n>0},
  {label:'실제 공개 업체 등록',ready:suppliers.n>0},
  {label:'스팸 방지 연결',ready:!!env.TURNSTILE_SITE_KEY&&!!env.TURNSTILE_SECRET_KEY},
  {label:'새 견적·장애 알림 연결',ready:notificationReadiness(env,notify).ready},
 ];
}
export async function policyApi(req,env,url,user) {
 if(url.pathname==='/api/policy'&&req.method==='GET')return json(await policy(env));
 if(url.pathname==='/api/admin/policy') {
  owner(user);
  if(req.method==='GET')return json(await policy(env));
  if(req.method==='PUT') {
   const input=await body(req,40000), config=await service(env);
   const previous=await policy(env);
   if(input.version!==previous.version)fail(409,'다른 관리자가 문서를 변경했습니다. 다시 불러와주세요.');
   const content={operator:config.operator,contactEmail:config.contactEmail,
    privacy:text(input.privacy,5000,true),terms:text(input.terms,4000,true),collection:text(input.collection,1500,true),transfer:text(input.transfer,1500,true)};
   const published=input.published===true;
   if(published&&(!config.operator||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)||input.reviewed!==true))fail(400,'운영 정보를 먼저 입력하고 문서·위탁·국외 처리 검토를 확인해주세요.');
   const version=crypto.randomUUID();
   await env.DB.batch([
    stmt(env,'INSERT INTO policy_versions VALUES(?,?,?,?,?)',version,JSON.stringify(content),Number(published),user.id,now()),
    stmt(env,"UPDATE settings SET value=? WHERE key='service'",JSON.stringify({...config,accepting:false})),
   ]);
   return json({...content,version,published});
  }
 }
 return null;
}
