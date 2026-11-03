import { BID_TERMS } from '../shared/bid-terms.js';
import { designerNotice, isPackagingPartner } from '../shared/partner-roles.js';
import { reviewPartnerCards } from '../scripts/bid-seed.mjs';
import {marketExamples} from './market-examples.js';
import { body, fail, json, now, stmt, text } from './http.js';
import { approvedMarketMember } from './policy.js';
import { authorIdentity,reviewPost,validateAnonymous } from './market-review.js';

const categories = ['design', 'packaging'];
const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
function signature(input, version) {
  if (input.accepted !== true || input.version !== version) fail(409, '계약 조항과 버전을 확인하고 동의해주세요.');
  return text(input.signature, 80, true);
}
function contractStatus(row) {
  if (row.revealed_at) return 'revealed';
  return row.supplier_signed_at ? 'signed' : 'awaiting_supplier';
}

async function getState(env, user, live=false) {
  const admin = user?.kind === 'admin';
  const id = user?.id ?? '';
  const category = isPackagingPartner(user?.kind) ? 'packaging' : user?.kind==='design' ? 'design' : null;
  const awards=live?'market_connection_requests':'market_contracts';
  const postsQuery = stmt(env, `WITH brands AS (
    SELECT id, row_number() OVER (ORDER BY rowid) AS ordinal FROM market_accounts WHERE kind='brand'
  ) SELECT p.*, b.ordinal, EXISTS(SELECT 1 FROM ${awards} c WHERE c.post_id=p.id) awarded,
    (SELECT count(*) FROM market_offers o WHERE o.post_id=p.id) offer_count
    FROM market_posts p JOIN brands b ON b.id=p.brand_id
    WHERE (? IS NULL OR p.category=?) AND (p.review_status='approved' OR p.brand_id=?)
    ${live?`AND EXISTS(SELECT 1 FROM members m WHERE m.id=p.brand_id AND ${approvedMarketMember('m')})`:''}
    ORDER BY COALESCE(p.reviewed_at,p.created_at) DESC,p.id`, category, category,id);
  const eligibleOffers=live?` AND EXISTS(SELECT 1 FROM members b JOIN members s ON s.id=o.supplier_id WHERE b.id=p.brand_id
    AND ${approvedMarketMember('b')} AND ${approvedMarketMember('s')})`:'';
  const offersQuery = stmt(env, `SELECT o.* FROM market_offers o JOIN market_posts p ON p.id=o.post_id WHERE (?=1 OR p.brand_id=? OR o.supplier_id=?) AND (p.review_status='approved' OR p.brand_id=?)${eligibleOffers} ORDER BY o.created_at,o.id`, Number(admin), id, id,id);
  const historyTitle="CASE WHEN p.review_status='approved' OR p.brand_id=? THEN p.title ELSE '비공개 공고' END AS title";
  const contractsQuery = stmt(env, `SELECT c.*, p.category,${historyTitle},b.name brand_name,b.email brand_email,s.name supplier_name,s.email supplier_email FROM market_contracts c JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.id=c.offer_id JOIN market_accounts b ON b.id=p.brand_id JOIN market_accounts s ON s.id=o.supplier_id WHERE ?=1 OR p.brand_id=? OR o.supplier_id=? ORDER BY c.brand_signed_at DESC,c.id`,id, Number(admin), id, id);
  const paymentsQuery = stmt(env, 'SELECT m.* FROM market_payments m JOIN market_contracts c ON c.id=m.contract_id JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.id=c.offer_id WHERE ?=1 OR p.brand_id=? OR o.supplier_id=? ORDER BY m.created_at,m.id', Number(admin), id, id);
  const queries = [postsQuery, offersQuery];
  if(live){
    queries.push(stmt(env,`SELECT s.request_id,s.post_id,s.offer_id,s.quantity,s.unit_price,s.created_at,${historyTitle},r.status
      FROM market_connection_requests s JOIN market_posts p ON p.id=s.post_id JOIN market_offers o ON o.id=s.offer_id
      JOIN matching_requests r ON r.id=s.request_id WHERE p.brand_id=? OR o.supplier_id=? ORDER BY s.created_at DESC`,id,id,id));
    if(!user)queries.push(stmt(env,`SELECT c.rowid ordinal,c.profile FROM member_companies c JOIN members m ON m.id=c.member_id
      WHERE ${approvedMarketMember('m')} AND m.role='supplier' AND c.listed=1 ORDER BY c.rowid`));
  }else{
    queries.push(contractsQuery,paymentsQuery);
  }
  if (!live && !user) {
    const ids = Object.keys(reviewPartnerCards);
    queries.push(stmt(env, `SELECT id,kind FROM market_accounts WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY rowid`, ...ids));
  }
  const results=await env.DB.batch(queries);
  const [posts, offers]=results, contracts=live?{results:[]}:results[2], payments=live?{results:[]}:results[3];
  const publicAccounts=live?null:results[4];
  const paymentGroups = new Map();
  for (const payment of payments.results) {
    if (!paymentGroups.has(payment.contract_id)) paymentGroups.set(payment.contract_id, []);
    paymentGroups.get(payment.contract_id).push(paymentView(payment));
  }
  const state = {
    connections:live?results[2].results.map(c=>({id:c.request_id,postId:c.post_id,offerId:c.offer_id,title:c.title,
      quantity:c.quantity,unitPrice:c.unit_price,status:c.status,createdAt:c.created_at})):[],
    partners: (publicAccounts?.results ?? []).filter(a=>isPackagingPartner(a.kind)).map(a=>({...reviewPartnerCards[a.id],kind:a.kind})),
    posts: posts.results.map(p => ({ id:p.id, brandAlias:'브랜드 '+(p.ordinal<=26?String.fromCharCode(64+p.ordinal):p.ordinal), category:p.category, title:p.title, quantity:p.quantity, unitPrice:p.unit_price, size:p.size, description:p.description, deadline:p.deadline, createdAt:p.created_at, status:p.awarded?'awarded':'open', offerCount:p.offer_count, isMine:p.brand_id===id,reviewStatus:p.review_status,
      reviewedAt:p.reviewed_at,...(p.brand_id===id?{reviewVersion:p.review_version,reviewReason:p.review_reason}:{}) })),
    offers: offers.results.map(o => ({ id:o.id, postId:o.post_id, alias:o.alias.replace(/^입찰사 /, '제안사 '), tiers:JSON.parse(o.tiers), note:o.note, isMine:o.supplier_id===id })),
    contracts: contracts.results.map(c => ({
      id:c.id, postId:c.post_id, offerId:c.offer_id, category:c.category, title:c.title, status:contractStatus(c),
      quantity:c.quantity, unitPrice:c.unit_price, brandSignedAt:c.brand_signed_at, supplierSignedAt:c.supplier_signed_at,
      revealedAt:c.revealed_at, version:c.version, terms:JSON.parse(c.terms_json), payments:paymentGroups.get(c.id)??[],
      ...(admin || c.revealed_at ? { parties:{ brand:{ name:c.brand_name,email:c.brand_email }, supplier:{ name:c.supplier_name,email:c.supplier_email } } } : {})
    }))
  };
  if(live&&!user) {
    state.partners=results[3].results.map(raw=>{
      const p=JSON.parse(raw.profile),items=Array.isArray(p.categories)?p.categories.filter(c=>['box','packaging','supplies'].includes(c)):[];
      const quantity=Number.isSafeInteger(p.quantity)&&p.quantity>0&&p.quantity<=100000000?p.quantity:0;
      return {alias:(raw.ordinal<=26?String.fromCharCode(64+raw.ordinal):raw.ordinal)+'업체',kind:'packaging',items,
        title:'패키징 제작업체',description:quantity?'최소 제작 수량 '+quantity.toLocaleString('ko-KR')+'개':'수량 협의'};
    });
    if(!state.partners.length)state.partners=Object.values(reviewPartnerCards).map(p=>({...p,kind:'packaging',example:true}));
    state.posts=state.posts.filter(p=>p.status==='open'&&p.category==='packaging'&&p.deadline>=today());
    if(!state.posts.length)state.posts=await marketExamples(env);
  }
  return state;
}

function paymentView(row) {
  return { id:row.id, kind:row.kind, amount:row.amount, createdAt:row.created_at, simulated:true };
}
async function createPost(env, user, input,live) {
  if (user.kind !== 'brand') fail(403, '브랜드만 공고를 등록할 수 있습니다.');
  if (!categories.includes(input.category)) fail(400, '디자인 또는 패키징을 선택해주세요.');
  if (input.category==='design') fail(403,designerNotice);
  const title = text(input.title,100,true),size=text(input.size,160),description=text(input.description,2000,true);
  const identity=await authorIdentity(env,user,live);
  validateAnonymous([title,size,description].join(' '),identity);
  const { quantity, unitPrice } = quoteTier(input);
  const deadline = text(input.deadline, 10, true);
  const date = new Date(deadline + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10)!==deadline || deadline<today()) fail(400, '오늘 이후의 올바른 제안 마감일을 선택해주세요.');
  const id = crypto.randomUUID();
  const check=live?` WHERE EXISTS(SELECT 1 FROM members m WHERE m.id=? AND m.role='brand' AND ${approvedMarketMember('m')})`:'';
  const saved=await stmt(env, 'INSERT INTO market_posts(id,brand_id,category,title,quantity,unit_price,size,description,deadline,created_at) SELECT ?,?,?,?,?,?,?,?,?,?'+check, id,user.id,input.category,title,quantity,unitPrice,size,description,deadline,now(),...(live?[user.id]:[])).run();
  if(!saved.meta.changes)fail(409,'승인된 회원 상태를 다시 확인해주세요.');
  return json({ id,reviewStatus:'pending',reviewVersion:1 }, 201);
}

async function submitOffer(env, user, postId, input,live) {
  if (!isPackagingPartner(user.kind)) fail(403, '패키징 제작업체만 제안을 보낼 수 있습니다.');
  const post = await stmt(env, "SELECT category,deadline FROM market_posts WHERE id=? AND review_status='approved'", postId).first();
  if (!post) fail(404, '참여할 수 있는 공고가 아닙니다.');
  if (post.category==='design') fail(403,designerNotice);
  if (!Array.isArray(input.tiers) || !input.tiers.length || input.tiers.length>8) fail(400, '수량별 단가를 1~8개 입력해주세요.');
  const tiers = input.tiers.map(quoteTier).sort((a,b)=>a.quantity-b.quantity);
  if (new Set(tiers.map(t=>t.quantity)).size!==tiers.length) fail(400, '같은 수량은 한 번만 입력해주세요.');
  const note=text(input.note,1200);
  validateAnonymous(note,await authorIdentity(env,user,live));
  const id = crypto.randomUUID();
  const awards=live?'market_connection_requests':'market_contracts';
  const members=live?` AND EXISTS(SELECT 1 FROM members b JOIN members s ON s.id=? WHERE b.id=p.brand_id AND b.role='brand' AND ${approvedMarketMember('b')} AND s.role='supplier' AND ${approvedMarketMember('s')})`:'';
  const result = await stmt(env, `INSERT OR IGNORE INTO market_offers(id,post_id,supplier_id,alias,tiers,note,created_at)
    SELECT ?,p.id,?,(SELECT '제안사 ' || CASE WHEN count(*)<26 THEN char(65+count(*)) ELSE CAST(count(*)+1 AS TEXT) END FROM market_offers WHERE post_id=p.id),?,?,?
    FROM market_posts p WHERE p.id=? AND p.review_status='approved' AND p.deadline>=? AND NOT EXISTS(SELECT 1 FROM ${awards} a WHERE a.post_id=p.id)${members}`, id,user.id,JSON.stringify(tiers),note,now(),postId,today(),...(live?[user.id]:[])).run();
  if (!result.meta.changes) fail(409, '이미 제안을 보냈거나 마감·선정된 공고입니다.');
  return json({ id }, 201);
}

async function requestConnection(env,user,offerId,input) {
  if(user.kind!=='brand')fail(403,'공고를 등록한 브랜드만 연결을 요청할 수 있습니다.');
  if(input.accepted!==true)fail(400,'선택한 제안과 수량을 확인해주세요.');
  const offer=await stmt(env,`SELECT o.*,p.title FROM market_offers o JOIN market_posts p ON p.id=o.post_id
    WHERE o.id=? AND p.brand_id=? AND p.category='packaging'`,offerId,user.id).first();
  if(!offer)fail(404,'연결할 수 있는 제안을 찾지 못했습니다.');
  const tier=JSON.parse(offer.tiers).find(t=>t.quantity===input.quantity);
  if(!tier)fail(400,'제안된 수량 구간을 선택해주세요.');
  const id=crypto.randomUUID(),time=now();
  const snapshot=JSON.stringify({label:offer.alias,title:offer.title,category:'제품 패키징',quantity:tier.quantity+'개',note:'선정 단가 '+tier.unitPrice+'원'});
  await env.DB.batch([
    stmt(env,`INSERT OR IGNORE INTO market_connection_requests(post_id,offer_id,quantity,unit_price,request_id,created_at)
      SELECT o.post_id,o.id,?,?,COALESCE((SELECT id FROM matching_requests WHERE requester_id=p.brand_id AND target_id=o.supplier_id
        AND category='packaging' AND status IN ('pending','reviewing')),?),?
      FROM market_offers o JOIN market_posts p ON p.id=o.post_id JOIN members b ON b.id=p.brand_id JOIN members s ON s.id=o.supplier_id
      WHERE o.id=? AND b.id=? AND p.review_status='approved' AND b.role='brand' AND ${approvedMarketMember('b')} AND s.role='supplier' AND ${approvedMarketMember('s')}`,
      tier.quantity,tier.unitPrice,id,time,offerId,user.id),
    stmt(env,`INSERT INTO matching_requests(id,requester_id,target_id,category,capacity,snapshot,status,note,created_at,updated_at)
      SELECT ?,?,?,'packaging',?,?,CASE WHEN EXISTS(SELECT 1 FROM member_partners WHERE brand_id=? AND supplier_id=? AND status='active') THEN 'completed' ELSE 'pending' END,?,?,?
      WHERE EXISTS(SELECT 1 FROM market_connection_requests WHERE post_id=? AND request_id=?)`,
      id,user.id,offer.supplier_id,tier.quantity,snapshot,user.id,offer.supplier_id,'브랜드가 공고 제안 연결을 요청했습니다.',time,time,offer.post_id,id),
    stmt(env,`INSERT OR IGNORE INTO matching_request_events(id,request_id,actor,status,note,created_at)
      SELECT ?,r.id,'브랜드',r.status,?,? FROM matching_requests r JOIN market_connection_requests s ON s.request_id=r.id
      WHERE s.post_id=? AND s.offer_id=? AND s.quantity=?`,
      'bid-'+offer.post_id,offer.title+' · '+tier.quantity+'개 × '+tier.unitPrice+'원',time,offer.post_id,offerId,tier.quantity)
  ]);
  const chosen=await stmt(env,`SELECT s.offer_id,s.quantity,r.id,r.status FROM market_connection_requests s
    JOIN matching_requests r ON r.id=s.request_id WHERE s.post_id=?`,offer.post_id).first();
  if(!chosen||chosen.offer_id!==offerId||chosen.quantity!==tier.quantity)fail(409,'회원 상태가 변경되었거나 다른 조건으로 이미 연결을 요청했습니다.');
  return json({id:chosen.id,status:chosen.status,kind:'connection'},chosen.id===id?201:200);
}

async function selectOffer(env, user, offerId, input) {
  if (user.kind!=='brand') fail(403, '공고를 등록한 브랜드만 선택할 수 있습니다.');
  const offer = await stmt(env, 'SELECT o.*,p.category FROM market_offers o JOIN market_posts p ON p.id=o.post_id WHERE o.id=? AND p.brand_id=?', offerId,user.id).first();
  if (!offer) fail(404, '선택할 수 있는 제안을 찾지 못했습니다.');
  if (offer.category==='design') fail(403,designerNotice);
  const tier = JSON.parse(offer.tiers).find(t=>t.quantity===input.quantity);
  if (!tier) fail(400, '제안된 수량 구간을 선택해주세요.');
  if (input.version === BID_TERMS.version) {
    const signed = signature(input, BID_TERMS.version);
    const id = crypto.randomUUID();
    const result = await stmt(env, "INSERT OR IGNORE INTO market_contracts(id,post_id,offer_id,quantity,unit_price,version,terms_json,brand_signature,brand_signed_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM market_posts WHERE id=? AND review_status='approved')", id,offer.post_id,offerId,tier.quantity,tier.unitPrice,BID_TERMS.version,JSON.stringify(BID_TERMS),signed,now(),offer.post_id).run();
    if (result.meta.changes) return json({ id, status:'awaiting_supplier' }, 201);
  }
  // A lost response can be retried even after the public terms change or the supplier signs.
  const existing = await stmt(env, 'SELECT * FROM market_contracts WHERE post_id=?', offer.post_id).first();
  if (!existing) fail(409, '현재 계약 조항과 버전을 확인해주세요.');
  const signed = signature(input, existing.version);
  if (existing.offer_id!==offerId || existing.quantity!==tier.quantity || existing.unit_price!==tier.unitPrice || existing.brand_signature!==signed) {
    fail(409, '다른 조건이나 서명으로 이미 제안을 선택했습니다.');
  }
  return json({ id:existing.id, status:contractStatus(existing) });
}

async function contractFor(env, user, id) {
  const row = await stmt(env, 'SELECT c.*,p.brand_id,p.category,o.supplier_id FROM market_contracts c JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.id=c.offer_id WHERE c.id=? AND (?=1 OR o.supplier_id=? OR p.brand_id=?)', id,Number(user.kind==='admin'),user.id,user.id).first();
  if (!row) fail(404, '계약을 찾을 수 없습니다.');
  return row;
}
async function signContract(env, user, contract, input) {
  if (user.id!==contract.supplier_id || !isPackagingPartner(user.kind)) fail(403, '선정된 업체만 서명할 수 있습니다.');
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

export async function marketApi(req, env, url, user, {live=false}={}) {
  const path = url.pathname;
  if (req.method==='GET' && path==='/api/bid/state') return json(await getState(env, user,live));
  if (user?.kind==='design') fail(403, designerNotice);
  if (req.method!=='POST') fail(404, '요청한 기능을 찾지 못했습니다.');
  if (!user) fail(401, '로그인이 필요합니다.');
  if(live && path.startsWith('/api/bid/contracts/'))fail(403,'서명·실명 공개·결제는 이 서비스에서 제공되지 않습니다.');
  const input = await body(req);
  if (path==='/api/bid/posts') return createPost(env,user,input,live);
  const withdraw=path.match(/^\/api\/bid\/posts\/([\w-]+)\/withdraw$/);
  if(withdraw)return reviewPost(env,user,withdraw[1],input,{live});
  const offer = path.match(/^\/api\/bid\/posts\/([\w-]+)\/offers$/);
  if (offer) return submitOffer(env,user,offer[1],input,live);
  const select = path.match(/^\/api\/bid\/offers\/([\w-]+)\/select$/);
  if (select) return live?requestConnection(env,user,select[1],input):selectOffer(env,user,select[1],input);
  const action = path.match(/^\/api\/bid\/contracts\/([\w-]+)\/(sign|reveal|pay)$/);
  if (!action) fail(404, '요청한 기능을 찾지 못했습니다.');
  const contract = await contractFor(env,user,action[1]);
  if (contract.category==='design') fail(403,designerNotice);
  if (action[2]==='sign') return signContract(env,user,contract,input);
  if (action[2]==='reveal') return revealContract(env,user,contract,input);
  return recordPayment(env,user,contract,input);
}
