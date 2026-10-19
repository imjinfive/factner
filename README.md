# 팩트너 · factner

브랜드와 패키징 제작 업체를 연결하는 서비스입니다. 저장소와 로컬 폴더명 `rebate`는 작업 이력을 보존하기 위해 유지합니다. kimkimco / kimkimdeck과 코드·설정·데이터를 공유하지 않습니다.

- 고객 사이트: `https://factner.com` — React + Vite, `rebate-ui/`
- 관리자 사이트: `https://admin.factner.com` — 별도 HTML/JS 앱, `admin-ui/`
- API: Cloudflare Workers 두 개 (`factner-main`, `factner-admin`)
- 저장: 팩트너 전용 Cloudflare D1 (`factner-db`), 두 Worker가 같은 데이터베이스 사용

## 로컬 실행 (Node.js 24)

```sh
npm ci
npm --prefix rebate-ui ci
npm run build
cp .dev.vars.example .dev.vars
# .dev.vars의 BOOTSTRAP_TOKEN을 임의의 충분히 긴 비밀 키로 변경
npx wrangler d1 migrations apply factner-db --local
npm run dev:api
```

별도 터미널 두 개에서 각각 실행합니다.

```sh
npm --prefix rebate-ui run dev
npm run dev:admin
```

- 메인: http://127.0.0.1:5178/#intro
- 관리자: http://127.0.0.1:5179/

로컬에서는 단일 Worker가 SQLite를 열고, 관리자 개발 서버는 해당 API로 프록시합니다. `wrangler.admin.jsonc`를 별도 dev 프로세스로 동시에 띄우면 로컬 SQLite 잠금 충돌이 생길 수 있습니다. 온라인 배포는 독립된 두 Worker입니다.

관리자 첫 방문 시 초기 설정 키와 원하는 아이디·비밀번호로 대표 관리자 계정을 생성합니다. 공개 회원가입은 없습니다. 추가 관리자 계정은 대표 관리자만 만들 수 있습니다. 초기 설정 키, 비밀번호, 세션은 Git에 커밋하지 않습니다.

## 배포

Cloudflare 계정과 factner.com 영역에서만 진행합니다. 다른 프로젝트의 Worker·DNS·설정을 수정하지 않습니다.

```sh
npx wrangler login
npx wrangler d1 create factner-db
# 출력된 database_id를 wrangler.jsonc와 wrangler.admin.jsonc 두 곳에 반영
npx wrangler d1 migrations apply factner-db --remote
npm run deploy:main
npm run deploy:admin
npx wrangler secret put BOOTSTRAP_TOKEN --config wrangler.admin.jsonc
```

`BOOTSTRAP_TOKEN`에는 로컬과 다른 무작위 키를 사용합니다. 첫 대표 관리자 생성 후 이 secret을 삭제해 초기 설정 경로를 닫습니다. `DEV_ORIGIN`은 온라인 Worker에 설정하지 않습니다. 배포 설정에 커스텀 도메인이 포함되어 있어 각 Worker의 전용 도메인과 HTTPS를 연결합니다. 기존 factner.com DNS가 다른 서비스를 가리키고 있다면 변경 전 확인합니다.

## 검증

```sh
npm test
npm run build
npx wrangler deploy --dry-run --outdir .qa/main-build
npx wrangler deploy --config wrangler.admin.jsonc --dry-run --outdir .qa/admin-build
```

서버 테스트는 Node.js 내장 SQLite로 실제 스키마·SQL을 실행해 로그인, 권한, 접수 키 격리, 중복 접수 방지, 동시 수정 충돌, 계정 중지, 비밀번호 변경과 세션 폐기를 확인합니다.

## 운영 범위

견적 접수 → 관리자 조회·검색 → 상태·담당자·내부 메모·고객 안내 저장 → 고객의 나의 활동에 진행 상황 반영이 구현돼 있습니다. 목록은 20초 간격으로 갱신합니다. 고객은 이 브라우저의 접수 키로 요청 상태를 조회하며, 고객 회원 계정에 기기 간 동기화되는 구조는 아닙니다. 브라우저 데이터 삭제 시 접수 키를 잃으므로 접수 번호로 운영팀에 문의해야 합니다. 관심 업체도 브라우저 저장입니다. 기존 rebate 미발송 초안은 서버 견적으로 자동 전환하지 않습니다.

운영 설정의 기본값은 **테스트 접수**입니다. 실제 개인정보·기밀을 입력하지 않도록 표시합니다. 대표 관리자가 운영자명·문의 이메일을 설정하고 실제 개인정보 처리 방침을 확인한 뒤 정식 접수를 켤 수 있습니다. 접수 후 365일이 지난 견적과 기록은 관리자 Worker의 일일 스케줄로 삭제합니다. 정식 접수 전 Cloudflare의 저장 위치·처리 위탁 등 실제 운영 조건에 맞는 개인정보 문서를 확정해야 합니다.

업체·리뷰·방문 정보는 여전히 가상 데이터이며 이미지는 AI 예시입니다. 실제 업체 가입, 업체 자동 입찰, 거래·결제, 계약, 실제 리뷰 등록은 구현되지 않았습니다. 견적 참고 자료는 HTTPS 공유 링크로 접수하며 파일 업로드·이메일·문자 자동 발송은 없습니다. 운영자는 저장된 연락처로 상담을 진행합니다. 멤버십은 요금 미확정 안내 화면이며 결제되지 않습니다.

관리자 비밀번호는 무작위 salt를 사용하는 PBKDF2로 해시하고 세션은 HttpOnly·SameSite 쿠키로 관리합니다. HTTPS 배포에서는 Secure 쿠키를 사용합니다. 세션은 8시간, 인증 실패에는 IP별 제한이 있습니다. 대표 관리자 비밀번호 분실 시 검증된 계정 운영자가 D1에서 해당 계정의 비밀번호 해시를 교체하고 세션을 폐기해야 합니다. 공개 비밀번호 재설정 기능은 제공하지 않습니다.

작업 시작 전 원격 변경을 확인하고 다른 기기로 이동하기 전 커밋·푸시합니다. 로컬 변경을 덮어쓰지 않습니다.
