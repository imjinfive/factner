import assert from 'node:assert/strict';
import test from 'node:test';
import {partnerDestination} from './partner-destination.js';

test('signup returns a manufacturer to its open packaging brief and never opens a designer workspace',()=>{
  const brief={postId:'public-packaging-project',category:'packaging'};
  assert.equal(partnerDestination('packaging',brief),'feed/public-packaging-project');
  assert.equal(partnerDestination('both',brief),'feed/public-packaging-project');
  assert.equal(partnerDestination('both',{...brief,category:'design'}),'feed');
  assert.equal(partnerDestination('design',brief),'feed');
  assert.equal(partnerDestination('brand',brief),'new');
  assert.equal(partnerDestination('admin',brief),'contracts');
});
