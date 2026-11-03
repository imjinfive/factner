import { retireOriginalRoomPosts, insertReviewFixtures } from '../scripts/bid-seed.mjs';
import { bidApi, roomDatabase } from './bid-auth.js';
import { HttpError, json } from './http.js';
import {isolatedPostReview} from './room-post-review.js';

const lifetime = 7 * 24 * 60 * 60 * 1000;

function roomEnvironment(storage) {
  const sql = storage.sql;
  function statement(query, args = []) {
    const rows = () => sql.exec(query, ...args).toArray();
    return {
      bind: (...values) => statement(query, values),
      first: () => rows()[0] ?? null,
      all: () => ({ results: rows() }),
      run() {
        const results = rows();
        const changes = /^\s*SELECT\b/i.test(query) ? 0 : sql.exec('SELECT changes() AS n').one().n;
        return { results, meta: { changes } };
      }
    };
  }
  const DB = {
    prepare: statement,
    batch: statements => storage.transactionSync(() => statements.map(item => item.run()))
  };
  return Object.freeze({ DB, [roomDatabase]: DB, BID_DEMO: '1' });
}

export class BidRoom {
  #ctx;
  #schema;
  #reviewSchema;
  #offerSchema;
  #agreementSchema;
  #env;
  #ready = null;

  constructor(ctx, schema, reviewSchema, offerSchema, agreementSchema) {
    this.#ctx = ctx;
    this.#schema = schema;
    this.#reviewSchema = reviewSchema;
    this.#offerSchema = offerSchema;
    this.#agreementSchema = agreementSchema;
    this.#env = roomEnvironment(ctx.storage);
  }

  #initialize(canCreate) {
    if (this.#ready) return this.#ready;
    if(!canCreate && !this.#ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='review_room'").toArray().length)return null;
    this.#ready = this.#ctx.blockConcurrencyWhile(async () => {
      const storage = this.#ctx.storage, sql = storage.sql;
      const expiresAt = storage.transactionSync(() => {
        sql.exec('CREATE TABLE IF NOT EXISTS review_room (id INTEGER PRIMARY KEY CHECK(id=1), expires_at INTEGER NOT NULL)');
        const existing = sql.exec('SELECT expires_at FROM review_room WHERE id=1').toArray()[0];
        const prepare=query=>(...args)=>sql.exec(query,...args);
        const migrateSubmissions=()=>{
          if(!sql.exec('PRAGMA table_info(market_offers)').toArray().some(row=>row.name==='review_status'))sql.exec(this.#offerSchema);
          if(!sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='submission_agreements'").toArray().length)sql.exec(this.#agreementSchema);
        };
        if (existing) {
          if(!sql.exec('PRAGMA table_info(market_posts)').toArray().some(row=>row.name==='review_status')){
            sql.exec(this.#reviewSchema);
          }
          migrateSubmissions();
          retireOriginalRoomPosts(prepare,existing.expires_at-lifetime);
          return existing.expires_at;
        }
        const start = Date.now();
        sql.exec(this.#schema);
        sql.exec(this.#reviewSchema);
        migrateSubmissions();
        sql.exec('CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
        insertReviewFixtures(prepare);
        sql.exec('INSERT INTO review_room(id,expires_at) VALUES(1,?)', start + lifetime);
        return start + lifetime;
      });
      if (await storage.getAlarm() !== expiresAt) await storage.setAlarm(expiresAt);
      return expiresAt;
    });
    return this.#ready;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const internal=url.origin==='https://factner-review.internal'&&url.pathname.startsWith('/internal/post-review/');
    if (!internal&&(!url.pathname.startsWith('/api/bid/') || ['/api/bid/events','/api/bid/preview-register'].includes(url.pathname))) return json({ error: '없는 경로입니다.' }, 404);
    if (req.method !== 'GET' && req.method !== 'POST') return json({ error: '허용되지 않은 요청입니다.' }, 405);
    if (req.method === 'POST' && req.headers.get('Origin') !== url.origin) return json({ error: '허용되지 않은 출처입니다.' }, 403);
    const creating=req.method==='POST' && url.pathname==='/api/bid/login';
    const expiry=await this.#initialize(creating);
    if(internal&&(expiry===null||Date.now()>=expiry))return json({error:'공유한 공고를 찾을 수 없습니다.'},404);
    if(expiry===null)return json({error:'다시 로그인해주세요.'},401);
    if (Date.now() >= expiry) return json({ error: '시안 이용 기간이 끝났습니다.' }, 410);
    try {
      if(internal)return await isolatedPostReview(req,this.#env);
      return await bidApi(req, this.#env, url);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      throw error;
    }
  }

  async alarm() {
    await this.#ctx.blockConcurrencyWhile(async () => {
      await this.#ctx.storage.deleteAll();
      this.#ready = null;
    });
  }
}
