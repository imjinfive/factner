import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPhone,formatBusinessNumber,formatInput} from '../admin-ui/input-format.js';

test('phone and business formatting handles domestic lengths without dropping international or excess digits',()=>{
 for(const [value,expected] of [['01012345678','010-1234-5678'],['0212345678','02-1234-5678'],['021234567','02-123-4567'],['0311234567','031-123-4567'],['15881234','1588-1234'],['050512345678','0505-1234-5678'],['010 1234 5678','010-1234-5678'],['+82 10 1234 5678','+82 10 1234 5678'],['010123456789','010123456789']])assert.equal(formatPhone(value),expected);
 assert.equal(formatBusinessNumber('1234567890'),'123-45-67890');assert.equal(formatBusinessNumber('123-45-67890'),'123-45-67890');assert.equal(formatBusinessNumber('12345678901'),'12345678901');
 assert.equal(formatPhone('010'),'010');assert.equal(formatPhone('0101'),'010-1');assert.equal(formatBusinessNumber('1234'),'123-4');
});

test('formatting keeps the cursor at the edited digit and does not change composing text',()=>{
 const input={value:'0109123-4567',selectionStart:4,selectionEnd:4,setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
 formatInput({currentTarget:input},formatPhone);assert.equal(input.value,'010-9123-4567');assert.equal(input.selectionStart,5);assert.equal(input.selectionEnd,5);
 const composition={...input,value:'0101'};formatInput({currentTarget:composition,isComposing:true},formatPhone);assert.equal(composition.value,'0101');
});
