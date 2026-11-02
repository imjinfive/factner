import React from 'react';

export function initialBidTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function saveBidTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('factner-bid-theme',theme); } catch {}
}

export function BidLoading({view}) {
  if (['login','signup','account','demo'].includes(view)) {
    return <section className="bl-loading bl-access" role="status" aria-label="계정 화면을 불러오는 중">
      <div className="bl-access-title" aria-hidden="true" /><div className="bl-access-card" aria-hidden="true" />
    </section>;
  }
  const board = view === 'feed' || view === 'mine';
  return <section className="bl-loading" role="status" aria-label="화면을 불러오는 중">
    {board && <div className="bl-cover" aria-hidden="true" />}
    <div className="bl-rows" aria-hidden="true" />
  </section>;
}
