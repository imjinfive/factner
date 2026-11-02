import { BID_TERMS } from '../shared/bid-terms.js';
import { body, fail, json, now, stmt, text } from './http.js';

const categories = ['design', 'packaging'];
const supplierKind = kind => kind === 'both' || categories.includes(kind);
const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const canOffer = (user, category) => user.kind === 'both' || user.kind === category;

function integer(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(400, label + '을 확인해주세요.');
  return value;
}
function quoteTier(input) {
  const quantity = integer(input?.quantity, 100000000, '수량');
  const unitPrice = integer(input?.unitPrice, 1000000000, '단가');
  if (quantity * unitPrice > 1000000000000) fail(400, '수량과 단가를 확인해주세요.');
  return { quantity, unitPrice };
}
function anonymousText(value, length, user, required = false) {
  const clean = text(value, length, required);
  const normalized = clean.normalize('NFKC');
  const contact = /@|(?:https?:\/\/|www\.|카카오톡|카톡\s*(?:ID|아이디)|오픈채팅)|\b(?:[a-z0-9-]+\.)+(?:com|net|org|kr|io|co)\b|(?:\+82[\s().-]*)?0?(?:1[016789]|2|[3-6]\d|70)[\s().-]*\d{3,4}[\s().-]*\d{4}(?!\d)/i;
  const fold = s => s.normalize('NFKC').toLowerCase().replace(/\s/g, '');
  if (contact.test(normalized) || (user.name && fold(clean).includes(fold(user.name)))) {
    fail(400, '익명 게시물에는 이름·업체명·연락처·링크를 넣을 수 없습니다.');
  }
  return clean;
}
function signature(input, version) {
  if (input.accepted !== true || input.version !== version) fail(409, '계약 조항과 버전을 확인하고 동의해주세요.');
  return text(input.signature, 80, true);
}
function contractStatus(row) {
  if (row.revealed_at) return 'revealed';
  return row.supplier_signed_at ? 'signed' : 'awaiting_supplier';
}

async function getState(env, user) {
  const admin = user?.kind === 'admin';
  const id = user?.id ?? '';
  const postsQuery = stmt(env, "SELECT p.*, EXISTS(SELECT 1 FROM market_contracts c WHERE c.post_id=p.id) awarded, (SELECT count(*) FROM market_offers o WHERE o.post_id=p.id) offer_count FROM market_posts p WHERE (? NOT IN ('design','packaging') OR category=?) ORDER BY created_at DESC,id", user?.kind ?? '', user?.kind ?? '');
  const offersQuery = stmt(env, 'SELECT o.* FROM market_offers o JOIN market_posts p ON p.id=o.post_id WHERE ?=1 OR p.brand_id=? OR o.supplier_id=? ORDER BY o.created_at,o.id', Number(admin), id, id);
  const contractsQuery = stmt(env, 'SELECT c.*, b.name brand_name,b.email brand_email,s.name supplier_name,s.email supplier_email FROM market_contracts c JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.id=c.offer_id JOIN market_accounts b ON b.id=p.brand_id JOIN market_accounts s ON s.id=o.supplier_id WHERE ?=1 OR p.brand_id=? OR o.supplier_id=? ORDER BY c.brand_signed_at DESC,c.id', Number(admin), id, id);
  const paymentsQuery = stmt(env, 'SELECT m.* FROM market_payments m JOIN market_contracts c ON c.id=m.contract_id JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.id=c.offer_id WHERE ?=1 OR p.brand_id=? OR o.supplier_id=? ORDER BY m.created_at,m.id', Number(admin), id, id);
  const [posts, offers, contracts, payments] = await env.DB.batch([postsQuery, offersQuery, contractsQuery, paymentsQuery]);
  const paymentGroups = new Map();
  for (const payment of payments.results) {
    if (!paymentGroups.has(payment.contract_id)) paymentGroups.set(payment.contract_id, []);
    paymentGroups.get(payment.contract_id).push(paymentView(payment));
  }
  return {
    posts: posts.results.map(p => ({ id:p.id, category:p.category, title:p.title, quantity:p.quantity, unitPrice:p.unit_price, size:p.size, description:p.description, deadline:p.deadline, createdAt:p.created_at, status:p.awarded?'awarded':'open', offerCount:p.offer_count, isMine:p.brand_id===id })),
    offers: offers.results.map(o => ({ id:o.id, postId:o.post_id, alias:o.alias, tiers:JSON.parse(o.tiers), note:o.note, isMine:o.supplier_id===id })),
    contracts: contracts.results.map(c => ({
      id:c.id, postId:c.post_id, offerId:c.offer_id, status:contractStatus(c),
      quantity:c.quantity, unitPrice:c.unit_price, brandSignedAt:c.brand_signed_at, supplierSignedAt:c.supplier_signed_at,
      revealedAt:c.revealed_at, version:c.version, terms:JSON.parse(c.terms_json), payments:paymentGroups.get(c.id)??[],
      ...(admin || c.revealed_at ? { parties:{ brand:{ name:c.brand_name,email:c.brand_email }, supplier:{ name:c.supplier_name,email:c.supplier_email } } } : {})
    }))
  };
}

function paymentView(row) {
  return { id:row.id, kind:row.kind, amount:row.amount, createdAt:row.created_at, simulated:true };
}
async function createPost(env, user, input) {
  if (user.kind !== 'brand') fail(403, '브랜드만 공고를 등록할 수 있습니다.');
  if (!categories.includes(input.category)) fail(400, '디자인 또는 패키징을 선택해주세요.');
  const title = anonymousText(input.title, 100, user, true);
  const size = anonymousText(input.size, 160, user);
  const description = anonymousText(input.description, 2000, user, true);
  const { quantity, unitPrice } = quoteTier(input);
  const deadline = text(input.deadline, 10, true);
  const date = new Date(deadline + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10)!==deadline || deadline<today()) fail(400, '오늘 이후의 올바른 입찰 마감일을 선택해주세요.');
  const id = crypto.randomUUID();
  await stmt(env, 'INSERT INTO market_posts(id,brand_id,category,title,quantity,unit_price,size,description,deadline,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id,user.id,input.category,title,quantity,unitPrice,size,description,deadline,now()).run();
  return json({ id }, 201);
}

async function submitOffer(env, user, postId, input) {
  if (!supplierKind(user.kind)) fail(403, '업체만 입찰할 수 있습니다.');
  const post = await stmt(env, 'SELECT category,deadline FROM market_posts WHERE id=?', postId).first();
  if (!post || !canOffer(user, post.category)) fail(404, '참여할 수 있는 공고가 아닙니다.');
  if (!Array.isArray(input.tiers) || !input.tiers.length || input.tiers.length>8) fail(400, '수량별 단가를 1~8개 입력해주세요.');
  const tiers = input.tiers.map(quoteTier).sort((a,b)=>a.quantity-b.quantity);
  if (new Set(tiers.map(t=>t.quantity)).size!==tiers.length) fail(400, '같은 수량은 한 번만 입력해주세요.');
  const note = anonymousText(input.note, 1200, user);
  const id = crypto.randomUUID();
  const result = await stmt(env, "INSERT OR IGNORE INTO market_offers(id,post_id,supplier_id,alias,tiers,note,created_at) SELECT ?,p.id,?,(SELECT '입찰사 ' || CASE WHEN count(*)<26 THEN char(65+count(*)) ELSE CAST(count(*)+1 AS TEXT) END FROM market_offers WHERE post_id=p.id),?,?,? FROM market_posts p WHERE p.id=? AND p.deadline>=? AND NOT EXISTS(SELECT 1 FROM market_contracts c WHERE c.post_id=p.id)", id,user.id,JSON.stringify(tiers),note,now(),postId,today()).run();
  if (!result.meta.changes) fail(409, '이미 입찰했거나 마감·선정된 공고입니다.');
  return json({ id }, 201);
}

async function selectOffer(env, user, offerId, input) {
  if (user.kind!=='brand') fail(403, '공고를 등록한 브랜드만 선택할 수 있습니다.');
  const offer = await stmt(env, 'SELECT o.* FROM market_offers o JOIN market_posts p ON p.id=o.post_id WHERE o.id=? AND p.brand_id=?', offerId,user.id).first();
  if (!offer) fail(404, '선택 가능한 입찰을 찾을 수 없습니다.');
  const tier = JSON.parse(offer.tiers).find(t=>t.quantity===input.quantity);
  if (!tier) fail(400, '제안된 수량 구간을 선택해주세요.');
  if (input.version === BID_TERMS.version) {
    const signed = signature(input, BID_TERMS.version);
    const id = crypto.randomUUID();
    const result = await stmt(env, 'INSERT OR IGNORE INTO market_contracts(id,post_id,offer_id,quantity,unit_price,version,terms_json,brand_signature,brand_signed_at) VALUES(?,?,?,?,?,?,?,?,?)', id,offer.post_id,offerId,tier.quantity,tier.unitPrice,BID_TERMS.version,JSON.stringify(BID_TERMS),signed,now()).run();
    if (result.meta.changes) return json({ id, status:'awaiting_supplier' }, 201);
  }
  // A lost response can be retried even after the public terms change or the supplier signs.
  const existing = await stmt(env, 'SELECT * FROM market_contracts WHERE post_id=?', offer.post_id).first();
  if (!existing) fail(409, '현재 계약 조항과 버전을 확인해주세요.');
  const signed = signature(input, existing.version);
  if (existing.offer_id!==offerId || existing.quantity!==tier.quantity || existing.unit_price!==tier.unitPrice || existing.brand_signature!==signed) {
    fail(409, '다른 조건이나 서명으로 이미 입찰을 선택했습니다.');
  }
  return json({ id:existing.id, status:contractStatus(existing) });
}

async function contractFor(env, user, id) {
  const row = await stmt(env, 'SELECT c.*,p.brand_id,o.supplier_id FROM market_contracts c JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.id=c.offer_id WHERE c.id=? AND (?=1 OR o.supplier_id=? OR p.brand_id=?)', id,Number(user.kind==='admin'),user.id,user.id).first();
  if (!row) fail(404, '계약을 찾을 수 없습니다.');
  return row;
}
async function signContract(env, user, contract, input) {
  if (user.id!==contract.supplier_id || !supplierKind(user.kind)) fail(403, '선정된 업체만 서명할 수 있습니다.');
  const signed = signature(input, contract.version);
  const result = await stmt(env, 'UPDATE market_contracts SET supplier_signature=?,supplier_signed_at=? WHERE id=? AND supplier_signed_at IS NULL', signed,now(),contract.id).run();
  if (result.meta.changes) return json({ id:contract.id, status:'signed' });
  const existing = await stmt(env, 'SELECT supplier_signature,supplier_signed_at,revealed_at FROM market_contracts WHERE id=?', contract.id).first();
  if (existing.supplier_signature!==signed) fail(409, '다른 서명으로 이미 확정된 계약입니다.');
  return json({ id:contract.id, status:contractStatus(existing) });
}
async function revealContract(env, user, contract, input) {
  if (user.kind!=='admin') fail(403, '관리자만 당사자 정보를 공개할 수 있습니다.');
  if (input.accepted!==true) fail(400, '당사자 정보 공개를 확인해주세요.');
  const result = await stmt(env, 'UPDATE market_contracts SET revealed_at=?,revealed_by=? WHERE id=? AND supplier_signed_at IS NOT NULL AND revealed_at IS NULL', now(),user.id,contract.id).run();
  if (!result.meta.changes && !contract.revealed_at) fail(409, '양측 서명을 먼저 확인해주세요.');
  return json({ id:contract.id });
}
async function recordPayment(env, user, contract, input) {
  if (user.kind!=='brand' || user.id!==contract.brand_id) fail(403, '해당 브랜드만 모의 결제를 기록할 수 있습니다.');
  if (String(env.BID_DEMO)!=='true' && String(env.BID_DEMO)!=='1') fail(403, '모의 결제는 테스트 환경에서만 가능합니다.');
  if (!contract.revealed_at) fail(409, '당사자 정보 공개 후에 모의 결제할 수 있습니다.');
  if (!['production','sample'].includes(input.kind)) fail(400, '결제 종류를 확인해주세요.');
  const amount = input.kind==='production' ? contract.quantity*contract.unit_price : integer(input.amount,1000000000000,'샘플 금액');
  if (input.kind==='production' && input.amount!==undefined && input.amount!==amount) fail(400, '본제작 금액은 계약 수량과 단가로 산정합니다.');
  const result = await stmt(env, 'INSERT OR IGNORE INTO market_payments(id,contract_id,kind,amount,created_at) VALUES(?,?,?,?,?)', crypto.randomUUID(),contract.id,input.kind,amount,now()).run();
  const row = await stmt(env, 'SELECT * FROM market_payments WHERE contract_id=? AND kind=?', contract.id,input.kind).first();
  if (row.amount!==amount) fail(409, '같은 종류로 기록된 결제 금액이 다릅니다.');
  return json(paymentView(row), result.meta.changes ? 201 : 200);
}

export async function marketApi(req, env, url, user) {
  const path = url.pathname;
  if (req.method==='GET' && path==='/api/bid/state') return json(await getState(env, user));
  if (req.method!=='POST') fail(404, '없는 입찰 기능입니다.');
  if (!user) fail(401, '로그인이 필요합니다.');
  const input = await body(req);
  if (path==='/api/bid/posts') return createPost(env,user,input);
  const offer = path.match(/^\/api\/bid\/posts\/([\w-]+)\/offers$/);
  if (offer) return submitOffer(env,user,offer[1],input);
  const select = path.match(/^\/api\/bid\/offers\/([\w-]+)\/select$/);
  if (select) return selectOffer(env,user,select[1],input);
  const action = path.match(/^\/api\/bid\/contracts\/([\w-]+)\/(sign|reveal|pay)$/);
  if (!action) fail(404, '없는 입찰 기능입니다.');
  const contract = await contractFor(env,user,action[1]);
  if (action[2]==='sign') return signContract(env,user,contract,input);
  if (action[2]==='reveal') return revealContract(env,user,contract,input);
  return recordPayment(env,user,contract,input);
}
