import {body,fail,json,now,stmt,text} from './http.js';
import {owner} from './auth.js';
import {notificationReadiness} from './operations.js';

const draft = {
 version:'draft-2026-10-28',published:false,
 privacy:`개인정보 처리방침 초안 — 정식 운영 전 검토 중
현재는 가상 정보로만 테스트하는 상태입니다. 실제 개인정보와 기밀 자료를 입력하지 마세요.

1. 처리 목적과 항목
가입 신청과 본인 확인·승인, 업체 소개와 제작 조건 관리, 파트너 연결, 패키징 검토, 발주 진행 및 문의 처리를 위해 정보를 처리합니다. 회원가입의 필수 항목은 활동 유형, 가입 유형, 업체·브랜드명, 담당자명, 연락처, 이메일, 비밀번호입니다. 사업자 가입은 사업자 정보와 증빙도 필요합니다. 비밀번호는 해시로 저장하며 운영자가 원문을 조회하지 않습니다.
이용 과정에서 업체 소개·제작 조건, 패키징 사양·사진·도안, 파트너 선택, 발주 수량·금액·납품 일정·주소, 승인 기록, 정보 수정·상담·계정 복구 요청을 저장합니다. 자료에 불필요한 개인정보를 포함하지 마세요. 운영 담당자 이름·전화·이메일과 처리 예상 시간은 배정된 회원에게 안내합니다.

2. 보유와 파기
가입·업체·패키징·발주·상담 정보의 보유 기간, 거래 기록의 보존 근거와 삭제 절차는 정식 운영 전 확정해야 합니다. 거래 연결이 끝나도 과거 발주 기록은 자동 삭제되지 않으며 회원이 조회할 수 있습니다. 현재 모든 회원 자료가 1년 뒤 자동 삭제되는 구조는 아닙니다. 기존 비회원 견적 접수에는 365일 경과 자료 정리 기능이 적용됩니다. 삭제 요청은 운영팀이 본인과 대상 자료를 확인해 처리하며, 백업 잔존 기간도 운영 전 확정합니다.

3. 제공과 위탁
가입 전 예시 후보는 실제 회원 정보가 아닙니다. 승인 회원의 파트너 찾기에는 운영팀이 공개한 상대 활동 유형의 익명 업체 소개와 제작 조건이 표시됩니다. 상호와 연락처는 익명 후보 목록에 표시하지 않습니다.
운영팀이 거래를 연결하면 연결된 양측은 상대 업체명·담당자·연락처를 확인할 수 있습니다. 발주를 제출하면 해당 거래의 상대 업체와 운영팀이 사양·첨부 자료·수량·납품 정보 및 승인·진행 기록을 확인합니다. 가입 자료 전체나 운영팀 내부 메모를 상대 업체에 공개하는 흐름은 아닙니다. 실제 고객 정보로 운영하기 전 제공 대상·목적·항목·보유 기간·거부 시 영향을 확정하고 필요한 고지와 동의 절차를 갖춰야 합니다.
Cloudflare를 웹 서비스와 데이터 저장에 사용합니다. 위탁 업무, 계약, 처리 국가, 국외 이전 근거·시기·방법·보유 기간·거부 방법은 운영자가 확인해 이 문서에 확정 기재한 뒤 정식 접수를 시작합니다.

4. 권리와 보호 조치
고객은 운영팀에 열람·정정·삭제·처리 정지·동의 철회를 요청할 수 있습니다. 마이페이지의 정보 수정 요청과 문의 기능으로 접수하며 배정 담당자의 연락처도 확인할 수 있습니다. 본인 확인 후 처리합니다. 운영 법인과 개인정보 담당자의 공식 연락처는 정식 운영 전 확정해야 합니다. 관리자 접근 권한과 암호화 통신을 적용합니다.

5. 브라우저 저장
로그인은 보안 쿠키의 세션으로 유지하며 회원의 업체·발주 기록은 서버에 저장됩니다. 기존 비회원 견적 조회 키와 화면 설정 일부는 브라우저에 저장되므로 공용 기기에서는 로그아웃하고 저장 정보를 확인하세요. 보안 검증 서비스의 처리 정보와 보관 조건은 운영 전 검토합니다.`,
 terms:`이용약관 초안 — 정식 운영 전 검토 중
팩트너는 운영 담당자가 브랜드와 제작 업체의 조건을 확인하고 파트너 연결과 패키징·발주 진행을 관리하는 서비스입니다.
회원가입은 신청이며 운영팀 승인 후 회원 기능을 이용합니다. 가입 승인, 후보 선택, 실제 거래 연결은 서로 다른 단계입니다. 후보를 선택해도 거래가 자동 연결되거나 제작이 확정되지 않습니다. 가입 전에는 예시라고 표시된 미리보기만 제공하며 실제 검증이나 거래 실적을 뜻하지 않습니다.
업체 정보와 패키징 추가·수정 요청은 운영팀 검토 후 적용됩니다. 검토 중에는 기존 승인 자료를 유지합니다. 새 발주는 이용 가능한 거래 연결과 승인 패키징이 있어야 하며, 거래 종료 후에도 이전 발주를 확인할 수 있습니다.
발주와 견적·금액 관련 주요 제출에는 조건 재확인이 필요합니다. 시스템은 제출·견적·승인·진행 기록을 보관합니다. 가격·납기·품질·취소 조건은 양측과 운영팀이 확인해야 하며, 최종 승인 전에 전체 조건을 확인해주세요. 현장 확인은 확인 시점의 자료를 뜻하며 모든 거래의 품질이나 수주를 보장하지 않습니다.
담당자와 처리 예상 시간은 마이페이지에 안내합니다. 예상 시간은 처리 보장이나 확정 납기가 아니며, 미설정 항목은 별도 확인이 필요합니다. 사진은 용량 조정을 위해 압축될 수 있으므로 인쇄용 원본은 담당자와 전달 방법을 확인해주세요.
허위 요청, 타인의 개인정보와 권리를 침해하는 자료, 악성 파일과 링크를 등록할 수 없습니다.
수수료·대금 수취·취소·환불 및 거래 책임 범위는 정식 운영 전 확정해야 합니다. 현재 결제·크레딧 충전 기능은 제공하지 않습니다. 사이트의 금액 입력이나 승인만으로 실제 결제가 이루어지지 않습니다. 유료 서비스 시작 전 조건을 별도로 안내합니다.
운영자 정보, 분쟁 처리 창구, 책임 범위와 약관 변경 절차를 확정하고 검토한 후 정식 서비스를 시작합니다.`,
 collection:`목적: 가입 심사, 업체·패키징 정보 검토, 파트너 연결, 발주 진행, 정보 수정 및 문의 처리.
회원가입 필수 항목: 활동·가입 유형, 업체·브랜드명, 담당자명, 전화번호, 이메일, 비밀번호 및 해당하는 사업자 증빙. 이용 중 제출하는 제작 조건·첨부 자료·발주·승인·문의 기록도 처리합니다.
기존 비회원 견적 필수 항목: 브랜드명, 담당자명, 이메일, 제작 조건. 전화번호·참고 링크는 선택입니다.
보유 기간: 회원·거래 자료는 정식 운영 전 확정이 필요하며 거래 종료만으로 자동 삭제되지 않습니다. 기존 비회원 견적은 접수 후 365일 경과 자료 정리 대상입니다.
동의를 거부할 수 있으며 필수 정보 처리에 동의하지 않으면 해당 가입·접수 기능을 이용할 수 없습니다.
현재는 가상 정보 테스트만 가능합니다.`,
 transfer:`익명 후보에는 운영팀이 공개한 소개와 제작 조건을 표시합니다. 운영팀이 거래를 연결하면 상대 업체명·담당자·연락처가 양측에 표시됩니다. 제출한 발주의 사양·첨부 자료·수량·납품 정보·견적·승인 기록은 해당 거래의 상대 업체와 운영팀이 확인합니다. 실제 정보로 운영하기 전에 제공 대상·목적·항목·보유 기간·거부 시 영향을 확정하고 필요한 고지와 동의 절차를 갖춰야 합니다. 운영팀 내부 메모와 가입 증빙 전체를 상대 업체에 제공하지 않습니다. 현재는 가상 정보 테스트 단계입니다.`,
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
