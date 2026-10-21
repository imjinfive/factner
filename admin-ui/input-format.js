export function formatBusinessNumber(value){
 const digits=String(value).replace(/[\s-]/g,'');
 if(!/^\d*$/.test(digits)||digits.length>10)return String(value);
 return [digits.slice(0,3),digits.slice(3,5),digits.slice(5)].filter(Boolean).join('-');
}

export function formatPhone(value){
 const digits=String(value).replace(/[\s()-]/g,'');
 if(!/^\d*$/.test(digits))return String(value);
 if(/^(15|16|18)\d/.test(digits)&&digits.length<=8)return [digits.slice(0,4),digits.slice(4)].filter(Boolean).join('-');
 const prefix=digits.startsWith('02')?2:digits.startsWith('0505')?4:3;
 if(digits.length>prefix+8)return String(value);
 const rest=digits.slice(prefix),middle=rest.length>7?4:3;
 return [digits.slice(0,prefix),rest.slice(0,middle),rest.slice(middle)].filter(Boolean).join('-');
}

export function formatInput(event,formatter){
 const input=event.currentTarget;
 if(event.isComposing||event.nativeEvent?.isComposing)return;
 const value=input.value,start=input.selectionStart,end=input.selectionEnd;
 const formatted=formatter(value);if(formatted===value)return;
 const position=index=>{
  if(index===null)return formatted.length;
  const count=(value.slice(0,index).match(/\d/g)||[]).length;
  if(!count)return 0;
  let seen=0;for(let i=0;i<formatted.length;i++)if(/\d/.test(formatted[i])&&++seen===count)return i+1;
  return formatted.length;
 };
 input.value=formatted;input.setSelectionRange?.(position(start),position(end));
}
