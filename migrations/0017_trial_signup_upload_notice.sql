-- Keep the version accepted by existing members. Revise only the current trial template.
WITH current_policy AS (
  SELECT * FROM policy_versions ORDER BY created_at DESC, rowid DESC LIMIT 1
)
INSERT INTO policy_versions(id,content,published,actor,created_at)
SELECT 'customer-trial-file-uploads-v1',
  json_set(content,
    '$.privacy', replace(json_extract(content,'$.privacy'),
      '실제 전화번호, 실제 사업자 정보, 신분증이나 사업자등록증을 제출하지 마세요. 사업자 가입에는 화면에서 제공하는 견본 서류만 첨부할 수 있습니다.',
      '사업자 가입에는 실제 식별정보를 가린 테스트용 사업자등록증 파일을 직접 첨부합니다. 패키징·작업 현장 사진은 선택 사항입니다. 신분증, 실제 연락처, 거래처 기밀이 담긴 자료는 올리지 마세요.'),
    '$.collection', replace(json_extract(content,'$.collection'),
      '사업자 유형의 예시 사업자번호와 견본 서류를 사용합니다.',
      '사업자 유형의 예시 사업자번호와 직접 첨부한 테스트용 사업자등록증을 사용합니다. 선택해 첨부한 패키징·작업 현장 사진도 운영팀이 심사에 사용합니다.')),
  1,'팩트너 체험 운영 설정',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM current_policy
WHERE published=1 AND json_extract(content,'$.customerTrial')=1
  AND instr(json_extract(content,'$.privacy'),'사업자 가입에는 화면에서 제공하는 견본 서류만 첨부할 수 있습니다.')>0
  AND instr(json_extract(content,'$.collection'),'사업자 유형의 예시 사업자번호와 견본 서류를 사용합니다.')>0
  AND NOT EXISTS(SELECT 1 FROM policy_versions WHERE id='customer-trial-file-uploads-v1');
