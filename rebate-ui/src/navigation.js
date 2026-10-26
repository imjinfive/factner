export function pageFromHistory(page) {
  return ['intro', 'request', 'guide', 'account', 'activity'].includes(page) ? page : 'intro';
}
