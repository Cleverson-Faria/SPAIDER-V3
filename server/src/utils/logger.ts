/**
 * Logger para operações SAP
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL as keyof typeof LOG_LEVELS] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

function formatMessage(level: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [SAP] [${level}] ${message}${dataStr}`;
}

export const logger = {
  debug(message: string, data?: any) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, data));
    }
  },

  info(message: string, data?: any) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(`🔍 [SAP] ${message}`, data ? data : '');
    }
  },

  warn(message: string, data?: any) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(`⚠️ [SAP] ${message}`, data ? data : '');
    }
  },

  error(message: string, error?: Error, data?: any) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(`❌ [SAP] ${message}`, error?.message || '', data ? data : '');
    }
  },

  apiRequest(method: string, url: string, data?: any) {
    console.log(`📡 [SAP] ${method} ${url.replace(/https?:\/\/[^\/]+/, '[BASE]')}`, data ? data : '');
  },

  apiResponse(method: string, status: number, duration: number, data?: any) {
    const emoji = status >= 200 && status < 300 ? '✅' : '❌';
    console.log(`${emoji} [SAP] ${method} Response: ${status} (${duration}ms)`, data ? data : '');
  },
};

export function formatBillingDocumentNumber(billingDocument: string): string {
  if (!billingDocument || billingDocument === 'undefined' || billingDocument === 'null') {
    throw new Error(`Invalid billing document: ${billingDocument}`);
  }
  
  const cleanDoc = String(billingDocument).trim();
  if (cleanDoc.length === 0) {
    throw new Error('Empty billing document');
  }
  
  // Pad with zeros to 10 characters
  return cleanDoc.padStart(10, '0');
}

