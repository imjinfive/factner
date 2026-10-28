import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareUpload, UPLOAD_LIMIT} from './shared/image-upload.js';

test('small originals stay intact; oversized PDFs and unsupported files fail before decoding', async () => {
 const original = new File(['photo'], 'sample.png', {type:'image/png'});
 assert.equal(await prepareUpload(original), original);
 await assert.rejects(prepareUpload(new File([new Uint8Array(UPLOAD_LIMIT+1)], 'art.pdf', {type:'application/pdf'})), /PDF 원본/);
 await assert.rejects(prepareUpload(new File(['svg'], 'art.svg', {type:'image/svg+xml'})), /JPG/);
});

test('large transparent photo is resized, bounded, renamed to its actual output type, and released', async () => {
 const previous = {document:globalThis.document, createImageBitmap:globalThis.createImageBitmap};
 let closed = false, draws = 0;
 const canvas = {getContext:()=>({drawImage(){draws++;}}),toBlob(callback,type){assert.equal(type,'image/webp'); callback(new Blob([new Uint8Array(draws===1?UPLOAD_LIMIT+1:1000)],{type}));}};
 globalThis.document = {createElement:()=>canvas};
 globalThis.createImageBitmap = async()=>({width:4000,height:2000,close(){closed=true;}});
 try {
  const photo = new File([new Uint8Array(UPLOAD_LIMIT+100)], '투명 도안.png', {type:'image/png'});
  const result = await prepareUpload(photo);
  assert.equal(result.type,'image/webp'); assert.equal(result.name,'투명 도안-compressed.webp');
  assert.ok(result.size<=UPLOAD_LIMIT); assert.equal(canvas.width/canvas.height,2); assert.ok(canvas.width<=2400);
  assert.equal(draws,2); assert.equal(closed,true);
 } finally { Object.assign(globalThis, previous); }
});

test('failed compression never returns an oversized upload and releases bitmap', async () => {
 const previous = {document:globalThis.document, createImageBitmap:globalThis.createImageBitmap};
 let closed=false;
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:callback=>callback(null)})};
 globalThis.createImageBitmap=async()=>({width:3000,height:2000,close(){closed=true;}});
 try {
  await assert.rejects(prepareUpload(new File([new Uint8Array(UPLOAD_LIMIT+1)],'photo.jpg',{type:'image/jpeg'})),/압축하지 못했습니다/);
  assert.equal(closed,true);
 } finally { Object.assign(globalThis,previous); }
});
