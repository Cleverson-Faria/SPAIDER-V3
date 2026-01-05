/**
 * Serviço de Autenticação SAP
 * Gerencia CSRF tokens e cookies de sessão
 */

import { parseCookies, buildCookieString, filterSapCookies } from '../utils/cookies';
import { logger } from '../utils/logger';

interface CsrfResult {
  csrfToken: string | null;
  cookiesString: string;
}

/**
 * Obtém CSRF token do SAP fazendo uma requisição GET
 */
export async function getCsrfToken(baseUrl: string, auth: string): Promise<CsrfResult> {
  logger.info('Fetching CSRF token...');
  const startTime = Date.now();
  
  // Fazer requisição dummy para obter CSRF token
  const csrfUrl = `${baseUrl}/A_SalesOrder('1')`;
  
  const response = await fetch(csrfUrl, {
    method: 'GET',
    headers: {
      'Authorization': auth,
      'x-csrf-token': 'Fetch',
      'Accept': 'application/json',
      'User-Agent': 'SPAIDER-SAP-Client/1.0',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });

  const duration = Date.now() - startTime;
  logger.info(`CSRF request completed in ${duration}ms, status: ${response.status}`);

  const csrfToken = response.headers.get('x-csrf-token');
  const rawCookies = response.headers.get('set-cookie');

  let cookiesString = '';
  
  if (csrfToken && rawCookies) {
    const parsedCookies = parseCookies(rawCookies);
    const essentialCookies = filterSapCookies(parsedCookies);
    cookiesString = buildCookieString(essentialCookies);
    
    logger.info('CSRF authentication successful', {
      tokenPresent: !!csrfToken,
      cookieCount: Object.keys(essentialCookies).length,
    });
  } else {
    logger.error('Failed to obtain CSRF token or cookies', undefined, {
      csrfTokenPresent: !!csrfToken,
      cookiesPresent: !!rawCookies,
    });
  }

  return {
    csrfToken,
    cookiesString,
  };
}

/**
 * Constrói string de autenticação Basic
 */
export function buildBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/**
 * Constrói URL base da API SAP
 */
export function buildSapBaseUrl(baseUrl: string, apiPath: string = 'API_SALES_ORDER_SRV'): string {
  // Remove trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  return `${cleanBaseUrl}/sap/opu/odata/sap/${apiPath}`;
}

