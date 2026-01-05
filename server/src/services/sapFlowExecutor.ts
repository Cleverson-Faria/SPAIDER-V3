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

  try {
    // Step 1: Buscar ordem original
    console.log("📝 [FLOW] Step 1: Buscando ordem original");
    const original = await fetchSalesOrder(baseUrl, auth, referenceOrder.order_number);

    // Step 2: Criar nova ordem
    const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const newOrderPayload = buildNewOrderPayload(original, referenceOrder.order_number, referenceOrder.warehouse_code);
    const postHeaders = {
      Authorization: auth,
      "x-csrf-token": csrfToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookiesString,
    };

    const newOrder = await createSalesOrder(baseUrl, postHeaders, newOrderPayload);
    console.log("✅ [FLOW] Ordem criada:", newOrder.SalesOrder);

    // Step 2.5: Buscar nova ordem completa e comparar
    console.log("🔍 [FLOW] Buscando nova ordem para comparação...");
    const newOrderComplete = await fetchSalesOrder(baseUrl, auth, newOrder.SalesOrder);
    
    console.log("📊 [FLOW] Executando comparação de ordens...");
    const comparisonResult = compareOrders(original, newOrderComplete);
    console.log(`✅ [FLOW] Comparação concluída: ${comparisonResult.summary.totalDifferences} diferenças`);

    // Atualizar registro com dados de comparação
    // Salva endpoint, payload enviado (request) e resposta (response)
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        order_id: newOrder.SalesOrder,
        order_status: "completed",
        completed_steps: 1,
        order_data: {
          endpoint: `${baseUrl}/A_SalesOrder`,  // Endpoint utilizado
          method: 'POST',
          request: newOrderPayload,  // Payload enviado no POST
          response: newOrderComplete  // Resposta do GET após criação
        },
        raw_comparison_data: comparisonResult as any,
        total_differences: comparisonResult.summary.totalDifferences,
        sections_with_differences: comparisonResult.summary.sectionsWithDifferences,
      }
    });

    // Salvar comparação nas tabelas dedicadas
    console.log("💾 [FLOW] Salvando comparação nas tabelas dedicadas...");
    await saveComparisonToTables(testExecutionId, comparisonResult);

    // Step 3: Criar remessa
    console.log("📦 [FLOW] Step 3: Criando remessa");
    const deliveryBaseUrl = baseUrl.replace('API_SALES_ORDER_SRV', 'API_OUTBOUND_DELIVERY_SRV');
    const deliveryPayload = {
      to_DeliveryDocumentItem: {
        results: [{ ReferenceSDDocument: newOrder.SalesOrder }],
      },
    };
    const delivery = await createOutboundDelivery(baseUrl, auth, csrfToken, cookiesString, newOrder.SalesOrder);
    
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

    // Step 4: Picking
    console.log("📋 [FLOW] Step 4: Executando picking");
    const deliveryWithItems = await fetchDeliveryWithItems(baseUrl, auth, delivery.DeliveryDocument);
    const pickingResult = await pickAllItems(baseUrl, auth, csrfToken, cookiesString, delivery.DeliveryDocument, deliveryWithItems.headerETag || undefined);
    
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        picking_status: "completed",
        completed_steps: 3,
      }
    });

    // Step 5: PGI
    console.log("📤 [FLOW] Step 5: Executando PGI");
    const pgiResult = await executePostGoodsIssue(baseUrl, auth, csrfToken, cookiesString, delivery.DeliveryDocument);
    
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        pgi_status: "completed",
        completed_steps: 4,
      }
    });

    // Step 6: Billing (se API disponível)
    if (creds.hasApis?.billing) {
      console.log("💰 [FLOW] Step 6: Criando faturamento");
      try {
        const sapBaseUrlClean = baseUrl.split('/sap/opu/odata')[0];
        const billingEndpoint = `${sapBaseUrlClean}/sap/bc/spaider/createbilldoc`;
        const billingPayload = {
          docReference: delivery.DeliveryDocument,
          categoryDoc: 'J',
        };
        const billing = await createBillingDocument(baseUrl, auth, csrfToken, cookiesString, delivery.DeliveryDocument);
        
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
            // Formatar número do billing document (10 dígitos)
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
          } catch (nfeError) {
            console.warn("⚠️ [FLOW] NF-e não disponível ainda");
            await prisma.test_flow_executions.update({
              where: { id: testExecutionId },
              data: { 
                nfe_status: "failed",
                global_status: "partial",
                updated_at: new Date()
              }
            });
          }
        }
      } catch (billingError: any) {
        console.warn("⚠️ [FLOW] Erro no billing:", billingError.message);
        await prisma.test_flow_executions.update({
          where: { id: testExecutionId },
          data: { 
            billing_status: "failed",
            global_status: "partial",
            updated_at: new Date()
          }
        });
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

  } catch (error: any) {
    console.error("❌ [FLOW] Erro no fluxo:", error);
    await prisma.test_flow_executions.update({
      where: { id: testExecutionId },
      data: { 
        order_status: error.message.includes("order") ? "failed" : undefined,
        global_status: "failed",
        updated_at: new Date()
      }
    });
  }
}

