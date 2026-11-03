import React from 'react';
import {createRoot} from 'react-dom/client';
import '../styles.css';
import '../funnel-shell.css';
import BidApp from './BidApp';
import {normalizeSiteEntry, siteLocation, siteNavigationEvent} from '../site-history.js';

function redirectFromWww() {
  const {surface,route} = siteLocation(location,history.state);
  const url = new URL(surface==='members'?'/members/':surface==='ops'?'/ops':'/', 'https://factner.com');
  const [view,detail] = route.split('/');
  // Only public post IDs and the known creation categories travel to the canonical origin.
  const post = ['feed','mine'].includes(view) && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(detail || '');
  const category = view==='new' && ['packaging','design'].includes(detail);
  const defaultView = surface==='members'?'account':surface==='ops'?'contracts':'intro';
  if (post || category) url.hash = view+'/'+detail;
  else if (view!==defaultView) url.hash = view;
  location.replace(url.href);
}

function startApp() {
  const root = createRoot(document.getElementById('root'));
  const freshHome=location.pathname==='/' && !history.state?.factnerRoute && !location.hash;
  let currentSurface;
  async function showSurface() {
    const {surface} = normalizeSiteEntry();
    if (surface === currentSurface) return;
    const initialHome=freshHome && currentSurface===undefined;
    currentSurface = surface;
    if (surface !== 'members') {
      root.render(<BidApp key={surface} surface={surface} initialHome={initialHome}/>);
      return;
    }
    try {
      const {default:MemberApp} = await import('../main.jsx');
      if (currentSurface==='members') root.render(<React.StrictMode><MemberApp/></React.StrictMode>);
    } catch {
      if (currentSurface==='members') root.render(<main role="alert">회원 화면을 불러오지 못했습니다. <button onClick={()=>location.reload()}>다시 시도</button></main>);
    }
  }
  for (const event of ['popstate','hashchange',siteNavigationEvent]) window.addEventListener(event,showSurface);
  showSurface();
}

if (location.hostname==='www.factner.com') redirectFromWww();
else startApp();
