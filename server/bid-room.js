import { insertReviewFixtures } from '../scripts/bid-seed.mjs';
import { bidApi, roomDatabase } from './bid-auth.js';
import { HttpError, json } from './http.js';

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
  #env;
  #ready = null;

  constructor(ctx, schema) {
    this.#ctx = ctx;
    this.#schema = schema;
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
        if (existing) return existing.expires_at;
        const start = Date.now();
        sql.exec(this.#schema);
        sql.exec('CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
        insertReviewFixtures(query => (...args) => sql.exec(query, ...args), start);
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
    if (!url.pathname.startsWith('/api/bid/') || url.pathname === '/api/bid/events') return json({ error: '없는 경로입니다.' }, 404);
    if (req.method !== 'GET' && req.method !== 'POST') return json({ error: '허용되지 않은 요청입니다.' }, 405);
    if (req.method === 'POST' && req.headers.get('Origin') !== url.origin) return json({ error: '허용되지 않은 출처입니다.' }, 403);
    const expiry=await this.#initialize(url.pathname==='/api/bid/login' && req.method==='POST');
    if(expiry===null)return json({error:'다시 로그인해주세요.'},401);
    if (Date.now() >= expiry) return json({ error: '시안 이용 기간이 끝났습니다.' }, 410);
    try {
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
