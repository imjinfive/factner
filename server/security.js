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
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function unbase32(value) {
  let bits = 0, buffer = 0; const bytes = [];
  for (const char of value) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid authenticator secret');
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(bytes);
}
export const newTotpSecret = () => base32(crypto.getRandomValues(new Uint8Array(20)));
// RFC 6238 / RFC 4226: 30-second steps, SHA-1 HMAC, six digits for authenticator compatibility.
export async function totp(secret, milliseconds = Date.now(), digits = 6) {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(milliseconds / 30000)));
  const key = await crypto.subtle.importKey('raw', unbase32(secret), {name:'HMAC',hash:'SHA-1'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = mac[mac.length - 1] & 15;
  const value = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
  return String(value % (10 ** digits)).padStart(digits, '0');
}
export async function totpStep(secret, code, lastStep = -1, milliseconds = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(milliseconds / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && step >= 0 && safeEqual(await totp(secret, step * 30000), code)) return step;
  }
  return null;
}
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g) || [], byte => parseInt(byte, 16));
async function mfaKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('MFA_ENCRYPTION_KEY must contain 32 random bytes as hex');
  return crypto.subtle.importKey('raw', unhex(value), 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function sealSecret(secret, key, adminId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(adminId)}, await mfaKey(key), enc.encode(secret));
  return `v1:${hex(iv)}:${hex(new Uint8Array(data))}`;
}
export async function openSecret(value, key, adminId) {
  const [version, iv, data] = value.split(':');
  if (version !== 'v1' || !/^[a-f0-9]{24}$/.test(iv || '') || !/^(?:[a-f0-9]{2}){17,}$/.test(data || '')) throw new Error('Invalid encrypted authenticator secret');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(iv),additionalData:enc.encode(adminId)}, await mfaKey(key), unhex(data)));
}
