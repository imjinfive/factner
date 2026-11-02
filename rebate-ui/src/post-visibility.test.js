import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicPost,roomReviewUrl} from './bids/post-visibility.js';

test('real posts require approval; unreviewed built-in examples remain visible',()=>{
  assert.equal(isPublicPost({reviewStatus:'approved'}),true);
  assert.equal(isPublicPost({example:true}),true);
  for (const reviewStatus of ['pending','rejected','withdrawn','unknown',undefined]) {
    assert.equal(isPublicPost({isMine:true,reviewStatus}),false);
    if (reviewStatus!==undefined) assert.equal(isPublicPost({example:true,reviewStatus}),false);
  }
});

test('only a test brand in the saved room can open its own pending post in the admin site',()=>{
  const brand={kind:'brand'},post={id:'a0000000-1122-3344-5566-000000000000',isMine:true,reviewStatus:'pending'};
  const key='a'.repeat(64),href=host=>roomReviewUrl(true,brand,post,key,host);
  const fragment='#review-room/'+key+'/'+post.id;
  assert.equal(href('127.0.0.1'),'http://localhost:4181/'+fragment);
  const hosted=new URL(href('factner.com'));assert.equal(hosted.origin,'https://admin.factner.com');assert.equal(hosted.pathname,'/');assert.equal(hosted.search,'');assert.equal(hosted.hash,fragment);
  for (const args of [[false,brand,post,key],[true,null,post,key],[true,{kind:'packaging'},post,key],[true,brand,{...post,isMine:false},key],[true,brand,{...post,reviewStatus:'approved'},key],[true,brand,post,'bad-key'],[true,brand,{...post,id:'../different-site'},key]]) {
    assert.equal(roomReviewUrl(...args,'factner.com'),null);
  }
});
