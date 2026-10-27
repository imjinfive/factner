export const packagingOptions={
 material:['종이','골판지','플라스틱','천·부직포','목재'],
 printing:['옵셋 인쇄','디지털 인쇄','실크스크린 인쇄','플렉소 인쇄','그라비어 인쇄'],
 finish:['무광 코팅','유광 코팅','박 가공','형압','부분 UV'],
};

export function splitAddress(value=''){
 const match=value.match(/^\((\d{5})\) (.*?)(?:\n([\s\S]*))?$/);
 return match?{postcode:match[1],address:match[2],detail:match[3]||''}:{postcode:'',address:value,detail:''};
}
export function joinAddress({postcode,address,detail}){
 return `${postcode.trim()?`(${postcode.trim()}) `:''}${address.trim()}${detail.trim()?`\n${detail.trim()}`:''}`;
}
export function initialSupplier(partners,previousId){
 const active=partners.filter(p=>p.status==='active'&&p.available);
 if(previousId)return active.some(p=>p.supplier_id===previousId)?previousId:'';
 return active.length===1?active[0].supplier_id:'';
}
