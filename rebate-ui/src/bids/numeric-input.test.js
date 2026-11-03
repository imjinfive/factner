import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNumericInput,formatNumericInput,numericInputEdit,numericDeletionCaret,finishNumericInput} from './numeric-input.js';

test('number fields group integer digits while retaining blank and decimal editing states',()=>{
  assert.equal(formatNumericInput(''),'');
  assert.equal(formatNumericInput('12345678'),'12,345,678');
  assert.equal(formatNumericInput('1234.50'),'1,234.50');
  assert.equal(formatNumericInput('1234.'),'1,234.');
  assert.equal(parseNumericInput('.',true),'0.');
  assert.equal(parseNumericInput(' 1,000 '),'1000');
});

test('unexpected signs, exponents, units and extra decimal points are rejected intact',()=>{
  for (const value of ['-100','+100','1e3','12mm','10 000','1.2.3','수량 100']) assert.equal(parseNumericInput(value,true),null);
  assert.equal(parseNumericInput('10.5'),null);
  assert.equal(parseNumericInput('10.5',true),'10.5');
});

test('inserting or deleting in the middle restores the caret by numeric position',()=>{
  assert.deepEqual(numericInputEdit('12,934',4),{raw:'12934',display:'12,934',start:4,end:4});
  assert.deepEqual(numericInputEdit('1,34',2),{raw:'134',display:'134',start:1,end:1});
  assert.deepEqual(numericInputEdit('1234',1),{raw:'1234',display:'1,234',start:1,end:1});
  assert.deepEqual(numericInputEdit(',234',0),{raw:'234',display:'234',start:0,end:0});
  assert.deepEqual(numericInputEdit('',0),{raw:'',display:'',start:0,end:0});
});

test('selection ranges, pasted commas and decimal prefixes keep sensible caret positions',()=>{
  assert.deepEqual(numericInputEdit('1,234.50',2,6,true),{raw:'1234.50',display:'1,234.50',start:1,end:6});
  assert.deepEqual(numericInputEdit('1,000',5),{raw:'1000',display:'1,000',start:5,end:5});
  assert.deepEqual(numericInputEdit('.5',2,2,true),{raw:'0.5',display:'0.5',start:3,end:3});
});

test('input length counts raw digits and the decimal point, never formatting commas',()=>{
  assert.equal(numericInputEdit('100,000,000',11,11,false,9)?.raw,'100000000');
  assert.equal(numericInputEdit('1,000,000,000',13,13,false,9),null);
  assert.equal(numericInputEdit('12,345.6',8,8,true,7)?.raw,'12345.6');
  assert.equal(numericInputEdit('12,345.67',9,9,true,7),null);
});

test('Delete and Backspace skip grouping commas instead of repeatedly deleting formatting',()=>{
  const forward=numericDeletionCaret('1,000',1,1,'forward');
  assert.equal(forward,2);
  const afterDelete='1,000'.slice(0,forward)+'1,000'.slice(forward+1);
  assert.deepEqual(numericInputEdit(afterDelete,forward),{raw:'100',display:'100',start:1,end:1});
  const backward=numericDeletionCaret('1,234',2,2,'backward');
  assert.equal(backward,1);
  const afterBackspace='1,234'.slice(0,backward-1)+'1,234'.slice(backward);
  assert.equal(numericInputEdit(afterBackspace,backward-1).raw,'234');
  assert.equal(numericDeletionCaret('1,234',0,2,'forward'),null);
  assert.equal(numericDeletionCaret('123',1,1,'forward'),null);
});

test('leaving a field resolves an unfinished decimal and extra leading zeros without losing precision',()=>{
  assert.equal(finishNumericInput('1,234.',true),'1234');
  assert.equal(finishNumericInput('00,012.50',true),'12.50');
  assert.equal(finishNumericInput('.5',true),'0.5');
  assert.equal(finishNumericInput('0.',true),'0');
  assert.equal(finishNumericInput('',true),'');
  assert.equal(finishNumericInput('1e3',true),null);
});
