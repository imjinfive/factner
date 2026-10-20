# 팩트너 · factner

브랜드와 박스·패키징·부자재 제작 업체를 연결하는 서비스입니다. 저장소와 로컬 폴더명 `rebate`는 작업 이력을 위해 유지합니다. kimkimco / kimkimdeck / kimkim_deck과 코드·설정·데이터를 공유하지 않는 독립 프로젝트입니다.

| 구분 | 주소 / 구성 |
| --- | --- |
| 고객 사이트 | https://factner.com, https://www.factner.com · React + Vite · `rebate-ui/` |
| 관리자 사이트 | https://admin.factner.com · 별도 HTML/JS 앱 · `admin-ui/` |
| API | Cloudflare Workers `factner-main`, `factner-admin` |
| 데이터 | 팩트너 전용 D1 `factner-db`를 두 Worker가 함께 사용 |

## 현재 운영 상태

**2026-10-20 기준 테스트 접수입니다.** 운영 상호, 문의 이메일, 알림 수신 이메일은 이사님 검토 후 확정합니다. 실제 업체 자료는 아직 등록하지 않았습니다. 실제 개인정보·기밀을 입력하지 마세요.

- 견적 접수, 관리자 처리, 고객 조회, 업체 관리, 비밀번호 변경, 운영 문서와 알림 대기열을 구현했습니다.
- Cloudflare Turnstile을 팩트너 도메인에 연결하고 서버에서 응답·도메인·용도를 검증합니다. IP/이메일 접수 제한과 자동 입력 방지도 적용합니다.
- 실제 메일 발송은 **수신 주소 인증과 Email 바인딩 연결 전까지 꺼져 있습니다.** 대기 알림은 보존되며 발송 성공으로 표시하지 않습니다. 외부 장애 감시의 알림 수신처도 확정 후 연결해야 합니다.
- 정식 접수는 운영 정보, 검토 완료된 문서, 대표 관리자 계정, 실제 공개 업체, 스팸 방지, 알림 연결을 모두 확인한 뒤 켤 수 있습니다. 문서가 바뀌면 테스트 접수로 돌아갑니다.

## 구현된 기능

**견적**: 제작 조건·담당자·이메일·선택 연락처/HTTPS 참고 링크를 저장합니다. 같은 접수 번호 재시도는 중복 접수하지 않습니다. 관리자는 검색·상태·담당자·내부 메모·고객 안내를 관리하고, 고객은 나의 활동에서 상태와 안내를 확인합니다. 내부 메모는 공개되지 않습니다. 목록은 20초마다 갱신됩니다.

**업체**: 대표 관리자가 실제 업체를 초안으로 등록하고 사진·제작 사례·최소 수량·제작 기간 등을 편집한 뒤 공개하거나 보관합니다. 공개된 업체와 사진은 메인사이트에 연결됩니다. JPG·PNG·WebP 한 장 1.5MB 이하, 업체당 8장까지 D1에 저장합니다. 현장 검증 표시는 방문일·확인자와 작업 현장/제작 샘플/납품 품질의 실제 사진이 모두 있어야 합니다. 실제 리뷰 기능이 준비되기 전에는 평점·리뷰를 만들어 표시하지 않습니다. 사진 규모가 커지기 전에 R2 이전을 검토합니다.

**운영 문서**: 개인정보처리방침, 이용약관, 수집 안내, 업체 제공 절차를 버전별로 저장합니다. 견적에는 동의한 문서 버전과 테스트/정식 접수 구분을 기록합니다. 현재 문서는 검토용 초안이며, 위탁·국외 처리와 운영자 정보를 확정해야 합니다. 제작 업체에 고객 정보를 자동 전달하는 기능은 없습니다.

**알림·복구**: 견적과 알림을 같은 트랜잭션으로 저장합니다. 5분마다 대기 알림을 처리하며 실패 시 간격을 늘려 최대 8회 재시도합니다. 관리자는 오류와 대기/실패 내역을 보고 수동 재예약할 수 있습니다. 메일에는 접수 번호와 관리자 링크만 담습니다. 일일 작업은 접수 후 365일 지난 견적과 연결 기록을 정리합니다. [알림 연결·복구 절차](docs/operations.md)를 참고하세요.

고객 계정과 기기 간 동기화, 고객 파일 업로드, 업체 자체 가입·자동 입찰, 결제·수수료·계약, 실제 리뷰 등록은 아직 제공하지 않습니다. 멤버십은 가격 미확정 안내입니다. 관심 업체와 견적 조회 키는 해당 브라우저에 저장됩니다. 브라우저 데이터를 지우면 조회 키도 사라집니다.

## 관리자 접속과 보안

온라인 대표 관리자는 아이디와 비밀번호로 바로 로그인합니다. 접속 정보는 Git에서 제외한 로컬 비공개 파일 `.factner-admin-access.txt`에 있습니다. 인증 앱 등록·일회용 코드·복구 코드 단계는 제거했습니다.

- 비밀번호 12~128자, 무작위 salt를 사용하는 PBKDF2 해시.
- 로그인 세션 8시간. HTTPS에서 HttpOnly·Secure·SameSite 쿠키 사용.
- 비밀번호 변경·계정 중지 시 기존 세션 무효화. IP와 계정 단위 로그인 시도 제한.
- 추가 관리자 생성·업체 공개·운영 설정은 대표 관리자만 가능. 일반 관리자는 견적 처리를 담당.
- 새 일반 관리자 계정은 첫 로그인 때 비밀번호를 변경하며, 변경 전 세션은 10분으로 제한됩니다.

공개 회원가입·이메일 비밀번호 재설정은 없습니다. 비밀번호를 잃으면 확인된 운영자를 대상으로 별도 복구해야 합니다. 비밀번호·설정 키·SQL 백업은 Git에 올리지 않습니다.

## 로컬 실행 · Node.js 24

처음 설치할 때 저장소 루트에서 실행합니다. 기존 `.dev.vars`가 있으면 덮어쓰지 마세요.

```sh
npm ci
npm --prefix rebate-ui ci
cp .dev.vars.example .dev.vars
```

`.dev.vars`의 `BOOTSTRAP_TOKEN`을 **무작위 64자리 16진수**로 설정합니다. 로컬 테스트 접수에서는 `TURNSTILE_SITE_KEY=""`, `TURNSTILE_SECRET_KEY=""`로 운영 키를 덮어쓰세요. 위젯 자체를 시험할 때는 Cloudflare의 공식 테스트 키를 사용합니다. `DEV_ORIGIN`은 예제의 로컬 주소를 유지합니다. 운영 비밀값을 복사해 사용하지 않습니다.

```sh
npx wrangler d1 migrations apply factner-db --local --config wrangler.jsonc
npm run build
npm run dev:api
```

별도 터미널 두 개에서 각각 실행합니다.

```sh
npm --prefix rebate-ui run dev
npm run dev:admin
```

- 메인: http://127.0.0.1:5178/
- 관리자: http://127.0.0.1:5179/
- API: http://127.0.0.1:8787/

로컬에서는 단일 Worker가 SQLite를 열고 관리자 개발 서버가 이 API로 프록시합니다. 별도 관리자 Wrangler를 동시에 실행하면 SQLite 잠금 충돌이 생길 수 있습니다. 새 로컬 DB에서만 초기 설정 키로 첫 대표 관리자를 생성합니다. 온라인은 독립된 두 Worker이며 로컬 관리자 우회 경로를 사용하지 않습니다.

## 검증과 배포

작업 시작 전 원격 변경과 로컬 수정사항을 확인합니다. 다른 기기로 이동하기 전 커밋·푸시하며 사용자 변경을 덮어쓰지 않습니다.

```sh
npm test
npm run build
npx wrangler deploy --config wrangler.jsonc --dry-run --outdir .qa/main-build
npx wrangler deploy --config wrangler.admin.jsonc --dry-run --outdir .qa/admin-build
```

테스트는 실제 SQLite 스키마·SQL로 견적 격리, 중복 접수, 권한, 비밀번호 로그인과 변경, 세션 폐기, 업체 공개·사진 보호, 동시 수정, 알림 재시도·동시 실행·개인정보 제외를 확인합니다. 이메일 테스트는 대체 바인딩으로 수행하며 실제 수신 확인을 대신하지 않습니다.

기존 팩트너 배포를 갱신할 때만 아래를 실행합니다. **현재 DB를 다시 생성하지 않습니다.** `wrangler.jsonc`, `wrangler.admin.jsonc`의 팩트너 전용 리소스를 사용합니다.

```sh
npx wrangler whoami
node scripts/backup-check.mjs --remote
npx wrangler d1 migrations apply factner-db --remote --config wrangler.jsonc
npm run deploy:main
npm run deploy:admin
```

Turnstile 준비 여부를 확인하는 두 Worker에는 관련 환경값이 필요합니다. 비밀 키는 `wrangler secret put`으로 등록하고, 공개 사이트 키만 설정 파일에 둡니다. `BOOTSTRAP_TOKEN`은 첫 계정 생성 용도로만 사용합니다. `DEV_ORIGIN`은 온라인에 등록하지 않습니다. 알림 수신 주소 확정 전에는 Email 바인딩과 알림을 켜지 않습니다.

배포 후 HTTPS, 비밀번호 로그인, 테스트 견적→관리자→고객 조회, 초안 업체/사진 비공개, 운영 준비 상태를 확인하고 백업 검사도 다시 실행합니다. `backup-check.mjs`는 원격 SQL과 복구 북마크를 읽고 별도 로컬 SQLite에서만 복구 검사를 합니다. 결과는 Git 제외·접근 제한된 `.qa/backups/`에 보관합니다. 실제 Time Travel 복구는 운영 데이터를 덮어쓰므로 [복구 절차](docs/operations.md)에 따라 별도로 판단합니다.

서비스 소개의 기존 스크롤 이야기와 초록색/크림색 디자인은 유지합니다. 화면·이미지 작업은 [고객 사이트 README](rebate-ui/README.md), [소개 이미지 기록](rebate-ui/docs/service-images.md), [패키징 사진 기록](rebate-ui/docs/packaging-photos-v2.md)을 먼저 확인하세요.
