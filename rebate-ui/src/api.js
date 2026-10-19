export const quoteStatuses = {received:'접수',reviewing:'검토 중',consulting:'상담 중',quoted:'견적 안내',completed:'완료',cancelled:'취소',expired:'조회 불가'};
export async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { ...options, headers:{'Content-Type':'application/json',...options.headers} });
  let result;
  try { result = await response.json(); } catch { throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
  if (!response.ok) throw Object.assign(new Error(result.error || '요청을 처리하지 못했습니다.'), {status:response.status});
  return result;
}
export function makeReceipt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
}
