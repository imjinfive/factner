export function positiveInteger(value, max, label) {
  const typed = String(value).trim();
  const parsed = Number(typed.replaceAll(',', ''));
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(typed) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${label}은 1부터 ${max.toLocaleString('ko-KR')}까지 숫자로 입력해 주세요.`);
  }
  return parsed;
}

export function packagingSize({ width = '', depth = '', height = '' }) {
  const dimensions = [width, depth, height].map(value => String(value).trim());
  if (dimensions.every(value => !value)) return '';
  if (!dimensions[0] || !dimensions[1]) throw new Error('규격의 가로와 세로를 함께 입력해 주세요. 높이는 선택입니다.');
  const values = dimensions.filter(Boolean).map(value => {
    const parsed = Number(value);
    if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(parsed) || parsed <= 0 || parsed > 1000000) {
      throw new Error('규격은 0보다 크고 1,000,000mm 이하인 숫자로 입력해 주세요.');
    }
    return parsed;
  });
  return values.join(' × ') + ' mm';
}
