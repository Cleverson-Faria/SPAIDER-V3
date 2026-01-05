import { prisma } from "../prisma";
import { buildBasicAuth, buildSapBaseUrl, getCsrfToken } from "./sapAuth";
import {
  fetchSalesOrder,
  createSalesOrder,
  createOutboundDelivery,
  fetchDeliveryWithItems,
  pickAllItems,
  executePostGoodsIssue,
  createBillingDocument,
  fetchFiscalNote,
  buildNewOrderPayload,
} from "./sapApi";
import { compareOrders } from "./comparison";
import { saveComparisonToTables } from "./comparisonPersistence";
import { SapCredentials } from "./sapCredentialsResolver";

interface ReferenceOrder {
  order_number: string;
  domain: string | null;
  warehouse_code: string | null;
}

/**
 * Helper para salvar erro de uma etapa específica
 */
async function saveStepError(
  testExecutionId: string,
  stepName: string,
  error: any,
  endpoint?: string,
  payload?: any
) {
  const updateData: Record<string, any> = {
    [`${stepName}_status`]: "failed",
    global_status: "failed",
    updated_at: new Date(),
  };
  
  // Salvar dados do erro na etapa correspondente
  if (endpoint || payload || error) {
    updateData[`${stepName}_data`] = {
      endpoint: endpoint || null,
      method: 'POST',
      request: payload || null,
      error: {
        message: error.message,
        timestamp: new Date().toISOString()
      }
    };
  }
  
  await prisma.test_flow_executions.update({
    where: { id: testExecutionId },
    data: updateData
  });
}

/**
 * Executa o fluxo completo SAP em background
 */
export async function executeFullFlowInBackground(
  userId: string,
  organizationId: string,
  testExecutionId: string,
  runId: string,
  referenceOrder: ReferenceOrder,
  creds: SapCredentials
): Promise<void> {
  const auth = buildBasicAuth(creds.username, creds.password);
  const baseUrl = buildSapBaseUrl(creds.baseUrl);
  const deliveryBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');

  let newOrder: any = null;
  let delivery: any = null;
  let csrfToken: string | null = null;
  let cookiesString: string = '';

  // Step 1 e 2: Buscar ordem original e criar nova ordem
  try {
    console.log("📝 [FLOW] Step 1: Buscando ordem original");
    const original = await fetchSalesOrder(baseUrl, auth, referenceOrder.order_number);

    // Obter token CSRF
    const csrfResult = await getCsrfToken(baseUrl, auth);
    csrfToken = csrfResult.csrfToken;
    cookiesString = csrfResult.cookiesString;
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const newOrderPayload = buildNewOrderPayload(original, referenceOrder.order_number, referenceOrder.warehouse_code);
    const postHeaders = {
      Authorization: auth,
      "x-csrf-token": csrfToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookiesString,
    };

    console.log("📝 [FLOW] Step 2: Criando nova ordem");
    newOrder = await createSalesOrder(baseUrl, postHeaders, newOrderPayload);
    console.log("✅ [FLOW] Ordem criada:", newOrder.SalesOrder);

    // Step 2.5: Buscar nova ordem completa e comparar
    console.log("🔍 [FLOW] Buscando nova ordem para comparação...");
    const newOrderComplete = await fetchSalesOrder(baseUrl, auth, newOrder.SalesOrder);
    
    console.log("📊 [FLOW] Executando comparação de ordens...");
    const comparisonResult = compareOrders(original, newOrderComplete);
    console.log(`✅ [FLOW] Comparação concluída: ${comparisonResult.summary.totalDifferences} diferenças`);

    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        order_id: newOrder.SalesOrder,
        order_status: "completed",
        completed_steps: 1,
        order_data: {
          endpoint: `${baseUrl}/A_SalesOrder`,
          method: 'POST',
          request: newOrderPayload,
          response: newOrderComplete
        },
        raw_comparison_data: comparisonResult as any,
        total_differences: comparisonResult.summary.totalDifferences,
        sections_with_differences: comparisonResult.summary.sectionsWithDifferences,
      }
    });

    // Salvar comparação nas tabelas dedicadas
    console.log("💾 [FLOW] Salvando comparação nas tabelas dedicadas...");
    await saveComparisonToTables(testExecutionId, comparisonResult);

  } catch (error: any) {
    console.error("❌ [FLOW] Erro na criação da ordem:", error.message);
    await saveStepError(testExecutionId, 'order', error, `${baseUrl}/A_SalesOrder`);
    return; // Parar fluxo se ordem falhar
  }

  // Step 3: Criar remessa
  try {
    console.log("📦 [FLOW] Step 3: Criando remessa");
    const deliveryPayload = {
      to_DeliveryDocumentItem: {
        results: [{ ReferenceSDDocument: newOrder.SalesOrder }],
      },
    };
    
    delivery = await createOutboundDelivery(baseUrl, auth, csrfToken!, cookiesString, newOrder.SalesOrder);
    
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        delivery_id: delivery.DeliveryDocument,
        delivery_status: "completed",
        delivery_data: {
          endpoint: `${deliveryBaseUrl}/A_OutbDeliveryHeader`,
          method: 'POST',
          request: deliveryPayload,
          response: delivery
        },
        completed_steps: 2,
      }
    });
    console.log("✅ [FLOW] Remessa criada:", delivery.DeliveryDocument);
  } catch (error: any) {
    console.error("❌ [FLOW] Erro ao criar remessa:", error.message);
    const deliveryPayload = {
      to_DeliveryDocumentItem: {
        results: [{ ReferenceSDDocument: newOrder.SalesOrder }],
      },
    };
    await saveStepError(
      testExecutionId, 
      'delivery', 
      error, 
      `${deliveryBaseUrl}/A_OutbDeliveryHeader`,
      deliveryPayload
    );
    return; // Parar fluxo se remessa falhar
  }

  // Step 4: Picking
  try {
    console.log("📋 [FLOW] Step 4: Executando picking");
    const deliveryWithItems = await fetchDeliveryWithItems(baseUrl, auth, delivery.DeliveryDocument);
    await pickAllItems(baseUrl, auth, csrfToken!, cookiesString, delivery.DeliveryDocument, deliveryWithItems.headerETag || undefined);
    
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        picking_status: "completed",
        completed_steps: 3,
      }
    });
    console.log("✅ [FLOW] Picking concluído");
  } catch (error: any) {
    console.error("❌ [FLOW] Erro no picking:", error.message);
    await saveStepError(
      testExecutionId, 
      'picking', 
      error, 
      `${deliveryBaseUrl};v=0002/PickAllItems?DeliveryDocument='${delivery.DeliveryDocument}'`
    );
    return; // Parar fluxo se picking falhar
  }

  // Step 5: PGI
  try {
    console.log("📤 [FLOW] Step 5: Executando PGI");
    await executePostGoodsIssue(baseUrl, auth, csrfToken!, cookiesString, delivery.DeliveryDocument);
    
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        pgi_status: "completed",
        completed_steps: 4,
      }
    });
    console.log("✅ [FLOW] PGI concluído");
  } catch (error: any) {
    console.error("❌ [FLOW] Erro no PGI:", error.message);
    await saveStepError(
      testExecutionId, 
      'pgi', 
      error, 
      `${deliveryBaseUrl};v=0002/PostGoodsIssue?DeliveryDocument='${delivery.DeliveryDocument}'`
    );
    return; // Parar fluxo se PGI falhar
  }

  // Step 6: Billing (se API disponível)
  if (creds.hasApis?.billing) {
    try {
      console.log("💰 [FLOW] Step 6: Criando faturamento");
      const sapBaseUrlClean = baseUrl.split('/sap/opu/odata')[0];
      const billingEndpoint = `${sapBaseUrlClean}/sap/bc/spaider/createbilldoc`;
      const billingPayload = {
        docReference: delivery.DeliveryDocument,
        categoryDoc: 'J',
      };
      const billing = await createBillingDocument(baseUrl, auth, csrfToken!, cookiesString, delivery.DeliveryDocument);
      
      await prisma.test_flow_executions.update({
        where: { id: testExecutionId },
        data: { 
          billing_id: billing.BillingDocument,
          billing_status: "completed",
          billing_data: {
            endpoint: billingEndpoint,
            method: 'POST',
            request: billingPayload,
            response: billing
          },
          completed_steps: 5,
        }
      });
      console.log("✅ [FLOW] Faturamento criado:", billing.BillingDocument);

      // Step 7: NFe (se API disponível)
      if (creds.hasApis?.nfe && billing.BillingDocument) {
        console.log("📄 [FLOW] Step 7: Consultando NF-e");
        await prisma.test_flow_executions.update({
          where: { id: testExecutionId },
          data: { nfe_status: "processing" }
        });

        // Aguardar e tentar buscar NF-e
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
          const formattedBillingDoc = billing.BillingDocument.toString().padStart(10, '0');
          const nfeEndpoint = `${sapBaseUrlClean}/sap/bc/spaider/NfeDocument/BR_NFSourceDocumentNumber/${formattedBillingDoc}`;
          const nfe = await fetchFiscalNote(baseUrl, auth, billing.BillingDocument);
          await prisma.test_flow_executions.update({
            where: { id: testExecutionId },
            data: { 
              nfe_number: nfe.NFeNumber || nfe.BRNFNumber,
              nfe_status: "completed",
              nfe_data: {
                endpoint: nfeEndpoint,
                method: 'GET',
                request: null,
                response: nfe
              },
              completed_steps: 6,
              global_status: "completed",
              updated_at: new Date()
            }
          });
          console.log("✅ [FLOW] NF-e obtida:", nfe.NFeNumber || nfe.BRNFNumber);
        } catch (nfeError: any) {
          console.warn("⚠️ [FLOW] NF-e não disponível ainda:", nfeError.message);
          await prisma.test_flow_executions.update({
            where: { id: testExecutionId },
            data: { 
              nfe_status: "failed",
              nfe_data: {
                error: { message: nfeError.message, timestamp: new Date().toISOString() }
              },
              global_status: "partial",
              updated_at: new Date()
            }
          });
        }
      } else {
        // NFe não habilitada, marcar como skipped
        await prisma.test_flow_executions.update({
          where: { id: testExecutionId },
          data: { 
            nfe_status: "skipped",
            completed_steps: 6,
            global_status: "completed",
            updated_at: new Date()
          }
        });
      }
    } catch (billingError: any) {
      console.warn("⚠️ [FLOW] Erro no billing:", billingError.message);
      const sapBaseUrlClean = baseUrl.split('/sap/opu/odata')[0];
      const billingEndpoint = `${sapBaseUrlClean}/sap/bc/spaider/createbilldoc`;
      const billingPayload = {
        docReference: delivery.DeliveryDocument,
        categoryDoc: 'J',
      };
      await saveStepError(testExecutionId, 'billing', billingError, billingEndpoint, billingPayload);
    }
  } else {
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        billing_status: "skipped",
        nfe_status: "skipped",
        completed_steps: 5,
        global_status: "completed",
        updated_at: new Date()
      }
    });
  }

  console.log("🏁 [FLOW] Fluxo completo finalizado");
}
