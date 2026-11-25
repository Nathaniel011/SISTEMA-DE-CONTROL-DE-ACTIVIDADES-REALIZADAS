import {environment} from './environment';

export function isApiRequest(url: string): boolean {
  if (!environment.apiUrl) return url.startsWith('/api/');
  try {
    const base = new URL(environment.apiUrl);
    const target = new URL(url);
    return target.origin === base.origin && target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/api/`);
  } catch {
    return false;
  }
}

export function isPublicApiRequest(url: string): boolean {
  return isApiRequest(url) && url.slice(environment.apiUrl.length).startsWith('/api/public/');
}
