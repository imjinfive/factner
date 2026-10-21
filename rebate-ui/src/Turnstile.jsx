import {useEffect,useRef,useState} from 'react';

let scriptPromise;
function loadTurnstile() {
  if(window.turnstile?.render)return Promise.resolve(window.turnstile);
  if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.addEventListener('load',()=>{
      // The script load event fires after api.js executes. ready() rejects async scripts.
      if(window.turnstile?.render)resolve(window.turnstile);
      else {script.remove();reject(new Error('보안 확인을 불러오지 못했습니다.'));}
    },{once:true});
    script.addEventListener('error',()=>{script.remove();reject(new Error('보안 확인에 연결하지 못했습니다.'));},{once:true});
    document.head.append(script);
  }).catch(error=>{scriptPromise=undefined;throw error;});
  return scriptPromise;
}
export default function Turnstile({siteKey,onToken,resetKey,action='quote'}) {
  const container=useRef(null),callback=useRef(onToken);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0);
  callback.current=onToken;
  useEffect(()=>{
    let active=true,widget,timer;
    callback.current('');setError('');
    loadTurnstile().then(api=>{
      if(!active)return;
      widget=api.render(container.current,{sitekey:siteKey,action,size:'flexible',theme:'auto',
        callback:token=>{if(!active)return;setError('');callback.current(token);clearTimeout(timer);timer=setTimeout(()=>{if(active){callback.current('');api.reset(widget);}},240000);},
        'expired-callback':()=>{if(active){clearTimeout(timer);callback.current('');}},
        'timeout-callback':()=>{if(active){clearTimeout(timer);callback.current('');}},
        'error-callback':()=>{if(active){callback.current('');setError('보안 확인을 다시 진행해주세요.');}},
      });
    }).catch(problem=>{if(active)setError(problem.message);});
    return()=>{active=false;clearTimeout(timer);if(widget!==undefined)window.turnstile?.remove(widget);callback.current('');};
  },[siteKey,resetKey,retry,action]);
  return <div className="turnstile-check"><div ref={container}/>{error&&<p className="field-error" role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>다시 확인</button></p>}</div>;
}
