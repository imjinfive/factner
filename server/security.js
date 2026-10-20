const enc = new TextEncoder();
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
// Workers WebCrypto supports up to 100,000 PBKDF2 iterations. Each password has a random 256-bit salt.
export async function passwordHash(password, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:enc.encode(salt), iterations:100000}, key, 256);
  return `${salt}:${Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('')}`;
}
export async function verifyPassword(password, stored) {
  return safeEqual(await passwordHash(password, stored.split(':')[0]), stored);
}
export function credentials(body) {
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username)) throw new Error('아이디는 영문 소문자·숫자·._-로 3~40자 입력해주세요.');
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new Error('비밀번호는 12~128자로 입력해주세요.');
  return {username, password:body.password};
}
