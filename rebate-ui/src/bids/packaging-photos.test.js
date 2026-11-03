import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {products,productVariants} from './packaging-catalog.js';

test('every packaging variant has its own optimized product image',()=>{
 const variants=Object.entries(products).flatMap(([material,rows])=>rows.flatMap(([id])=>productVariants(`${material}-${id}`)));
 const hashes=new Set();
 for(const variant of variants){
  const image=readFileSync(new URL(`../../public/generated/packaging/${variant.id}.webp`,import.meta.url));
  assert.equal(image.toString('ascii',0,4),'RIFF',variant.id);
  assert.equal(image.toString('ascii',8,12),'WEBP',variant.id);
  assert(image.length<200000,`${variant.id} should stay lightweight`);
  hashes.add(createHash('sha256').update(image).digest('hex'));
 }
 assert.equal(hashes.size,variants.length,'Different products must not share a representative image');
});
