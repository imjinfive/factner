import {useCallback,useEffect,useState} from 'react';
import {suppliers as demos} from './model.js';

export function catalogFromResponse(config,data) {
  if(!Array.isArray(data?.suppliers)||typeof config?.accepting!=='boolean')throw new Error('업체 정보를 확인하지 못했습니다.');
  const real=data.suppliers,demo=config.accepting===false&&!real.length;
  return {suppliers:demo?demos.map(s=>({...s,source:'demo'})):real,source:demo?'demo':real.length?'real':'empty',loading:false,error:''};
}
export function useSuppliers() {
  const [state,setState]=useState({suppliers:[],loading:true,error:'',source:'empty'});
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    const visibleRefresh=()=>{if(document.visibilityState==='visible')refresh();};
    const timer=setInterval(visibleRefresh,60000);window.addEventListener('focus',visibleRefresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',visibleRefresh);};
  },[refresh]);
  useEffect(()=>{
    const controller=new AbortController();
    setState(previous=>({...previous,loading:true,error:''}));
    async function load() {
      try {
        const [config,data]=await Promise.all(['/api/config','/api/suppliers'].map(async path=>{
          const response=await fetch(path,{signal:controller.signal});
          if(!response.ok)throw new Error('업체 정보를 불러오지 못했습니다. 다시 시도해주세요.');
          return response.json();
        }));
        if(!controller.signal.aborted)setState(catalogFromResponse(config,data));
      } catch(error) {
        if(!controller.signal.aborted)setState({suppliers:[],loading:false,error:error.message,source:'empty'});
      }
    }
    load();return()=>controller.abort();
  },[revision]);
  return {...state,refresh};
}
