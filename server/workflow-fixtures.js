// Historical orders remain readable and processable after creation rules change.
export function legacyOrder(DB,brandId,input){
 const time=new Date().toISOString();
 DB.raw.prepare('INSERT INTO orders(id,brand_id,spec,quantity,requested_date,address,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(input.id,brandId,JSON.stringify(input.spec),input.quantity,input.requestedDate,input.address,input.note,time,time);
 for(const file of input.spec.files)DB.raw.prepare('INSERT INTO order_files VALUES(?,?)').run(input.id,file.id);
 DB.raw.prepare('INSERT INTO order_events VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),input.id,brandId,'기존 브랜드','발주 요청',JSON.stringify({spec:input.spec}),time);
 return {status:201,data:{id:input.id}};
}
export async function approvedPackaging(admin,brandId,spec){
 const result=await admin(`admin/members/${brandId}/packagings`,{spec,confirmed:true});
 if(result.status!==201)throw new Error(JSON.stringify(result));
 return {packagingId:result.data.id,packagingVersion:1,confirmed:true};
}
