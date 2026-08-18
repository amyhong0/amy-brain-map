export interface VisitLike {
  domain: string;
  title?: string;
  url?: string;
  normalizedUrl?: string;
}

const AUTH_SUBDOMAIN_PATTERN = /(^|\.)(accounts?|auth|login|signin|sso|oauth)\./i;
const AUTH_PATH_PATTERN = /(?:^|\/)(?:login|log-in|signin|sign-in|signon|sso|oauth|authorize|auth)(?:\/|$|[?#])/i;
const AUTH_TITLE_PATTERN = /(?:로그인|log\s*in|sign\s*in|signon|계정\s*(?:로그인|인증)|account\s*(?:login|sign\s*in))/i;

export function isAuthenticationDomain(domain: string) {
  return AUTH_SUBDOMAIN_PATTERN.test(domain.replace(/^www\./i, '').trim());
}

export function isAuthenticationVisit(visit: VisitLike) {
  const domain = visit.domain || '';
  const title = visit.title || '';
  const url = visit.normalizedUrl || visit.url || '';
  return isAuthenticationDomain(domain) || AUTH_PATH_PATTERN.test(url) || AUTH_TITLE_PATTERN.test(title);
}

export function nonAuthenticationDomains(domains: string[]) {
  return [...new Set(domains.filter((domain) => !isAuthenticationDomain(domain)))];
}
