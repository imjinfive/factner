export function createMemberAlerts({api,onUpdate}) {
 let active=false,generation=0,timer,request=null,data=null,error='';
 async function refresh(){
  if(!active||request)return;
  const current=generation,controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),12000);
  try {
   const options={signal:controller.signal};
   const [recovery,matching,packaging]=await Promise.all([api('admin/members/recovery',options),api('admin/matching/requests?status=pending',options),api('admin/packaging-reviews?status=pending',options)]);
   if(!active||generation!==current)return;
   data={recovery:recovery.requests.length,matching:matching.requests.length,packaging:packaging.reviews.length};error='';onUpdate({data,error});
  }catch{if(active&&generation===current){error='회원 요청 알림을 갱신하지 못했습니다. 새로고침해 확인해주세요.';onUpdate({data,error});}}
  finally{clearTimeout(timeout);if(generation===current)request=null;}
 }
 function stop(){active=false;generation++;clearInterval(timer);request?.abort();request=null;data=null;error='';}
 function start(){stop();active=true;timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},20000);return refresh();}
 return {start,stop,refresh};
}
