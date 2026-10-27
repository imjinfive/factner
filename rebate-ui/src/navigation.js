export function pageFromHistory(page) {
  return ['intro', 'request', 'guide', 'account', 'activity'].includes(page) ? page : 'intro';
}

// Keep only non-sensitive matching choices in browser history.
export function matchingFromHistory(state, member) {
  const saved = state?.matching || {};
  const sameMember = (saved.memberId || null) === (member?.id || null);
  const role = member?.role || saved.form?.role;
  const category = saved.form?.category;
  const capacity = saved.form?.capacity;
  const stage = sameMember && member && ['results', 'review', 'submitted'].includes(saved.stage) && ['box', 'packaging', 'supplies'].includes(category) ? saved.stage : 'form';
  return {
    memberId: member?.id || null,
    stage,
    depth: stage === 'form' ? 0 : stage === 'results' ? 1 : 2,
    form: {
      role: ['brand', 'supplier'].includes(role) ? role : '',
      category: ['box', 'packaging', 'supplies'].includes(category) ? category : '',
      region: 'all',
      capacity: ['5000', '30000', '100000', 'over'].includes(capacity) ? capacity : '30000',
    },
    selected: sameMember && Array.isArray(saved.selected) ? [...new Set(saved.selected.filter(id => typeof id === 'string'))] : [],
  };
}
