/**
 * Serviço de Logging para requisições SAP
 * Salva todas as requisições e respostas para debugging
 */

import { PrismaClient } from '@prisma/client';

// Importar prisma do módulo existente
let prismaInstance: PrismaClient | null = null;

export function setPrismaInstance(prisma: PrismaClient) {
  prismaInstance = prisma;
}

interface SapLogEntry {
  userId?: string;
  organizationId?: string;
  testExecutionId?: string;
  operation: string;
  httpMethod: string;
  endpoint: string;
  requestHeaders?: Record<string, any>;
  requestPayload?: any;
  responsePayload?: any;
  responseStatus?: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
}

/**
 * Salva um log de requisição SAP no banco de dados
 */
export async function saveSapLog(entry: SapLogEntry): Promise<void> {
  if (!prismaInstance) {
    console.warn('⚠️ [SAP LOG] Prisma não inicializado, log não será salvo');
    return;
  }

  try {
    // Sanitizar headers (remover auth)
    const sanitizedHeaders = entry.requestHeaders 
      ? sanitizeHeaders(entry.requestHeaders) 
      : undefined;

    await prismaInstance.sap_request_logs.create({
      data: {
        user_id: entry.userId,
        organization_id: entry.organizationId,
        test_execution_id: entry.testExecutionId,
        operation: entry.operation,
        http_method: entry.httpMethod,
        endpoint: entry.endpoint,
        request_headers: sanitizedHeaders,
        request_payload: entry.requestPayload,
        response_payload: entry.responsePayload,
        response_status: entry.responseStatus,
        success: entry.success,
        error_code: entry.errorCode,
        error_message: entry.errorMessage,
        duration_ms: entry.durationMs,
      }
    });

    console.log(`📝 [SAP LOG] ${entry.success ? '✅' : '❌'} ${entry.operation} logged`);
  } catch (error) {
    console.error('❌ [SAP LOG] Erro ao salvar log:', error);
  }
}

/**
 * Remove informações sensíveis dos headers
 */
function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized = { ...headers };
  
  // Remover ou mascarar headers sensíveis
  if (sanitized.Authorization) {
    sanitized.Authorization = '[REDACTED]';
  }
  if (sanitized.authorization) {
    sanitized.authorization = '[REDACTED]';
  }
  if (sanitized.Cookie) {
    sanitized.Cookie = '[REDACTED]';
  }
  if (sanitized.cookie) {
    sanitized.cookie = '[REDACTED]';
  }
  if (sanitized['x-csrf-token']) {
    sanitized['x-csrf-token'] = sanitized['x-csrf-token'].substring(0, 10) + '...';
  }
  
  return sanitized;
}

/**
 * Extrai código de erro e mensagem de uma resposta SAP
 */
export function extractSapError(responseText: string): { code?: string; message?: string } {
  try {
    const json = JSON.parse(responseText);
    
    // Formato OData error
    if (json.error) {
      return {
        code: json.error.code,
        message: json.error.message?.value || json.error.message
      };
    }
    
    // Outros formatos
    return {
      code: json.code,
      message: json.message || responseText.substring(0, 500)
    };
  } catch {
    // Não é JSON, retornar texto
    return {
      message: responseText.substring(0, 500)
    };
  }
}

/**
 * Wrapper para fetch que automaticamente salva logs
 */
export async function fetchWithLogging(
  url: string,
  options: RequestInit,
  logContext: {
    operation: string;
    userId?: string;
    organizationId?: string;
    testExecutionId?: string;
  }
): Promise<Response> {
  const startTime = Date.now();
  let response: Response | null = null;
  let responseText: string = '';
  let success = false;

  try {
    response = await fetch(url, options);
    responseText = await response.clone().text();
    success = response.ok;

    const duration = Date.now() - startTime;

    // Parsear resposta se for JSON
    let responsePayload: any = null;
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = { _raw: responseText.substring(0, 2000) };
    }

    // Parsear request body se existir
    let requestPayload: any = null;
    if (options.body) {
      try {
        requestPayload = typeof options.body === 'string' 
          ? JSON.parse(options.body) 
          : options.body;
      } catch {
        requestPayload = { _raw: String(options.body).substring(0, 2000) };
      }
    }

    // Extrair erro se não for sucesso
    const errorInfo = !success ? extractSapError(responseText) : {};

    // Salvar log
    await saveSapLog({
      ...logContext,
      httpMethod: options.method || 'GET',
      endpoint: url,
      requestHeaders: options.headers as Record<string, any>,
      requestPayload,
      responsePayload,
      responseStatus: response.status,
      success,
      errorCode: errorInfo.code,
      errorMessage: errorInfo.message,
      durationMs: duration,
    });

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Salvar log de erro de rede
    await saveSapLog({
      ...logContext,
      httpMethod: options.method || 'GET',
      endpoint: url,
      requestHeaders: options.headers as Record<string, any>,
      requestPayload: options.body ? JSON.parse(String(options.body)) : null,
      responseStatus: 0,
      success: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: error.message,
      durationMs: duration,
    });

    throw error;
  }
}

