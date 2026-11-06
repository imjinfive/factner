import test from 'node:test';
import assert from 'node:assert/strict';
import {livePosts} from './post-visibility.js';

test('ticker shows only approved open packaging posts, newest first, through the Korean closing date',()=>{
  const base={reviewStatus:'approved',category:'packaging',status:'open',deadline:'2026-11-05',createdAt:'2026-11-01T00:00:00Z'};
  const posts=[{...base,id:'older'},{...base,id:'newer',reviewedAt:'2026-11-05T00:00:00Z'},
    ...['pending','rejected','withdrawn'].map(reviewStatus=>({...base,id:reviewStatus,reviewStatus})),
    {...base,id:'closed',deadline:'2026-11-04'},{...base,id:'awarded',status:'awarded'},{...base,id:'design',category:'design'}];
  assert.deepEqual(livePosts(posts,Date.parse('2026-11-05T14:59:59Z')).map(p=>p.id),['newer','older']);
  assert.deepEqual(livePosts(posts,Date.parse('2026-11-05T15:00:00Z')),[]);
  assert.equal(posts[0].id,'older');
  assert.deepEqual(livePosts([]),[]);
});
