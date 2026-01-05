/**
 * Utilitários para manipulação de cookies SAP
 */

export function parseCookies(rawCookies: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  if (!rawCookies) return cookies;
  
  // Split by comma, but be careful with dates that contain commas
  const cookieParts = rawCookies.split(/,(?=\s*[^;=]+=[^;]+)/);
  
  for (const part of cookieParts) {
    const cookieMatch = part.match(/^\s*([^=]+)=([^;]*)/);
    if (cookieMatch) {
      const name = cookieMatch[1].trim();
      const value = cookieMatch[2].trim();
      cookies[name] = value;
    }
  }
  
  return cookies;
}

export function buildCookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function filterSapCookies(cookies: Record<string, string>): Record<string, string> {
  const essentialCookies: Record<string, string> = {};
  
  Object.entries(cookies).forEach(([name, value]) => {
    if (
      name.startsWith('SAP_') ||
      name.startsWith('MYSAP') ||
      name.includes('SESSIONID') ||
      name === 'sap-usercontext'
    ) {
      essentialCookies[name] = value;
    }
  });
  
  return essentialCookies;
}

