export const siteNavigationEvent = 'factner:navigation';
const marketViews = new Set(['intro','feed','mine','new','contracts','login','signup','account','find-id','recover-password','reset-password','privacy','terms','policy']);
const memberPages = new Set(['intro','request','guide','account','activity']);

// Old links still open their intended screen. New entries store the destination in browser history.
export function siteLocation({pathname, hash}, state = {}) {
  const previous = state || {};
  const path = pathname.replace(/\/+$/, '');
  const surface = path === '/members' || path === '/members/index.html' ? 'members'
    : path === '/ops' ? 'ops'
    : ['members','ops'].includes(previous.factnerSurface) ? previous.factnerSurface : 'market';
  const fragment = hash.slice(1);
  if (surface === 'members') {
    const route = fragment || previous.factnerPage || previous.factnerRoute;
    return {surface,route:memberPages.has(route) ? route : 'account'};
  }
  const [view,detail] = (fragment || previous.factnerRoute || '').split('/');
  if (view === 'preview') return {surface:'market',route:'feed'};
  if (view === 'demo') return {surface,route:'login'};
  const fallback = surface === 'ops' ? 'contracts' : 'intro';
  if (!marketViews.has(view)) return {surface,route:fallback};
  return {surface,route:['feed','mine','new'].includes(view) && /^[\w-]{1,64}$/.test(detail || '') ? view+'/'+detail : view};
}

function entryState(surface, route, entry) {
  const next = {...entry,factnerSurface:surface,factnerRoute:route};
  if (surface==='members') next.factnerPage=route;
  return next;
}

export function normalizeSiteEntry() {
  const {surface,route} = siteLocation(location,history.state);
  if(location.pathname!=='/' || location.hash || location.search ||
     history.state?.factnerSurface!==surface || history.state?.factnerRoute!==route) {
    history.replaceState(entryState(surface,route,history.state),'','/');
  }
  return {surface,route};
}

export function writeSiteEntry(surface, route, {replace=false,entry={}} = {}) {
  const next = entryState(surface,route,entry);
  history[replace?'replaceState':'pushState'](next,'','/');
  window.dispatchEvent(new Event(siteNavigationEvent));
}
