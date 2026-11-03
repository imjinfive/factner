# 패키징 제품 이미지

2026-11-04. 세부 제품 166종에 각각 만든 AI 연출 이미지다. 실제 제작업체의 작업·납품 증빙으로 사용하지 않는다.

- 생성: 기본 제공 ImageGen, 제품당 개별 호출. 팩트너 로고 없이 스튜디오 제품 사진, 다양한 색상과 구조·개폐 연출.
- 출력: `rebate-ui/public/generated/packaging/<variant-id>.webp`, 640 × 640px.
- 연결: `PackagingArt.jsx`가 세부 제품 ID로 이미지를 선택한다. 분류 카드는 해당 분류의 대표 제품 한 개를 사용한다.
- 검사: 카탈로그 전 품목의 이미지 존재, WebP 형식, 개별 200KB 미만, 파일 중복 여부를 테스트한다.

프롬프트 목록:

- [종이 35종](packaging-photo-prompts-paper.json)
- [플라스틱·유리·금속 64종](packaging-photo-prompts-containers.json)
- [비닐·파우치·목재·보냉 67종](packaging-photo-prompts-flexible.json)
- [2026-11-04 이미지 수정 기록](packaging-photo-revisions-20261104.json)
