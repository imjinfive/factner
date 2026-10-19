export const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers:{'Cache-Control':'no-store', ...headers}});
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };
export const now = () => new Date().toISOString();
export const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
export async function body(req, maxBytes = 20000) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON 형식으로 보내주세요.');
  // Bound the stream before parsing; Content-Length can be absent or misleading.
  const reader = req.body?.getReader();
  if (!reader) fail(400, '내용이 비어 있습니다.');
  let size = 0, chunks = [];
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); fail(413, '입력 내용이 너무 큽니다.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, '입력 내용을 확인해주세요.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object') fail(400, '입력 내용을 확인해주세요.');
  return data;
}
export function text(value, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, '필수 입력 또는 글자 수를 확인해주세요.');
  return value.trim();
}
export async function rate(env, key, limit, seconds) {
  const t = Math.floor(Date.now() / 1000);
  const row = await stmt(env, `INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count`, key, t + seconds, t, t).first();
  if (row.count > limit) fail(429, '잠시 후 다시 시도해주세요.');
}
