import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {Bell,ArrowRight,ArrowsClockwise,X} from '@phosphor-icons/react';
import {api} from './api';
import {newOrderAlerts,attentionItems} from './order-alert-state.js';

export const OrderAlertContext=createContext(null);
export function OrderAlertNotice(){
 const alert=useContext(OrderAlertContext);
 return alert?.arrival&&alert.unread>0?<div className="order-alert-live" role="alert"><Bell size={22} weight="fill"/><span>새 발주가 도착했어요 · 미확인 <strong>{alert.unread}</strong>건</span></div>:null;
}

export default function OrderAlerts({member,onOpen,onSessionExpired,refreshKey,onNotice}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[arrival,setArrival]=useState(false),[permission,setPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission),[permissionError,setPermissionError]=useState('');
 const announced=useRef(new Set()),refresh=useRef(null),open=useRef(onOpen),expired=useRef(onSessionExpired);
 open.current=onOpen;expired.current=onSessionExpired;
 useEffect(()=>{
  let alive=true,busy=false,queued=false,controller;const notifications=new Set();
  const poll=async()=>{
   if(!alive)return;if(busy){queued=true;return;}busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
   try{
    const next=await api('orders/attention',{signal:controller.signal});if(!alive)return;
    setData(next);setError('');const fresh=newOrderAlerts(attentionItems(next),announced.current);
    if(fresh.length){
     setExpanded(true);setArrival(true);
     if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{const alert=new Notification('팩트너 · 새 발주가 도착했어요',{body:'제작 요청을 확인하고 견적에 답변해주세요.',tag:`factner-orders-${member.id}`});notifications.add(alert);alert.onclose=()=>notifications.delete(alert);alert.onclick=()=>{window.focus();open.current(fresh[0].id);alert.close();};}catch{setPermissionError('브라우저 알림을 표시하지 못했어요. 사이트 알림에서 확인해주세요.');}
     }
    }
   }catch(problem){if(!alive)return;if(problem.status===401){expired.current();return;}setError('알림 연결이 끊겼어요. 다시 연결하고 있습니다.');}
   finally{clearTimeout(timeout);busy=false;if(alive&&queued){queued=false;poll();}}
  };
  refresh.current=poll;poll();const timer=setInterval(poll,10000),focus=()=>{if(document.visibilityState==='visible'){if(typeof Notification!=='undefined')setPermission(Notification.permission);poll();}};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);window.addEventListener('online',poll);
  return()=>{alive=false;refresh.current=null;clearInterval(timer);controller?.abort();notifications.forEach(n=>n.close());window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',poll);};
 },[member.id]);
 useEffect(()=>{refresh.current?.();},[refreshKey]);
 useEffect(()=>{onNotice({memberId:member.id,arrival,unread:data?.unread||0});},[member.id,arrival,data?.unread,onNotice]);
 useEffect(()=>()=>onNotice(null),[onNotice]);
 const enable=async()=>{try{const result=await Notification.requestPermission();setPermission(result);setPermissionError(result==='denied'?'브라우저 설정에서 알림 권한을 허용해주세요.':'');}catch{setPermissionError('이 브라우저에서는 알림 권한을 요청할 수 없어요.');}};
 const items=attentionItems(data).filter(item=>item.unread||item.overdue);
 return <aside className={`order-alert-center ${expanded?'expanded':''}`} aria-label="발주 알림">
  <button className="order-alert-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><Bell size={23} weight={data?.unread||data?.overdue?'fill':'regular'}/><span>{error?'알림 연결 확인':'발주 알림'}</span>{data?.unread>0&&<b>{data.unread}</b>}{data?.overdue>0&&<span className="order-alert-overdue">지연 {data.overdue}</span>}{error&&<span className="order-alert-dot" aria-label="연결 확인 필요"/>}</button>
  {expanded&&<section className="order-alert-panel"><div className="order-alert-heading"><strong>{arrival&&data?.unread?'새 발주가 도착했어요':'발주 알림'}</strong><button aria-label="발주 알림 접기" onClick={()=>{setExpanded(false);setArrival(false);}}><X size={21}/></button></div>
   <div className="order-alert-summary" role={arrival?'alert':'status'} aria-live={arrival?'assertive':'polite'}>{data?<>미확인 <b>{data.unread}</b>건 <span>·</span> 답변 지연 <b>{data.overdue}</b>건</>:'알림을 확인하고 있어요.'}</div>
   {error&&<p role="alert" className="order-alert-error">{error}<button onClick={()=>refresh.current?.()}><ArrowsClockwise size={16}/> 다시 연결</button></p>}
   <div className="order-alert-items">{items.map(item=><button key={`${item.id}-${item.response_requested_at}`} onClick={()=>{open.current(item.id);setExpanded(false);setArrival(false);}}><span><strong>{item.name}</strong><small>{item.brand_name} · {item.overdue?'답변 지연':item.unread?'미확인':'답변 대기'}</small></span><ArrowRight size={18}/></button>)}</div>
   {data&&!items.length&&!error&&<p className="order-alert-empty">확인하지 않은 발주가 없어요.</p>}
   <button className="order-alert-all" onClick={()=>{open.current(null);setExpanded(false);setArrival(false);}}>받은 발주 전체 보기 <ArrowRight size={17}/></button>
   <div className="order-alert-permission">{permission==='default'?<button onClick={enable}><Bell size={16}/> 브라우저 알림 켜기</button>:<span>{permission==='granted'?'브라우저 알림 켜짐':permission==='denied'?'브라우저 알림 차단됨 · 사이트 알림은 유지됩니다.':'사이트 알림 사용 중'}</span>}<small>사이트가 열려 있는 동안 새 발주를 알려드려요.</small>{permissionError&&<p role="status">{permissionError}</p>}</div>
  </section>}
 </aside>;
}
