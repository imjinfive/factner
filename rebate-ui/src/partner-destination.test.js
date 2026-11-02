import assert from 'node:assert/strict';
import test from 'node:test';
import {partnerDestination} from './partner-destination.js';

test('after signup, preserve a matching public brief or the design chosen by the brand',()=>{
  const brief={postId:'public-design-project',category:'design'};
  assert.equal(partnerDestination('design',brief),'feed/public-design-project');
  assert.equal(partnerDestination('both',brief),'feed/public-design-project');
  assert.equal(partnerDestination('packaging',brief),'feed');
  assert.equal(partnerDestination('brand',brief),'new/design');
  assert.equal(partnerDestination('admin',brief),'contracts');
});
