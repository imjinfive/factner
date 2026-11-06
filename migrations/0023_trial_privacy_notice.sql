-- Publish a new trial notice without changing earlier consent records or intake settings.
WITH latest AS (
  SELECT * FROM policy_versions ORDER BY created_at DESC, rowid DESC LIMIT 1
)
INSERT INTO policy_versions(id, content, published, actor, created_at)
SELECT 'customer-trial-20261106',
       json_set(content, '$.privacy', replace(json_extract(content, '$.privacy'),
         '이 사이트는 Cloudflare를 사용해 접속을 처리하고 데이터를 저장하며 자동 가입을 방지합니다. ', '')),
       1, '팩트너 체험 운영 설정', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM latest
WHERE id IN ('customer-trial-20261103','customer-trial-file-uploads-v1')
  AND published=1 AND json_extract(content,'$.customerTrial')=1
  AND instr(json_extract(content,'$.privacy'),
    '이 사이트는 Cloudflare를 사용해 접속을 처리하고 데이터를 저장하며 자동 가입을 방지합니다. ')>0
  AND NOT EXISTS (SELECT 1 FROM policy_versions WHERE id='customer-trial-20261106');
