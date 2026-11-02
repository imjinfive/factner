export const designerNotice = '디자이너 서비스는 오픈 준비 중입니다.';

export function isPackagingPartner(kind) {
  return kind === 'packaging' || kind === 'both';
}

export function isDesignerTestAccount(account) {
  return account?.kind === 'design' && (
    (account.id === 'seed-design1' && account.email === 'design1@gmail.com') ||
    (account.id === 'seed-design2' && account.email === 'design2@gmail.com')
  );
}
