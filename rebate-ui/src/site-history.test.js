import test from 'node:test';
import assert from 'node:assert/strict';
import {siteLocation} from './site-history.js';

test('clean root reload restores its own workspace, screen and selected project',()=>{
  const root={pathname:'/',hash:''};
  assert.deepEqual(siteLocation(root,null),{surface:'market',route:'intro'});
  assert.deepEqual(siteLocation(root,{factnerSurface:'market',factnerRoute:'feed/abc'}),{surface:'market',route:'feed/abc'});
  assert.deepEqual(siteLocation(root,{factnerSurface:'members',factnerPage:'request',matching:{depth:1}}),{surface:'members',route:'request'});
  assert.deepEqual(siteLocation(root,{factnerSurface:'ops',factnerRoute:'demo'}),{surface:'ops',route:'login'});
});

test('published links still resolve before the address is cleaned',()=>{
  assert.deepEqual(siteLocation({pathname:'/',hash:'#preview'}),{surface:'market',route:'feed'});
  assert.deepEqual(siteLocation({pathname:'/members/',hash:'#account'}),{surface:'members',route:'account'});
  assert.deepEqual(siteLocation({pathname:'/ops',hash:''}),{surface:'ops',route:'contracts'});
  for (const view of ['login','signup']) assert.deepEqual(siteLocation({pathname:'/',hash:'#'+view+'/old-brief'}),{surface:'market',route:view});
  assert.deepEqual(siteLocation({pathname:'/',hash:''},{factnerRoute:'privacy'}),{surface:'market',route:'privacy'});
});
