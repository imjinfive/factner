import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

test('an isolated bearer needs its own room; ordinary member cookies are never forwarded there', async () => {
  const touched=[], routed=[];
  let limited=false;
  const env={APP_KIND:'main',DB:{prepare(sql){touched.push(sql);throw new Error('Unexpected production DB access');}},
    BID_LIMIT:{limit:async()=>({success:!limited})},
    BID_ROOMS:{idFromName:key=>key,get:key=>({fetch:async req=>{routed.push([key,req.method,req.headers.get('Cookie')]);return Response.json({ok:true});}})}
  };
  const ctx={waitUntil(){}};
  const call=(room,method='GET',origin='https://factner.com')=>worker.fetch(new Request('https://factner.com/api/bid/session',
    {method,headers:{Origin:origin,'X-Factner-Review':room,Authorization:'Bearer '+'f'.repeat(64),Cookie:'factner_member=private'}}),env,ctx);
  assert.equal((await call('invalid')).status,401);
  const key='a'.repeat(64);
  assert.equal((await call(key,'POST','https://other.example')).status,403);
  assert.equal((await call(key)).status,200);
  limited=true;
  assert.equal((await call('b'.repeat(64))).status,429);
  assert.deepEqual(routed,[[key,'GET',null]]);
  assert.deepEqual(touched,[]);
});
