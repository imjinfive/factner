import { normalizeOnboardingDraft, materialLabel, productInfo, selectedProductInfo, selectedProductOptions } from '../rebate-ui/src/bids/onboarding-data.js';
import { fail } from './http.js';

export function onboardingInput(value, role) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.role !== role || new TextEncoder().encode(JSON.stringify(value)).byteLength > 8192) {
    fail(400, '선택한 패키징 조건을 다시 확인해주세요.');
  }
  return normalizeOnboardingDraft(value);
}

export function memberOnboarding(row) {
  let onboarding = null;
  try { onboarding = onboardingInput(JSON.parse(row.onboarding_json || 'null'), row.role); } catch {}
  delete row.onboarding_json;
  return { ...row, onboarding };
}

export function onboardingRows(survey) {
  if (!survey) return [];
  return [
    ['제작 경험',survey.experience==='yes'?'있음':survey.experience==='no'?'처음':'미응답'],
    ['기존 불편',survey.complaints.join(' · ')],
    ['희망 품목',survey.role==='brand'?(selectedProductInfo(survey)?.name||materialLabel(survey.material)):survey.supplierProducts.map(id=>productInfo(id)?.name).filter(Boolean).join(' · ')],
    ...selectedProductOptions(survey).map(option=>[option.label,option.value]),
    ['수량',survey.quantity?`${Number(survey.quantity).toLocaleString('ko-KR')}개`:survey.quantityUnknown?'상담 후 결정':''],
    ['크기',survey.sizeUnknown?'상담 후 결정':[survey.width,survey.depth,survey.height].filter(Boolean).join(' × ')+(survey.width?` mm (${survey.sizeBasis==='product'?'내용물':'패키징'})`:'')],
    ['포장할 제품',survey.productUse],['희망 일정',survey.timing],
    ['희망 단가',survey.budget?`${Number(survey.budget).toLocaleString('ko-KR')}원`:survey.role==='brand'&&survey.budgetUnknown?'업체 제안 요청':''],
    ['제작 수량 범위',({small:'소량',medium:'중량',large:'대량',discuss:'협의 가능'})[survey.quantityRange]],
    ['제작 가능 시점',({now:'바로 가능',discuss:'협의 가능',later:'추후 가능'})[survey.availability]],
    ['희망 거래',survey.goals.join(' · ')],['관심 공고',survey.selectedPostId]
  ].filter(([,value])=>value);
}
