export function createOrderAlerts({api,onUpdate}){
 let active=false,generation=0,timer,controller,inFlight=null,data=null,error='';
 const publish=()=>onUpdate({data,error});
 async function refresh(){
  if(!active||inFlight)return inFlight;
  const current=generation,request=new AbortController();controller=request;
  const timeout=setTimeout(()=>request.abort(),12000);
  inFlight=(async()=>{
   try{const next=await api('admin/orders/attention',{signal:request.signal});if(active&&current===generation){data=next;error='';publish();}}
   catch(problem){if(active&&current===generation){error='발주 알림 연결이 끊겼습니다. 자동으로 다시 확인합니다.';publish();}}
   finally{clearTimeout(timeout);if(current===generation){controller=null;inFlight=null;}}
  })();
  return inFlight;
 }
 function stop(){active=false;generation++;clearInterval(timer);controller?.abort();controller=null;inFlight=null;data=null;error='';}
 function start(){stop();active=true;publish();timer=setInterval(refresh,10000);return refresh();}
 return {start,stop,refresh};
}
