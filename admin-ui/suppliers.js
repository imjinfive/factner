import {saveNewSupplier} from './supplier-save.js';
const categories=['단상자','택배박스','싸바리박스','쇼핑백','포장·부자재'];
const kinds={workshop:'작업 현장',sample:'제작 샘플',delivery:'납품 품질',case:'제작 사례'};
const states={draft:'비공개 초안',published:'공개 중',archived:'보관'};

export async function renderSuppliers(ctx) {
  const {api,send,shell,esc,submit,notice,setDirty}=ctx;
  let dirty=false,photoDirty=false,request=0;
  const active=()=>!ctx.isActive||ctx.isActive();
  const changeDirty=value=>{dirty=value;setDirty(value);};
  const leave=()=>!(dirty||photoDirty)||confirm('저장하지 않은 업체 내용이 있습니다. 이동할까요?');
  const handle=action=>async()=>{try{await action();}catch(error){notice(error.message);}};
  const choice=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${label}</option>`).join('');
  const requireSaved=()=>{if(dirty)throw new Error('변경한 업체 정보를 먼저 저장해주세요.');};
  async function list() {
    const token=++request,{suppliers}=await api('admin/suppliers');if(!active()||token!==request)return;
    photoDirty=false;changeDirty(false);
    shell(`<header><div><h1>업체 관리</h1></div><button id="supplier-new">업체 추가</button></header><section class="panel"><div class="table-scroll"><table><thead><tr><th>업체</th><th>제작 조건</th><th>공개 상태</th><th>현장 검증</th></tr></thead><tbody>${suppliers.map(s=>`<tr><td><button class="link-button" data-supplier="${s.id}">${esc(s.name)}</button><small>${esc(s.area)||'지역 미입력'}</small></td><td>${esc(s.categories.join(' · '))||'분류 미입력'}<small>${s.moq.toLocaleString()}개부터 · ${s.days}일</small></td><td>${states[s.state]}</td><td>${s.visit?esc(s.visitedAt):'미검증'}</td></tr>`).join('')}</tbody></table></div>${suppliers.length?'':'<p class="empty">등록된 업체가 없습니다.</p>'}</section>`);
    document.querySelector('#supplier-new').addEventListener('click',handle(()=>edit()));
    document.querySelectorAll('[data-supplier]').forEach(button=>button.addEventListener('click',handle(()=>edit(button.dataset.supplier))));
  }
  async function edit(id) {
    const token=++request;
    const newPhotos=[],saveState={supplier:null};
    const {supplier:s,events=[]}=id?await api(`admin/suppliers/${id}`):{supplier:{name:'',categories:[],area:'',moq:100,days:14,description:'',material:'',finish:'',tags:[],state:'draft',actualConfirmed:false,visit:false,visitedAt:'',verifiedBy:'',internalNote:'',photos:[]}};
    if(!active()||token!==request)return;
    photoDirty=false;changeDirty(false);
    shell(`<header><div><button id="supplier-back" class="quiet">← 업체 목록</button><h1>${id?esc(s.name):'업체 추가'}</h1><p class="muted">${id?states[s.state]:'업체 정보와 사진을 함께 등록하세요.'}</p></div></header><form id="supplier-form"><div class="detail-grid"><section class="panel"><h2>기본 정보</h2><label>업체명<input name="name" maxlength="80" value="${esc(s.name)}" required></label><fieldset><legend>제작 가능한 패키징</legend>${categories.map(c=>`<label class="check"><input type="checkbox" name="categories" value="${c}" ${s.categories.includes(c)?'checked':''}>${c}</label>`).join('')}</fieldset><label>지역<input name="area" maxlength="100" value="${esc(s.area)}" placeholder="예: 경기 파주"></label><label>최소 제작 수량<input name="moq" type="number" min="1" max="10000000" step="1" value="${s.moq}" required></label><label>제작 기간(일)<input name="days" type="number" min="1" max="730" step="1" value="${s.days}" required></label><label>업체 소개<textarea name="description" rows="4" maxlength="1500">${esc(s.description)}</textarea></label><label>소재<input name="material" maxlength="300" value="${esc(s.material)}"></label><label>인쇄·후가공<input name="finish" maxlength="300" value="${esc(s.finish)}"></label><label>특징 태그<input name="tags" maxlength="250" value="${esc(s.tags.join(', '))}" placeholder="쉼표로 구분, 최대 6개"></label></section><section class="panel"><h2>공개와 검증</h2><label>공개 상태<select name="state">${choice(states,s.state)}</select></label><label class="check"><input name="actualConfirmed" type="checkbox" ${s.actualConfirmed?'checked':''}>실제 업체 정보와 사진의 게시 권한을 확인했습니다.</label><label class="check"><input name="visit" type="checkbox" ${s.visit?'checked':''}>팩트너 현장 검증 완료</label><label>실제 방문일<input name="visitedAt" type="date" max="${new Date().toISOString().slice(0,10)}" value="${esc(s.visitedAt)}"></label><label>확인자<input name="verifiedBy" maxlength="60" value="${esc(s.verifiedBy)}"></label><p class="muted">현장·샘플·납품 사진, 방문일, 확인자가 필요합니다.</p><label>내부 기록<textarea name="internalNote" rows="6" maxlength="5000" placeholder="방문 기록, 업체 연락처, 게시 동의 확인 등. 관리자에게만 보입니다.">${esc(s.internalNote)}</textarea></label></section>${!id?`<section class="panel wide"><h2>업체 사진</h2><p class="muted">JPG·PNG·WebP · 장당 1.5MB · 최대 8장</p><label class="photo-picker">사진 선택<input id="new-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="photo-selection-error" class="error" role="alert" hidden></div><div id="new-photo-grid" class="supplier-photo-grid"></div><p id="photo-empty" class="muted">작업 현장이나 제작한 상품 사진을 올려주세요.</p><label class="check" id="new-photo-consent" hidden><input id="new-photo-actual" type="checkbox">실제 업체 사진이며 게시 권한을 확인했습니다.</label></section>`:''}</div><div class="actions"><button type="submit">${id?'변경사항 저장':'업체 등록'}</button></div></form>${id?`<section class="panel supplier-photo-panel"><h2>실제 사진 · 제작 사례</h2><p class="muted">한 장당 1.5MB 이하의 JPG·PNG·WebP, 최대 8장. 첫 번째 사진이 대표 사진입니다.</p><div class="supplier-photo-grid">${s.photos.map(photo=>`<article class="supplier-photo"><img class="supplier-image" width="320" height="240" src="${photo.url}" alt="${esc(photo.caption)}"><form data-photo="${photo.id}"><label>사진 종류<select name="kind">${choice(kinds,photo.kind)}</select></label><label>사진 설명<input name="caption" maxlength="200" value="${esc(photo.caption)}" required></label><div class="actions"><button class="secondary" type="submit">설명 저장</button><button class="quiet" type="button" data-remove="${photo.id}">삭제</button></div></form></article>`).join('')}</div>${s.photos.length<8?`<form id="photo-form"><h3>사진 추가</h3><label>사진 파일<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><label>사진 종류<select name="kind">${choice(kinds,'case')}</select></label><label>사진 설명<input name="caption" maxlength="200" placeholder="실제 제품 구성과 확인한 내용을 적어주세요." required></label><label class="check"><input name="actual" type="checkbox" required>실제 업체 사진이며 게시 권한을 확인했습니다.</label><button type="submit">사진 등록</button></form>`:'<p class="muted">사진 8장이 등록되어 있습니다.</p>'}</section><section class="panel supplier-photo-panel"><h2>변경 기록</h2><ul class="timeline">${events.map(e=>`<li>${esc(e.action)}<small>${esc(e.actor)} · ${new Date(e.created_at).toLocaleString('ko-KR')}</small></li>`).join('')}</ul></section>`:''}`);
    document.querySelector('#supplier-back').addEventListener('click',handle(()=>{if(leave())return list();}));
    const form=document.querySelector('#supplier-form');form.addEventListener('input',()=>changeDirty(true));
    const photoGrid=document.querySelector('#new-photo-grid');
    function renderSelection() {
      if(!photoGrid)return;
      photoGrid.innerHTML=newPhotos.map((photo,index)=>`<article class="supplier-photo"><img class="supplier-image" src="${photo.preview}" alt="${esc(photo.file.name)}"><label>사진 종류<select data-new-kind="${index}" ${photo.uploaded?'disabled':''}>${choice(kinds,photo.kind)}</select></label><label>사진 설명<input data-new-caption="${index}" maxlength="200" value="${esc(photo.caption)}" required ${photo.uploaded?'disabled':''}></label>${photo.uploaded?'<span class="badge">저장됨</span>':`<button class="quiet" type="button" data-new-remove="${index}" aria-label="${esc(photo.file.name)} 선택 취소">선택 취소</button>`}</article>`).join('');
      document.querySelector('#photo-empty').hidden=newPhotos.length>0;
      document.querySelector('#new-photo-consent').hidden=newPhotos.length===0;
      document.querySelector('#new-photo-actual').required=newPhotos.length>0;
      photoGrid.querySelectorAll('[data-new-kind]').forEach(el=>el.onchange=()=>{newPhotos[el.dataset.newKind].kind=el.value;});
      photoGrid.querySelectorAll('[data-new-caption]').forEach(el=>el.oninput=()=>{newPhotos[el.dataset.newCaption].caption=el.value;});
      photoGrid.querySelectorAll('[data-new-remove]').forEach(el=>el.onclick=()=>{const [photo]=newPhotos.splice(Number(el.dataset.newRemove),1);changeDirty(true);renderSelection();});
    }
    document.querySelector('#new-photos')?.addEventListener('change',async event=>{
      const input=event.currentTarget,files=Array.from(input.files),error=document.querySelector('#photo-selection-error');
      error.hidden=true;error.textContent='';
      if(newPhotos.length+files.length>8){error.textContent='사진은 최대 8장까지 선택해주세요.';}
      else if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>1500000)){error.textContent='JPG·PNG·WebP 사진을 장당 1.5MB 이하로 선택해주세요.';}
      else {
        form.inert=true;
        try {
          const selected=[];
          for(const file of files){
            const preview=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진을 읽지 못했습니다. 다시 선택해주세요.'));reader.readAsDataURL(file);});
            selected.push({file,preview,kind:'case',caption:file.name.replace(/\.[^.]+$/,'').slice(0,200),uploaded:false});
          }
          newPhotos.push(...selected);changeDirty(true);renderSelection();
        }catch(cause){error.textContent=cause.message;}finally{form.inert=false;}
      }
      error.hidden=!error.textContent;input.value='';
    });
    form.addEventListener('submit',e=>submit(e,async(data,form)=>{
      const payload={...data,categories:new FormData(form).getAll('categories'),tags:data.tags.split(',').map(t=>t.trim()).filter(Boolean),moq:Number(data.moq),days:Number(data.days),actualConfirmed:data.actualConfirmed==='on',visit:data.visit==='on',version:s.version};
      form.inert=true;
      try {
        const result=id?await send(`admin/suppliers/${id}`,payload,'PATCH'):await saveNewSupplier({api,send,state:saveState,payload,photos:newPhotos,onProgress:renderSelection});
        changeDirty(false);notice('업체 정보를 저장했어요.');if(active())await edit(result.supplier.id);
      } catch(error) {
        if(saveState.supplier)error.message='업체 초안은 저장됐어요. '+error.message+' 다시 저장하면 남은 작업을 이어갑니다.';
        throw error;
      } finally {form.inert=false;}
    }));
    document.querySelector('#photo-form')?.addEventListener('input',()=>{photoDirty=true;setDirty(true);});
    document.querySelector('#photo-form')?.addEventListener('submit',e=>submit(e,async(data,photoForm)=>{
      requireSaved();const file=photoForm.elements.photo.files[0];if(!file||file.size>1500000)throw new Error('사진은 한 장당 1.5MB 이하로 줄여주세요.');
      const params=new URLSearchParams({version:s.version,caption:data.caption,kind:data.kind,actual:'true'});
      await api(`admin/suppliers/${id}/images?${params}`,{method:'POST',headers:{'Content-Type':file.type},body:file});notice('사진을 등록했어요.');await edit(id);
    }));
    document.querySelectorAll('[data-photo]').forEach(photoForm=>{photoForm.addEventListener('input',()=>{photoDirty=true;setDirty(true);});photoForm.addEventListener('submit',e=>submit(e,async data=>{requireSaved();await send(`admin/suppliers/${id}/images/${photoForm.dataset.photo}`,{...data,version:s.version},'PATCH');notice('사진 설명을 저장했어요.');await edit(id);}));});
    document.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',handle(async()=>{requireSaved();if(!confirm('사진을 삭제할까요?'))return;button.disabled=true;try{await send(`admin/suppliers/${id}/images/${button.dataset.remove}`,{action:'remove',version:s.version});notice('사진을 삭제했어요.');await edit(id);}finally{button.disabled=false;}})));
  }
  await list();
  return {refresh:list};
}
