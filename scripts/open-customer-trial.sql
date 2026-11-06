-- Run once, only on an unconfigured Factner site. Publishing another policy or
-- closing intake later remains an owner decision.
INSERT INTO policy_versions (id, content, published, actor, created_at)
SELECT 'customer-trial-20261103', json_object(
  'operator', '팩트너 (테스트 운영)',
  'contactEmail', 'contact@example.test',
  'customerTrial', json('true'),
  'terms', '테스트용 이용약관
팩트너의 회원가입부터 공고·견적 제안까지 고객 절차를 체험하는 사이트입니다. 브랜드와 패키징 제작업체는 직접 선택한 이메일과 비밀번호로 가입을 신청하고, 운영팀 승인 후 로그인합니다. 디자이너 신규 가입은 아직 열리지 않았습니다.
체험 중에는 예시 업체 정보와 제작 조건을 사용하세요. 실제 거래처의 비밀, 실제 증빙 서류를 제출하거나 실제 대금·제품을 주고받지 마세요. 공고와 제안에 상호, 연락처, 외부 링크를 적지 마세요. 가입이나 제안 선택만으로 결제나 거래 계약이 성립하지 않습니다.',
  'privacy', '테스트용 개인정보처리방침
직접 정한 로그인 이메일, 해시한 비밀번호, 회원 역할과 가입 유형을 계정 관리에 사용합니다. 승인 심사와 체험에는 입력한 업체·담당자 예시 정보와 공고·제안·거래 기록을 사용합니다. 사업자 가입에는 실제 식별정보를 가린 테스트용 사업자등록증 파일을 직접 첨부합니다. 패키징·작업 현장 사진은 선택 사항입니다. 신분증, 실제 연락처, 거래처 기밀이 담긴 자료는 올리지 마세요.
이 사이트는 Cloudflare를 사용해 접속을 처리하고 데이터를 저장하며 자동 가입을 방지합니다. 운영팀은 가입 심사와 문의 처리를 위해 신청 정보를 볼 수 있습니다. 승인 전 신청은 다른 회원에게 공개되지 않습니다.
다시 로그인하여 활동을 이어갈 수 있도록 계정과 활동 기록을 보관합니다. 정보 수정·삭제는 회원 문의 또는 체험을 안내한 담당자를 통해 요청할 수 있습니다. 화면에 표시되는 contact@example.test는 메일을 수신하지 않는 테스트용 주소입니다. 정식 공개 전 실제 문의처와 정식 처리방침을 별도로 게시합니다.',
  'collection', '테스트용 수집·이용 안내
가입과 로그인에 이메일·비밀번호를 사용합니다. 회원 심사에는 활동·가입 유형, 예시 업체명·담당자·전화번호, 사업자 유형의 예시 사업자번호와 직접 첨부한 테스트용 사업자등록증을 사용합니다. 선택해 첨부한 패키징·작업 현장 사진도 운영팀이 심사에 사용합니다. 비밀번호는 해시로 저장합니다. 계정과 활동 기록은 체험을 이어가는 동안 보관하며, 삭제 요청은 운영팀이 확인해 처리합니다. 필수 항목 수집에 동의하지 않으면 가입을 신청할 수 없습니다.',
  'transfer', '테스트용 거래 정보 안내
공개 공고와 제안에는 개인 연락처를 넣지 마세요. 운영팀이 거래를 연결하면 서로 연결된 회원에게 업체명과 담당자 정보가 표시될 수 있습니다. 체험에는 예시 정보만 사용하세요.'
), 1, '팩트너 체험 운영 설정', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM settings
WHERE key='service'
  AND COALESCE(json_extract(value,'$.operator'),'')=''
  AND COALESCE(json_extract(value,'$.contactEmail'),'')=''
  AND COALESCE(json_extract(value,'$.accepting'),0)=0
  AND COALESCE(json_extract(value,'$.memberAccepting'),0)=0
  AND NOT EXISTS (SELECT 1 FROM policy_versions);

UPDATE settings
SET value=json_set(value,
  '$.operator','팩트너 (테스트 운영)',
  '$.contactEmail','contact@example.test',
  '$.memberAccepting',json('true'))
WHERE key='service'
  AND COALESCE(json_extract(value,'$.operator'),'')=''
  AND COALESCE(json_extract(value,'$.contactEmail'),'')=''
  AND COALESCE(json_extract(value,'$.accepting'),0)=0
  AND COALESCE(json_extract(value,'$.memberAccepting'),0)=0
  AND (SELECT id FROM policy_versions ORDER BY created_at DESC,rowid DESC LIMIT 1)='customer-trial-20261103'
  AND EXISTS (
    SELECT 1 FROM policy_versions
    WHERE id='customer-trial-20261103' AND published=1 AND actor='팩트너 체험 운영 설정'
      AND json_extract(content,'$.customerTrial')=1
      AND json_extract(content,'$.operator')='팩트너 (테스트 운영)'
      AND json_extract(content,'$.contactEmail')='contact@example.test'
  );
