// All businesses, reviews and production conditions are fictional UI samples.
export const categories = [
  "전체",
  "단상자",
  "택배박스",
  "싸바리박스",
  "쇼핑백",
  "포장·부자재",
];
export const suppliers = [
  {
    id: "paper",
    name: "페이퍼그린",
    categories: ["단상자", "쇼핑백"],
    area: "경기 파주",
    moq: 500,
    days: 14,
    rating: 4.9,
    reviews: 28,
    tier: "플래티넘",
    visit: true,
    image: 0,
    tags: ["뷰티 패키징", "친환경 용지", "박·형압"],
    description:
      "뷰티·라이프스타일 브랜드의 단상자와 쇼핑백을 제작합니다.",
    material: "SC마닐라 / 친환경 종이",
    finish: "무광 코팅, 금박, 형압",
    review: "종이 질감과 인쇄 색상을 샘플로 비교할 수 있어서 선택이 쉬웠어요.",
  },
  {
    id: "box",
    name: "박스온",
    categories: ["택배박스", "포장·부자재"],
    area: "경기 화성",
    moq: 100,
    days: 7,
    rating: 4.8,
    reviews: 42,
    tier: "골드",
    visit: true,
    image: 1,
    tags: ["소량 제작", "골판지", "빠른 제작"],
    description:
      "택배박스와 완충재를 소량부터 정기 발주까지 제작합니다.",
    material: "골판지 E골 / B골",
    finish: "1~2도 인쇄, 맞춤 타공",
    review: "처음 주문하는 소량 제작이었는데 규격을 같이 확인해줘서 좋았어요.",
  },
  {
    id: "form",
    name: "폼앤박스",
    categories: ["싸바리박스", "쇼핑백"],
    area: "서울 성동",
    moq: 300,
    days: 21,
    rating: 4.9,
    reviews: 19,
    tier: "플래티넘",
    visit: true,
    image: 2,
    tags: ["선물 패키징", "맞춤 구조", "프리미엄 마감"],
    description:
      "선물 세트·한정판 제품용 싸바리박스와 쇼핑백을 제작합니다.",
    material: "하드보드 / 특수지",
    finish: "싸바리, 리본, 자석 여닫이",
    review:
      "샘플을 보고 내부 구조를 수정했어요. 제품이 안정적으로 고정돼 만족해요.",
  },
  {
    id: "daily",
    name: "데일리페이퍼",
    categories: ["포장·부자재", "단상자"],
    area: "경기 고양",
    moq: 200,
    days: 10,
    rating: 4.7,
    reviews: 12,
    tier: "실버",
    visit: false,
    image: 0,
    tags: ["스티커", "띠지", "완충 포장"],
    description:
      "스티커, 띠지, 단상자 등 종이 패키징과 부자재를 제작합니다.",
    material: "크라프트 / 아트지",
    finish: "스티커, 띠지, 접지",
    review: "필요한 부자재를 묶어서 상담할 수 있어 편했어요.",
  },
];

export function filterSuppliers(
  items,
  {
    category = "전체",
    query = "",
    visitedOnly = false,
    smallOnly = false,
    sort = "추천순",
  } = {},
) {
  const term = query.trim().toLocaleLowerCase();
  const result = items.filter(
    (s) =>
      (category === "전체" || s.categories.includes(category)) &&
      (!visitedOnly || s.visit) &&
      (!smallOnly || s.moq <= 300) &&
      (!term ||
        [s.name, s.area, ...s.categories, ...s.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term)),
  );
  if (sort === "리뷰 많은 순") result.sort((a, b) => b.reviews - a.reviews);
  if (sort === "최소 수량 낮은 순") result.sort((a, b) => a.moq - b.moq);
  return result;
}

// Membership priority is applied only after category, quantity and lead-time eligibility.
export function eligibleSuppliers(
  items,
  { category, quantity, days = Infinity },
) {
  if (
    !Number.isSafeInteger(Number(quantity)) ||
    Number(quantity) < 1 ||
    days < 1
  )
    return [];
  const rank = { 플래티넘: 0, 골드: 1, 실버: 2 };
  return items
    .filter(
      (s) =>
        s.visit &&
        s.categories.includes(category) &&
        s.moq <= Number(quantity) &&
        s.days <= days,
    )
    .sort((a, b) => rank[a.tier] - rank[b.tier]);
}

export function validateRequest(form) {
  const errors = {};
  if (!categories.slice(1).includes(form.category))
    errors.category = "필요한 패키징을 선택해주세요.";
  if (!form.brand?.trim()) errors.brand = "브랜드 이름을 입력해주세요.";
  const qty = Number(form.quantity);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10000000)
    errors.quantity = "1~10,000,000 사이의 정수로 입력해주세요.";
  if (!form.description?.trim())
    errors.description = "제품과 원하는 패키징을 간단히 알려주세요.";
  return errors;
}

export function readSaved(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(value)) return fallback;
    if (key === "rebate:favorites")
      return value.filter((id) => suppliers.some((s) => s.id === id));
    if (key === "factner:requests")
      return value.filter(r => r && /^[a-f0-9-]{36}$/.test(r.id) && /^[a-f0-9]{64}$/.test(r.receiptToken) && typeof r.brand === "string" && typeof r.category === "string" && Number.isSafeInteger(Number(r.quantity)) && Number(r.quantity)>0 && Number.isFinite(Date.parse(r.createdAt)));
    if (key === "rebate:requests")
      return value.filter(
        (r) =>
          r &&
          typeof r.id === "string" &&
          typeof r.brand === "string" &&
          typeof r.category === "string" &&
          typeof r.createdAt === "string" &&
          Number.isFinite(Date.parse(r.createdAt)) &&
          Number.isSafeInteger(Number(r.quantity)) &&
          Number(r.quantity) > 0 &&
          typeof r.description === 'string' &&
          (!r.supplier || typeof r.supplier === 'string') &&
          (!r.size || typeof r.size === 'string') &&
          (!r.deadline || typeof r.deadline === 'string'),
      );
    return fallback;
  } catch {
    return fallback;
  }
}
