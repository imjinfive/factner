// Keep the draft and completed uploads when a later photo fails, so retry resumes.
export async function saveNewSupplier({api,send,state,payload,photos,onProgress=()=>{}}) {
  if (!state.supplier) {
    const result=await send('admin/suppliers',{...payload,state:'draft',visit:false});
    state.supplier=result.supplier;
  }
  for (const photo of photos) {
    if (photo.uploaded) continue;
    const params=new URLSearchParams({version:state.supplier.version,caption:photo.caption,kind:photo.kind,actual:'true'});
    const result=await api(`admin/suppliers/${state.supplier.id}/images?${params}`,{method:'POST',headers:{'Content-Type':photo.file.type},body:photo.file});
    state.supplier.version=result.version;
    photo.uploaded=true;
    onProgress();
  }
  const result=await send(`admin/suppliers/${state.supplier.id}`,{...payload,version:state.supplier.version},'PATCH');
  state.supplier=result.supplier;
  return result;
}
