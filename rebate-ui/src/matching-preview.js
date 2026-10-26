export const MATCH_CATEGORIES = [
  { value: 'box', label: '박스', detail: '택배·배송용 박스' },
  { value: 'packaging', label: '제품 패키징', detail: '단상자·선물 패키지' },
  { value: 'supplies', label: '부자재', detail: '완충재·쇼핑백·스티커' },
];

export const MATCH_REGIONS = [
  { value: 'all', label: '전국' },
  { value: 'capital', label: '서울·경기' },
  { value: 'chungcheong', label: '충청' },
  { value: 'gangwon', label: '강원' },
  { value: 'jeolla', label: '전라' },
  { value: 'gyeongsang', label: '경상' },
  { value: 'jeju', label: '제주' },
];

export const MATCH_CAPACITIES = [
  { value: '5000', label: '5천 개 이하' },
  { value: '30000', label: '3만 개 이하' },
  { value: '100000', label: '10만 개 이하' },
  { value: 'over', label: '10만 개 초과' },
];

const examples = [
  { region: 'capital', categories: ['box', 'packaging'], minimum: 500, volume: 3000, lead: '약 2~3주', strength: '소량 제작', note: '인쇄 사양 확인 필요', industry: '뷰티·생활용품', delivery: '월 1회 분할 납품' },
  { region: 'capital', categories: ['supplies', 'packaging'], minimum: 1000, volume: 12000, lead: '약 3~4주', strength: '인쇄·후가공', note: '별도 샘플 제작 필요', industry: '패션·라이프스타일', delivery: '창고 한 곳으로 납품' },
  { region: 'chungcheong', categories: ['box', 'supplies'], minimum: 2000, volume: 30000, lead: '약 2~4주', strength: '반복 대량 생산', note: '최소 제작 수량 확인', industry: '식품·리빙', delivery: '월 2회 분할 납품' },
  { region: 'chungcheong', categories: ['packaging', 'supplies'], minimum: 500, volume: 4000, lead: '약 3주', strength: '선물용 패키지', note: '소재별 견적 확인', industry: '디저트·선물', delivery: '행사 일정에 맞춰 납품' },
  { region: 'gangwon', categories: ['box', 'packaging'], minimum: 300, volume: 1500, lead: '약 2~3주', strength: '소량·다품종', note: '배송비 별도 확인', industry: '로컬 식품', delivery: '매장 한 곳으로 납품' },
  { region: 'gangwon', categories: ['supplies'], minimum: 1000, volume: 6000, lead: '약 2주', strength: '종이 부자재', note: '소재 두께 확인', industry: '리빙·생활용품', delivery: '물류창고로 납품' },
  { region: 'jeolla', categories: ['box', 'supplies'], minimum: 1000, volume: 8000, lead: '약 2~3주', strength: '배송용 패키징', note: '포장 내구성 확인', industry: '농식품·가공식품', delivery: '월 1회 정기 납품' },
  { region: 'jeolla', categories: ['packaging'], minimum: 500, volume: 2500, lead: '약 3~4주', strength: '제품 맞춤 제작', note: '디자인 파일 확인', industry: '뷰티·로컬 브랜드', delivery: '제품 출시 전 일괄 납품' },
  { region: 'gyeongsang', categories: ['box', 'packaging'], minimum: 3000, volume: 60000, lead: '약 3~4주', strength: '대량 생산', note: '생산 일정 협의 필요', industry: '생활용품·가전', delivery: '3PL 창고로 분할 납품' },
  { region: 'gyeongsang', categories: ['supplies', 'packaging'], minimum: 1000, volume: 18000, lead: '약 2~3주', strength: '다양한 후가공', note: '후가공 샘플 확인', industry: '패션·뷰티', delivery: '물류창고 두 곳으로 납품' },
  { region: 'jeju', categories: ['box', 'packaging', 'supplies'], minimum: 300, volume: 2000, lead: '약 3~4주', strength: '지역 내 납품', note: '자재 조달 일정 확인', industry: '로컬 브랜드', delivery: '제주 내 매장으로 납품' },
  { region: 'capital', categories: ['box', 'supplies'], minimum: 10000, volume: 150000, lead: '약 4~5주', strength: '정기 대량 생산', note: '분할 발주 협의 필요', industry: '대형 생활용품 브랜드', delivery: '주 단위 분할 납품' },
];

// All records are fictional; live matching must use an explicitly anonymous server response.
export function getMatchingPreview({ role, category, region, capacity }) {
  if (!['brand', 'supplier'].includes(role) || !MATCH_CATEGORIES.some(item => item.value === category) || !MATCH_REGIONS.some(item => item.value === region)) return [];
  if (role === 'supplier' && !MATCH_CAPACITIES.some(item => item.value === capacity)) return [];
  const limit = capacity === 'over' ? Infinity : Number(capacity);
  return examples
    .filter(item => item.categories.includes(category) && (region === 'all' || item.region === region) && (role === 'brand' || item.volume <= limit))
    .slice(0, 5)
    .map((item, index) => ({
      id: `demo-${role}-${category}-${item.region}-${examples.indexOf(item)}`,
      label: `${String.fromCharCode(65 + index)}${role === 'brand' ? '업체' : '브랜드'}`,
      region: MATCH_REGIONS.find(option => option.value === item.region).label,
      category: MATCH_CATEGORIES.find(option => option.value === category).label,
      title: role === 'brand' ? item.strength : item.industry,
      quantity: `${(role === 'brand' ? item.minimum : item.volume).toLocaleString('ko-KR')}개${role === 'brand' ? '부터' : ' / 월'}`,
      schedule: role === 'brand' ? item.lead : item.delivery,
      note: role === 'brand' ? item.note : '사양·납기·거래 조건 확인 필요',
      demo: true,
    }));
}
