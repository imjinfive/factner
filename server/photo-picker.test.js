import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPhotoPicker} from '../admin-ui/suppliers.js';
function picker(multiple=false){
  const area=new EventTarget(),input=new EventTarget(),classes=new Set();
  area.classList={add:v=>classes.add(v),remove:v=>classes.delete(v)};
  area.contains=()=>false;area.closest=()=>null;
  input.closest=()=>area;input.multiple=multiple;input.files=[];input.validationMessage='';
  input.setCustomValidity=value=>input.validationMessage=value;input.reportValidity=()=>false;
  bindPhotoPicker(input);
  const drop=files=>{const event=new Event('drop',{cancelable:true});event.dataTransfer={files};area.dispatchEvent(event);assert.equal(event.defaultPrevented,true);};
  return {area,input,classes,drop};
}
test('photo drop forwards multiple files to selection and clears drag feedback',()=>{
  const {area,input,classes,drop}=picker(true);let selected=0;input.addEventListener('change',()=>selected++);
  area.dispatchEvent(new Event('dragover',{cancelable:true}));assert.ok(classes.has('dragging'));
  const files=[new File(['a'],'one.png'),new File(['b'],'two.png')];drop(files);
  assert.equal(input.files,files);assert.equal(selected,1);assert.equal(classes.has('dragging'),false);
});
test('single-photo drop rejects multiple files, preserves selection, and accepts a later valid selection',()=>{
  const {input,drop,area}=picker();const original=[new File(['a'],'one.png')];input.files=original;
  drop([...original,new File(['b'],'two.png')]);assert.equal(input.files,original);assert.ok(input.validationMessage);
  drop(original);assert.equal(input.validationMessage,'');
  area.closest=()=>({});drop([new File(['c'],'busy.png')]);assert.equal(input.files,original);
});
