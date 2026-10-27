import test from 'node:test';
import assert from 'node:assert/strict';
import {splitAddress,joinAddress,initialSupplier} from '../rebate-ui/src/packaging-input.js';

test('shipping address preserves legacy entries and round-trips selected postcode and detail',()=>{
 const legacy='서울시 강남구 테스트로 12 3층';assert.equal(joinAddress(splitAddress(legacy)),legacy);
 const address={postcode:'12345',address:'서울시 테스트로 10',detail:'101동 203호'};assert.deepEqual(splitAddress(joinAddress(address)),address);
 assert.equal(joinAddress({postcode:'',address:' 부산시 테스트로 1 ',detail:' 2층 '}),'부산시 테스트로 1\n2층');
});
test('reordering never silently substitutes a different supplier when the previous connection ended',()=>{
 const partners=[{supplier_id:'new-supplier',status:'active',available:true}];
 assert.equal(initialSupplier(partners),'new-supplier');assert.equal(initialSupplier(partners,'old-supplier'),'');
 assert.equal(initialSupplier([...partners,{supplier_id:'another',status:'active',available:true}]),'');
 assert.equal(initialSupplier([{supplier_id:'inactive',status:'active',available:false}]),'');
});
