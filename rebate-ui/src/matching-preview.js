export const MATCH_CATEGORIES = [
  { value: 'box', label: '박스', detail: '택배·배송용 박스' },
  { value: 'packaging', label: '제품 패키징', detail: '단상자·선물 패키지' },
  { value: 'supplies', label: '부자재', detail: '완충재·쇼핑백·스티커' },
];

export const MATCH_CAPACITIES = [
  { value: '5000', label: '5천 개 이하' },
  { value: '30000', label: '3만 개 이하' },
  { value: '100000', label: '10만 개 이하' },
  { value: 'over', label: '10만 개 초과' },
];

// Preview examples are deliberately local and never submitted as real candidates.
export function previewCandidates(role, category) {
  const label = MATCH_CATEGORIES.find(item => item.value === category)?.label;
  if (!label || !['brand', 'supplier'].includes(role)) return [];
  const supplier = role === 'brand';
  const descriptions = supplier
    ? ['소량부터 시작하는 제작', '반복 발주에 맞춘 안정적인 생산', '인쇄·후가공을 함께 준비하는 제작', '여러 규격을 함께 관리하는 제작']
    : ['새로운 패키징을 준비하는 생활용품 브랜드', '정기적으로 패키징을 사용하는 식품 브랜드', '선물 구성을 준비하는 라이프스타일 브랜드', '제품군별 패키징을 찾는 온라인 브랜드'];
  return descriptions.map((title, index) => ({
    id: `preview-${role}-${category}-${index}`, demo: true,
    label: `${String.fromCharCode(65 + index)}${supplier ? '업체' : '브랜드'} · 미리보기 예시`,
    title: `${label} · ${title}`,
    quantity: supplier ? ['500개', '1,000개', '3,000개', '수량 협의'][index] : ['월 1,000개', '월 3,000개', '월 5,000개', '월 10,000개'][index],
    schedule: supplier ? ['발주 후 약 2주', '발주 후 약 3주', '사양 확인 후 협의', '일정 협의'][index] : ['정기 납품', '나누어 납품', '일정 협의', '월별 납품'][index],
    note: '서비스 이해를 위한 가상 예시입니다. 실제 후보와 거래 조건은 가입 승인 후 운영팀이 확인합니다.',
  }));
}
