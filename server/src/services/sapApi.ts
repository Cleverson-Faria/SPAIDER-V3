/**
 * Serviço de API SAP
 * Funções para interagir com as APIs OData do SAP S/4HANA
 */

import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger, formatBillingDocumentNumber } from '../utils/logger';
import { saveSapLog, extractSapError } from './sapLogger';

// ===== TIPOS =====

interface SapHeaders {
  Authorization: string;
  'x-csrf-token'?: string;
  'Content-Type'?: string;
  Accept?: string;
  Cookie?: string;
  'If-Match'?: string;
}

interface DeliveryWithItems {
  header: any;
  headerETag: string | null;
  items: any[];
}

// Contexto de logging para rastrear requisições
export interface SapLogContext {
  userId?: string;
  organizationId?: string;
  testExecutionId?: string;
}

// Contexto global para logging (setado antes das operações)
let currentLogContext: SapLogContext = {};

/**
 * Define o contexto de logging para as próximas operações SAP
 */
export function setSapLogContext(context: SapLogContext) {
  currentLogContext = context;
}

/**
 * Limpa o contexto de logging
 */
export function clearSapLogContext() {
  currentLogContext = {};
}

// ===== ORDENS DE VENDA =====

/**
 * Consulta uma ordem de venda no SAP
 */
export async function fetchSalesOrder(
  baseUrl: string,
  auth: string,
  orderId: string,
  expandClause: string = 'to_Item/to_PricingElement,to_Partner'
): Promise<any> {
  const url = `${baseUrl}/A_SalesOrder('${orderId}')?$expand=${expandClause}`;
  logger.apiRequest('GET', url, { orderId, operation: 'fetchSalesOrder' });

  const startTime = Date.now();
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
    timeoutMs: 15000,
  });

  const duration = Date.now() - startTime;
  logger.apiResponse('GET', response.status, duration, { orderId });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch sales order', new Error(errorText), { orderId, status: response.status });
    throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
  }

  const result = await response.json() as { d: unknown };
  logger.info('Sales order fetched successfully', { orderId });
  return result.d;
}

/**
 * Cria uma nova ordem de venda no SAP (replicação)
 */
export async function createSalesOrder(
  baseUrl: string,
  headers: Record<string, string>,
  payload: any
): Promise<any> {
  const url = `${baseUrl}/A_SalesOrder`;
  logger.info('Creating new sales order via replication');
  logger.apiRequest('POST', url);

  const startTime = Date.now();
  let responseText = '';
  let responseStatus = 0;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeoutMs: 20000,
    });

    const duration = Date.now() - startTime;
    responseStatus = response.status;
    responseText = await response.text();
    
    logger.apiResponse('POST', response.status, duration, { operation: 'createSalesOrder' });

    // Salvar log da requisição
    const errorInfo = !response.ok ? extractSapError(responseText) : {};
    await saveSapLog({
      ...currentLogContext,
      operation: 'createSalesOrder',
      httpMethod: 'POST',
      endpoint: url,
      requestHeaders: headers,
      requestPayload: payload,
      responsePayload: responseText ? JSON.parse(responseText).d || JSON.parse(responseText) : null,
      responseStatus: response.status,
      success: response.ok,
      errorCode: errorInfo.code,
      errorMessage: errorInfo.message,
      durationMs: duration,
    }).catch(e => console.error('Erro ao salvar log:', e));

    if (!response.ok) {
      logger.error('Failed to create sales order', new Error(responseText.substring(0, 200)));
      throw new Error(`Failed to create order: ${response.status} - ${responseText.substring(0, 500)}`);
    }

    const result = JSON.parse(responseText);
    logger.info('Sales order created successfully', { orderId: result.d.SalesOrder });
    return result.d;
  } catch (error: any) {
    // Se o erro não foi de resposta HTTP, salvar log de erro
    if (responseStatus === 0) {
      const duration = Date.now() - startTime;
      await saveSapLog({
        ...currentLogContext,
        operation: 'createSalesOrder',
        httpMethod: 'POST',
        endpoint: url,
        requestHeaders: headers,
        requestPayload: payload,
        responseStatus: 0,
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        durationMs: duration,
      }).catch(e => console.error('Erro ao salvar log:', e));
    }
    throw error;
  }
}

// ===== REMESSAS (DELIVERY) =====

/**
 * Cria uma remessa (Outbound Delivery) para uma ordem de venda
 */
export async function createOutboundDelivery(
  baseUrl: string,
  auth: string,
  csrfToken: string,
  cookiesString: string,
  salesOrderId: string
): Promise<any> {
  const deliveryBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');
  const url = `${deliveryBaseUrl}/A_OutbDeliveryHeader`;

  logger.info('Creating outbound delivery for sales order', { salesOrderId });

  const payload = {
    to_DeliveryDocumentItem: {
      results: [{ ReferenceSDDocument: salesOrderId }],
    },
  };

  const headers = {
    Authorization: auth,
    'x-csrf-token': csrfToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: cookiesString,
  };

  const startTime = Date.now();
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    timeoutMs: 20000,
  });

  const duration = Date.now() - startTime;
  logger.apiResponse('POST', response.status, duration, { salesOrderId, operation: 'createOutboundDelivery' });

  if (!response.ok) {
    const errorText = await response.text();

    // Verificar se a remessa já existe
    if (errorText.includes('already exists') || errorText.includes('já existe')) {
      logger.info('Delivery already exists, attempting to extract ID from error', { salesOrderId });
      const deliveryIdMatch = errorText.match(/(\d{10})/);
      if (deliveryIdMatch) {
        return { DeliveryDocument: deliveryIdMatch[0], _alreadyExisted: true };
      }
    }

    logger.error('Failed to create outbound delivery', new Error(errorText.substring(0, 200)), { salesOrderId, status: response.status });
    throw new Error(`Failed to create delivery: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const result = await response.json() as { d: { DeliveryDocument: string } };
  logger.info('Outbound delivery created successfully', { salesOrderId, deliveryDocument: result.d.DeliveryDocument });
  return result.d;
}

/**
 * Busca uma remessa com seus itens e ETags
 */
export async function fetchDeliveryWithItems(
  baseUrl: string,
  auth: string,
  deliveryDocument: string
): Promise<DeliveryWithItems> {
  const deliveryBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');
  const url = `${deliveryBaseUrl}/A_OutbDeliveryHeader(DeliveryDocument='${deliveryDocument}')?$expand=to_DeliveryDocumentItem`;

  logger.info('Fetching delivery with items and ETags', { deliveryDocument });

  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch delivery with items', new Error(errorText), { deliveryDocument, status: response.status, duration });
    throw new Error(`Failed to fetch delivery: ${response.status}`);
  }

  const headerETag = response.headers.get('ETag');
  const data = await response.json() as { d: { to_DeliveryDocumentItem?: { results?: unknown[] } } };

  logger.info('Delivery fetched with items', {
    deliveryDocument,
    itemCount: data.d.to_DeliveryDocumentItem?.results?.length || 0,
    hasHeaderETag: !!headerETag,
    duration,
  });

  return {
    header: data.d,
    headerETag,
    items: data.d.to_DeliveryDocumentItem?.results || [],
  };
}

// ===== PICKING =====

/**
 * Executa PickAllItems para confirmar separação de todos os itens
 */
export async function pickAllItems(
  baseUrl: string,
  auth: string,
  csrfToken: string,
  cookiesString: string,
  deliveryDocument: string,
  headerETag?: string
): Promise<any> {
  const deliveryBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');
  const url = `${deliveryBaseUrl};v=0002/PickAllItems?DeliveryDocument='${deliveryDocument}'`;

  logger.info('Executing PickAllItems', { deliveryDocument, hasHeaderETag: !!headerETag });

  const headers: Record<string, string> = {
    Authorization: auth,
    'x-csrf-token': csrfToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: cookiesString,
  };

  if (headerETag) {
    headers['If-Match'] = headerETag;
  }

  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to execute PickAllItems', new Error(errorText), { deliveryDocument, status: response.status, duration });
    throw new Error(`Failed to pick all items: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  logger.info('PickAllItems executed successfully', { deliveryDocument, duration });
  return response.status === 200 ? await response.json() : { success: true };
}

// ===== PGI (POST GOODS ISSUE) =====

/**
 * Executa PGI (Post Goods Issue) com ETag atualizado
 */
export async function executePostGoodsIssue(
  baseUrl: string,
  auth: string,
  csrfToken: string,
  cookiesString: string,
  deliveryDocument: string
): Promise<any> {
  logger.info('Executing Post Goods Issue with fresh ETag', { deliveryDocument });

  // Step 1: GET delivery para obter ETag atualizado após Picking
  const deliveryWithItems = await fetchDeliveryWithItems(baseUrl, auth, deliveryDocument);

  // Step 2: POST PGI usando endpoint com ;v=0002
  const pgiBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');
  const url = `${pgiBaseUrl};v=0002/PostGoodsIssue?DeliveryDocument='${deliveryDocument}'`;

  logger.info('POST PGI with fresh ETag', { hasETag: !!deliveryWithItems.headerETag });

  const headers: Record<string, string> = {
    Authorization: auth,
    'x-csrf-token': csrfToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: cookiesString,
  };

  if (deliveryWithItems.headerETag) {
    headers['If-Match'] = deliveryWithItems.headerETag;
  }

  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 412) {
      logger.error('PGI failed - Precondition Failed (412)', new Error(errorText), { deliveryDocument, status: response.status, duration });
      throw new Error('PGI failed - Precondition Failed (412). ETag conflict even after refresh.');
    }

    logger.error('PGI failed', new Error(errorText), { deliveryDocument, status: response.status, duration });
    throw new Error(`Failed to execute PGI: ${response.status}`);
  }

  logger.info('PGI executed successfully with fresh ETag', { deliveryDocument, duration });
  return response.status === 200 ? await response.json() : { success: true };
}

// ===== FATURAMENTO (BILLING) =====

/**
 * Cria documento de faturamento via API SPAIDER customizada
 */
export async function createBillingDocument(
  baseUrl: string,
  auth: string,
  csrfToken: string,
  cookiesString: string,
  deliveryDocument: string
): Promise<any> {
  // Usar API customizada SPAIDER
  const sapBaseUrl = baseUrl.split('/sap/opu/odata')[0];
  const url = `${sapBaseUrl}/sap/bc/spaider/createbilldoc`;

  logger.info('Creating billing document via SPAIDER API', { deliveryDocument });

  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'x-csrf-token': csrfToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: cookiesString,
    },
    body: JSON.stringify({
      docReference: deliveryDocument,
      categoryDoc: 'J',
    }),
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to create billing document via SPAIDER', new Error(errorText), { deliveryDocument, status: response.status, duration });
    throw new Error(`Failed to create billing via SPAIDER: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as { 
    response?: { billingDocument?: string; messages?: unknown[] }; 
    billingDocument?: string; 
    BillingDocument?: string;
    billingType?: string;
    messages?: unknown[];
  };
  const billingDoc = result.response?.billingDocument || result.billingDocument || result.BillingDocument;

  logger.info('Billing document created successfully via SPAIDER', { deliveryDocument, billingDocument: billingDoc || 'NOT_FOUND', duration });

  return {
    BillingDocument: billingDoc,
    billingDocument: billingDoc,
    billingType: result.billingType || '',
    docReference: deliveryDocument,
    categoryDoc: 'J',
    response: result.response || result,
    messages: result.response?.messages || result.messages || [],
  };
}

// ===== NOTA FISCAL (NF-e) =====

/**
 * Consulta Nota Fiscal eletrônica via API SPAIDER
 */
export async function fetchFiscalNote(
  baseUrl: string,
  auth: string,
  billingDocument: string
): Promise<any> {
  const formattedBillingDoc = formatBillingDocumentNumber(billingDocument);
  const sapBaseUrl = baseUrl.split('/sap/opu/odata')[0];
  const url = `${sapBaseUrl}/sap/bc/spaider/NfeDocument/BR_NFSourceDocumentNumber/${formattedBillingDoc}`;

  logger.info('Fetching fiscal note (NF-e)', { billingDocument, formattedBillingDoc });

  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    logger.warn('NF-e not found or not accessible', { billingDocument, formattedBillingDoc, status: response.status, duration });
    throw new Error(`Failed to fetch fiscal note: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { NFeNumber?: string; nfeNumber?: string };

  logger.info('NF-e fetched successfully', { billingDocument, formattedBillingDoc, nfeNumber: result.NFeNumber || result.nfeNumber || 'N/A', duration });

  return result;
}

// ===== BILL OF LADING =====

/**
 * Busca Bill of Lading (Conhecimento de Embarque)
 */
export async function fetchBillOfLading(
  baseUrl: string,
  auth: string,
  deliveryDocument: string
): Promise<string> {
  const deliveryBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');
  const url = `${deliveryBaseUrl}/A_OutbDeliveryHeader('${deliveryDocument}')/BillOfLading`;

  logger.info('Fetching Bill of Lading', { deliveryDocument });

  const startTime = Date.now();
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
    timeoutMs: 15000,
  });

  const duration = Date.now() - startTime;
  logger.apiResponse('GET', response.status, duration, { deliveryDocument });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch Bill of Lading', new Error(errorText), { deliveryDocument, status: response.status });
    throw new Error(`Failed to fetch Bill of Lading for delivery ${deliveryDocument}: ${response.status}`);
  }

  const result = await response.json() as { d?: { BillOfLading?: string } };
  const billOfLading = result.d?.BillOfLading;

  if (!billOfLading) {
    logger.warn('Bill of Lading not found in response', { deliveryDocument });
    throw new Error(`Bill of Lading not found for delivery ${deliveryDocument}`);
  }

  logger.info('Bill of Lading fetched successfully', { deliveryDocument, billOfLading });
  return billOfLading;
}

// ===== PROCESSADOR DE PAYLOAD DE ORDEM =====

/**
 * Constrói payload para replicação de ordem
 * Modelo alinhado com estrutura atualizada SAP
 */
export function buildNewOrderPayload(
  original: any, 
  originalOrderId: string, 
  warehouseCode?: string | null
): any {
  logger.info(`Building new order payload from order ${originalOrderId}`);
  
  if (warehouseCode) {
    logger.info(`Using warehouse code from reference order: ${warehouseCode}`);
  } else {
    logger.info(`No warehouse code provided, using original StorageLocation`);
  }
  
  // Coletar condições de cabeçalho vindas dos itens (PrcgProcedureCounterForHeader === "1")
  const headerConditionsFromItems: any[] = [];
  
  // Build items with only manually changed pricing elements
  const items = original.to_Item?.results?.map((item: any, index: number) => {
    // Filter only manually changed pricing elements
    const allPricingElements = item.to_PricingElement?.results || [];
    const manualConditions = allPricingElements.filter(
      (pe: any) => pe.ConditionIsManuallyChanged === true || pe.ConditionIsManuallyChanged === 'true'
    );

    // Separar condições: cabeçalho (PrcgProcedureCounterForHeader === "1") vs item
    const headerLevelConditions = manualConditions.filter(
      (pe: any) => pe.PrcgProcedureCounterForHeader === "1" || pe.PrcgProcedureCounterForHeader === 1
    );
    const itemLevelConditions = manualConditions.filter(
      (pe: any) => pe.PrcgProcedureCounterForHeader !== "1" && pe.PrcgProcedureCounterForHeader !== 1
    );

    // Acumular condições de cabeçalho vindas dos itens
    headerConditionsFromItems.push(...headerLevelConditions);

    logger.info(`Item ${index + 1}: ${manualConditions.length} manual conditions (${itemLevelConditions.length} item-level, ${headerLevelConditions.length} header-level)`);
    
    // Log excluded automatic conditions
    const autoConditions = allPricingElements.filter(
      (pe: any) => pe.ConditionIsManuallyChanged !== true && pe.ConditionIsManuallyChanged !== 'true'
    );
    if (autoConditions.length > 0) {
      logger.info(`Item ${index + 1}: Excluded ${autoConditions.length} automatic conditions: ${autoConditions.map((c: any) => c.ConditionType).join(', ')}`);
    }

    // Build item object with new model fields - apenas condições de nível de item
    const itemPayload: any = {
      SalesOrderItemCategory: item.SalesOrderItemCategory,
      SalesOrderItem: item.SalesOrderItem,
      RequestedQuantityISOUnit: item.RequestedQuantityISOUnit || "",
      ProductionPlant: item.ProductionPlant,
      DeliveryPriority: item.DeliveryPriority || "0",
      TransactionCurrency: item.TransactionCurrency,
      IncotermsClassification: item.IncotermsClassification,
      IncotermsTransferLocation: item.IncotermsTransferLocation,
      PurchaseOrderByCustomer: original.PurchaseOrderByCustomer,
      Material: item.Material,
      RequestedQuantity: item.RequestedQuantity,
      StorageLocation: warehouseCode || item.StorageLocation,
      to_PricingElement: {
        results: itemLevelConditions.map((pe: any) => ({
          ConditionCurrency: pe.ConditionCurrency,
          ConditionType: pe.ConditionType,
          ConditionRateValue: pe.ConditionRateValue
        }))
      }
    };

    // Add HigherLevelItem if exists (for service items)
    if (item.HigherLevelItem) {
      itemPayload.HigherLevelItem = item.HigherLevelItem;
    }

    return itemPayload;
  }) || [];

  const totalItemPricingElements = items.reduce((sum: number, item: any) => 
    sum + (item.to_PricingElement?.results?.length || 0), 0
  );

  logger.info(`New order payload prepared with ${items.length} items and ${totalItemPricingElements} item-level pricing elements`);

  // Filter header-level manually changed pricing elements from original header
  const headerPricingElementsFromHeader = (original.to_PricingElement?.results || []).filter(
    (pe: any) => pe.ConditionIsManuallyChanged === true || pe.ConditionIsManuallyChanged === 'true'
  );

  // Combinar: condições do cabeçalho original + condições dos itens com PrcgProcedureCounterForHeader === "1"
  const allHeaderPricingElements = [...headerPricingElementsFromHeader, ...headerConditionsFromItems];
  
  if (headerConditionsFromItems.length > 0) {
    logger.info(`Found ${headerConditionsFromItems.length} header-level conditions from items (PrcgProcedureCounterForHeader=1): ${headerConditionsFromItems.map((c: any) => c.ConditionType).join(', ')}`);
  }
  logger.info(`Total header-level pricing elements: ${allHeaderPricingElements.length} (${headerPricingElementsFromHeader.length} from header + ${headerConditionsFromItems.length} from items)`);

  // Build payload with new model structure
  const payload: any = {
    // Header fields
    SalesOrderType: original.SalesOrderType,
    CustomerGroup: original.CustomerGroup || null,
    PurchaseOrderByShipToParty: original.PurchaseOrderByShipToParty || null,
    CustomerPaymentTerms: original.CustomerPaymentTerms,
    CompleteDeliveryIsDefined: original.CompleteDeliveryIsDefined ?? true,
    SalesOrganization: original.SalesOrganization,
    DistributionChannel: original.DistributionChannel,
    OrganizationDivision: original.OrganizationDivision,
    SalesGroup: original.SalesGroup || null,
    SalesOffice: original.SalesOffice || null,
    TransactionCurrency: original.TransactionCurrency,
    PaymentMethod: original.PaymentMethod || null,
    IncotermsClassification: original.IncotermsClassification,
    IncotermsTransferLocation: original.IncotermsTransferLocation,
    SoldToParty: original.SoldToParty,
    PurchaseOrderByCustomer: `REF_${originalOrderId}`,
    CustomerPurchaseOrderType: original.CustomerPurchaseOrderType || null,
    HeaderBillingBlockReason: original.HeaderBillingBlockReason || null,
    DeliveryBlockReason: original.DeliveryBlockReason || null,
    RequestedDeliveryDate: original.RequestedDeliveryDate || null,
    CustomerPurchaseOrderSuplmnt: original.CustomerPurchaseOrderSuplmnt || null,
    
    // Items
    to_Item: {
      results: items
    }
  };

  // Partners - só incluir to_Partner se tiver parceiros do tipo Supplier (ex: transportadoras)
  // Parceiros do tipo Customer são inferidos automaticamente pelo SAP a partir do SoldToParty
  const supplierPartners = (original.to_Partner?.results || [])
    .filter((partner: any) => partner.Supplier)
    .map((partner: any) => ({
      PartnerFunction: partner.PartnerFunction,
      Supplier: partner.Supplier
    }));

  if (supplierPartners.length > 0) {
    logger.info(`Adding ${supplierPartners.length} supplier partners to payload`);
    payload.to_Partner = {
      results: supplierPartners
    };
  } else {
    logger.info(`No supplier partners found, using SoldToParty from header only`);
  }

  // Add header-level pricing elements if any (from header + from items with PrcgProcedureCounterForHeader=1)
  if (allHeaderPricingElements.length > 0) {
    payload.to_PricingElement = {
      results: allHeaderPricingElements.map((pe: any) => ({
        ConditionCurrency: pe.ConditionCurrency,
        ConditionType: pe.ConditionType,
        ConditionRateValue: pe.ConditionRateValue
      }))
    };
  }

  // Add texts if available
  if (original.to_Text?.results?.length > 0) {
    payload.to_Text = {
      results: original.to_Text.results.map((text: any) => ({
        LongTextID: text.LongTextID,
        LongText: text.LongText,
        Language: text.Language || "PT"
      }))
    };
  }

  return payload;
}

// ===== TESTAR CREDENCIAIS =====

/**
 * Testa conexão com as credenciais SAP
 */
export async function testSapConnection(
  baseUrl: string,
  auth: string
): Promise<{ success: boolean; message: string; duration: number }> {
  const url = `${baseUrl}/A_SalesOrder?$top=1`;
  logger.info('Testing SAP connection', { url: url.replace(/https?:\/\/[^\/]+/, '[BASE]') });

  const startTime = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
      timeoutMs: 15000,
    });

    const duration = Date.now() - startTime;

    if (response.ok) {
      logger.info('SAP connection successful', { duration });
      return { success: true, message: `Conexão bem sucedida! (${duration}ms)`, duration };
    } else {
      const errorText = await response.text();
      logger.error('SAP connection failed', new Error(errorText.substring(0, 100)), { status: response.status });
      return { success: false, message: `Erro ${response.status}: ${errorText.substring(0, 100)}`, duration };
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('SAP connection error', error);
    return { success: false, message: error.message, duration };
  }
}

