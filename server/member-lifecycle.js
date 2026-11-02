// The withdrawal cleanup keeps an anonymous member only to preserve order foreign keys.
export const currentMember=(alias='members')=>`${alias}.consent_version<>'order-archive-only'`;
