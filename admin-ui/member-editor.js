function draftFields(form){
 const occurrences=new Map();
 return [...form.elements].filter(field=>field.name&&field.name!=='verified'&&!['submit','button','reset'].includes(field.type)).map(field=>{
  const identity=JSON.stringify([field.name,field.type,['checkbox','radio'].includes(field.type)?field.value:'']);
  const occurrence=occurrences.get(identity)||0;occurrences.set(identity,occurrence+1);
  return {key:`${identity}:${occurrence}`,field};
 });
}

export function captureDrafts(root,except){
 return [...root.querySelectorAll('form[data-edited]')].filter(form=>form!==except).map(form=>({
  key:form.id?`#${form.id}`:Object.entries(form.dataset).filter(([name])=>name!=='edited'&&name!=='submitting').map(([name,value])=>`[data-${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${value}"]`).join(''),
  fields:draftFields(form).map(({key,field})=>({key,name:field.name,value:field.value,checked:field.checked,type:field.type,node:field.type==='file'?field:null})),
 }));
}

export function restoreDrafts(root,drafts=[]){
 const changes=[],missing=[];
 for(const draft of drafts){
  const form=root.querySelector(draft.key);if(!form){missing.push(draft);continue;}
  const fields=new Map(draftFields(form).map(({key,field})=>[key,field]));
  for(const saved of draft.fields){
   const field=fields.get(saved.key);if(!field)continue;
   if(saved.type==='file'){field.replaceWith(saved.node);continue;}
   const checkbox=['checkbox','radio'].includes(saved.type),before=checkbox?field.checked:field.value,after=checkbox?saved.checked:saved.value;
   if(before!==after)changes.push({label:field.closest('label')?.textContent.trim()||saved.name,latest:checkbox?(before?'선택':'미선택'):before,draft:checkbox?(after?'선택':'미선택'):after});
   if(checkbox)field.checked=saved.checked;else field.value=saved.value;
  }
  form.dataset.edited='true';
  for(let parent=form.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  form.dispatchEvent(new Event('input',{bubbles:true}));
 }
 return {changes,missing};
}

export function showMemberSection(id){
 const target=document.getElementById(id);if(!target)return;
 for(let parent=target;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 target.scrollIntoView({block:'start'});target.querySelector('input,textarea,select,button')?.focus({preventScroll:true});
}
