import { Router } from "express";
import { prisma } from "../prisma";
import { authenticate } from "../auth";
import { getCsrfToken, buildBasicAuth, buildSapBaseUrl } from "../services/sapAuth";
import { setSapLogContext } from "../services/sapApi";
import {
  fetchSalesOrder,
  createSalesOrder,
  createOutboundDelivery,
  fetchDeliveryWithItems,
  pickAllItems,
  executePostGoodsIssue,
  createBillingDocument,
  fetchFiscalNote,
  fetchBillOfLading,
  buildNewOrderPayload,
} from "../services/sapApi";
import { compareOrders } from "../services/comparison";
import { saveComparisonToTables } from "../services/comparisonPersistence";
import { resolveSapCredentials } from "../services/sapCredentialsResolver";
import { executeFullFlowInBackground } from "../services/sapFlowExecutor";
import { getOrCreateThread, callOpenAI, buildSpaiderSystemPrompt } from "../services/openai";

const router = Router();

// ═══════════════════════════════════════════════════════════════
// FUNÇÃO HELPER: Executar teste com ordem de referência
// ═══════════════════════════════════════════════════════════════
async function executeTestWithReferenceOrder(
  res: any,
  userId: string,
  organizationId: string,
  referenceOrder: any,
  creds: any,
  runId: string,
  char1Name: string,
  intent: string
) {
  const auth = buildBasicAuth(creds.username, creds.password);
  const baseUrl = buildSapBaseUrl(creds.baseUrl);

  // Variáveis para contexto de erro
  let currentEndpoint = "";
  let currentMethod = "GET";
  let currentPayload: any = null;

  try {
    if (intent === "TEST_ORDER_ONLY") {
      // Apenas criar ordem de venda
      currentEndpoint = `${baseUrl}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${referenceOrder.order_number}')`;
      currentMethod = "GET";
      
      const original = await fetchSalesOrder(baseUrl, auth, referenceOrder.order_number);
      const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
      if (!csrfToken) throw new Error("Falha ao obter token CSRF");

      const newOrderPayload = buildNewOrderPayload(original, referenceOrder.order_number, referenceOrder.warehouse_code);
      
      // Atualizar contexto para POST
      currentEndpoint = `${baseUrl}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder`;
      currentMethod = "POST";
      currentPayload = newOrderPayload;
      
      const postHeaders = {
        Authorization: auth,
        "x-csrf-token": csrfToken,
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookiesString,
      };

      const newOrder = await createSalesOrder(baseUrl, postHeaders, newOrderPayload);
    const newOrderComplete = await fetchSalesOrder(baseUrl, auth, newOrder.SalesOrder);
    const comparisonResult = compareOrders(original, newOrderComplete);

    const testExecution = await prisma.test_flow_executions.create({
      data: {
        run_id: runId,
        test_id: `test_${Date.now()}`,
        organization_id: organizationId,
        user_id: userId,
        test_type: "ordem_vendas",
        order_id: newOrder.SalesOrder,
        original_order_id: referenceOrder.order_number,
        sap_domain: referenceOrder.domain,
        order_status: "completed",
        global_status: "completed",
        total_steps: 1,
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

    await saveComparisonToTables(testExecution.id, comparisonResult);

    return res.json({
      success: true,
      response: `✅ Ordem de Venda criada com sucesso!\n\n📋 Ordem Original: ${referenceOrder.order_number}\n📋 Nova Ordem: ${newOrder.SalesOrder}\n📦 Tipo: ${char1Name}\n📊 Diferenças: ${comparisonResult.summary.totalDifferences}`,
      intent: "TEST_ORDER_ONLY",
      data: {
        run_id: runId,
        original_order: referenceOrder.order_number,
        new_order: newOrder.SalesOrder,
        characteristic_1: char1Name,
        total_differences: comparisonResult.summary.totalDifferences,
      },
      options: [],
      ui: {
        toast: { show: true, title: "✅ Teste Concluído!", description: `Ordem ${newOrder.SalesOrder} criada! Navegando para histórico...`, variant: "default" },
        navigate: {
          path: "/test-history",
          delay: 2000,
          state: { highlightRunId: runId }
        }
      }
    });

  } else if (intent === "TEST_FULL_FLOW") {
    // Fluxo completo
    const testExecution = await prisma.test_flow_executions.create({
      data: {
        run_id: runId,
        test_id: `test_${Date.now()}`,
        organization_id: organizationId,
        user_id: userId,
        test_type: "fluxo_completo",
        order_id: referenceOrder.order_number,
        original_order_id: referenceOrder.order_number,
        sap_domain: referenceOrder.domain,
        order_status: "processing",
        global_status: "processing",
        total_steps: 6,
        completed_steps: 0,
      }
    });

    res.json({
      success: true,
      response: `🚀 Iniciando fluxo completo para ${char1Name}...\n\n📋 Ordem de Referência: ${referenceOrder.order_number}\n⏳ Aguarde enquanto processo as etapas.`,
      intent: "TEST_FULL_FLOW",
      data: {
        run_id: runId,
        test_execution_id: testExecution.id,
        reference_order: referenceOrder.order_number,
        characteristic_1: char1Name,
      },
      progressData: {
        test_execution_id: testExecution.id,
        currentStep: "order",
        completedSteps: 0,
        totalSteps: 6
      },
      ui: {
        toast: { show: true, title: "Iniciando", description: "Fluxo completo em andamento...", variant: "default" },
        progress: { show: true, step: "order", percent: 0, test_execution_id: testExecution.id }
      }
    });

    // Executar fluxo em background
    executeFullFlowInBackground(
      userId,
      organizationId,
      testExecution.id,
      runId,
      referenceOrder,
      creds
    ).catch(err => console.error("Erro no fluxo em background:", err));

    return;
  } else {
    return res.status(400).json({
      error: "Intent não reconhecido",
      response: "Não entendi qual operação você deseja executar."
    });
  }
  } catch (error: any) {
    // Erro durante execução SAP - retornar com detalhes do payload
    console.error("❌ [SAP EXECUTE] Erro:", error.message);
    
    // Extrair erro SAP estruturado se possível
    let sapErrorDetails: any = null;
    const errorMessage = error.message || "";
    const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        sapErrorDetails = JSON.parse(jsonMatch[0]);
      } catch (e) {
        sapErrorDetails = { raw: errorMessage };
      }
    }
    
    return res.status(500).json({
      error: errorMessage,
      response: `❌ Erro na criação do documento`,
      errorLog: {
        endpoint: currentEndpoint,
        method: currentMethod,
        request: currentPayload,
        sapError: sapErrorDetails,
        rawError: sapErrorDetails ? undefined : errorMessage,
        timestamp: new Date().toISOString()
      }
    });
  }
}

// ===== CHAT / AI =====

/**
 * POST /api/functions/spaider-chat - Chat com IA
 */
router.post("/functions/spaider-chat", authenticate, async (req: any, res) => {
  try {
    const { messages } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Mensagens são obrigatórias" });
    }

    // Obter ou criar thread
    await getOrCreateThread(userId);

    // Buscar informações do usuário para contexto
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });

    // Construir prompt de sistema personalizado
    const systemPrompt = buildSpaiderSystemPrompt(
      profile?.organizations?.name || 'sua organização',
      profile?.full_name || 'usuário',
      profile?.email || 'não informado',
      profile?.organizations?.ai_instructions || ''
    );

    // Chamar OpenAI
    const assistantResponse = await callOpenAI(
      messages.map((m: any) => ({ role: m.role, content: m.content })),
      systemPrompt
    );

    // Tentar parsear JSON da resposta
    let parsedResponse: any = null;
    try {
      const jsonMatch = assistantResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      // Não é JSON, usar como texto puro
    }

    // Se temos JSON estruturado da IA, usar diretamente
    if (parsedResponse && parsedResponse.intent) {
      res.json({
        response: parsedResponse.response || assistantResponse,
        intent: parsedResponse.intent,
        continue_from_step: parsedResponse.continue_from_step || null,
        scenario: parsedResponse.scenario || null,
        entities: parsedResponse.entities || null,
        options: parsedResponse.options || [],
        ui: parsedResponse.ui || {
          navigate: "chat",
          comparator: { open: false, run_id: null, view: "summary" },
          toast: { show: false, title: null, description: null, variant: "default" },
          progress: { show: false, step: null, percent: 0 }
        }
      });
    } else {
      // Resposta de texto puro
      res.json({
        response: assistantResponse,
        intent: null,
        scenario: null,
        entities: null,
        options: [],
        ui: {
          navigate: "chat",
          comparator: { open: false, run_id: null, view: "summary" },
          toast: { show: false, title: null, description: null, variant: "default" },
          progress: { show: false, step: null, percent: 0 }
        }
      });
    }

  } catch (error: any) {
    console.error("❌ [CHAT] Error:", error);
    res.status(500).json({ 
      error: error.message,
      response: `Erro ao processar mensagem: ${error.message}`,
      intent: null,
      options: [],
      ui: {
        navigate: "chat",
        toast: { 
          show: true, 
          title: "Erro", 
          description: error.message,
          variant: "destructive" 
        }
      }
    });
  }
});

// ===== EXECUTAR TESTE SAP =====

/**
 * POST /api/sap/execute-test - Executar teste SAP baseado em características
 */
router.post("/execute-test", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { intent, scenario, continue_from_step, reference_order_id } = req.body;

    // Buscar perfil e organização do usuário
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });

    if (!profile?.organization_id) {
      return res.status(403).json({ 
        error: "Usuário sem organização",
        response: "Você precisa estar vinculado a uma organização para executar testes."
      });
    }

    // Setar contexto de logging
    setSapLogContext({
      userId,
      organizationId: profile.organization_id,
    });

    // ═══════════════════════════════════════════════════════════════
    // CAMINHO DIRETO: Se reference_order_id foi fornecido, pular busca
    // ═══════════════════════════════════════════════════════════════
    if (reference_order_id) {
      console.log(`\n═══════════════════════════════════════════════════════════════`);
      console.log(`🎯 [REFERENCE] SELEÇÃO DIRETA DE ORDEM DE REFERÊNCIA`);
      console.log(`   reference_order_id: ${reference_order_id}`);
      console.log(`═══════════════════════════════════════════════════════════════\n`);

      const referenceOrder = await prisma.reference_orders.findUnique({
        where: { id: reference_order_id },
        include: {
          characteristic_level_1: true,
          characteristic_level_2: true,
          characteristic_level_3: true,
        }
      });

      if (!referenceOrder) {
        return res.status(404).json({
          error: "Ordem de referência não encontrada",
          response: "A ordem de referência selecionada não foi encontrada."
        });
      }

      // Verificar se pertence à organização do usuário
      if (referenceOrder.organization_id !== profile.organization_id) {
        return res.status(403).json({
          error: "Acesso negado",
          response: "Você não tem permissão para acessar esta ordem de referência."
        });
      }

      console.log(`✅ [REFERENCE] Ordem selecionada diretamente: ${referenceOrder.order_number}`);

      // Resolver credenciais SAP
      const creds = await resolveSapCredentials(userId, referenceOrder.domain || undefined);
      const runId = `Test_${Date.now()}_${userId.substring(0, 8)}`;
      const char1Name = referenceOrder.characteristic_level_1?.name || 'N/A';
      const testIntent = intent || "TEST_ORDER_ONLY";

      // Executar o teste com a ordem selecionada
      return await executeTestWithReferenceOrder(
        res, userId, profile.organization_id, referenceOrder, creds, runId, char1Name, testIntent
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // CAMINHO PADRÃO: Busca por características
    // ═══════════════════════════════════════════════════════════════
    if (!intent || !scenario?.characteristic_1) {
      return res.status(400).json({ 
        error: "Intent e characteristic_1 são obrigatórios",
        response: "Preciso saber qual tipo de teste você deseja executar. Por exemplo: Venda Normal, Entrega Futura, Conta e Ordem, etc."
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MAPEAMENTO DE CÓDIGOS PARA UUIDs
    // As características são GLOBAIS (não filtradas por organization_id)
    // pois representam tipos de venda comuns a todas as organizações
    // ═══════════════════════════════════════════════════════════════
    
    console.log(`🔍 [REFERENCE] Buscando característica 1: "${scenario.characteristic_1}"`);
    
    // Buscar characteristic_level_1 pelo código (case insensitive) - SEM filtro de organization_id
    let char1 = await prisma.characteristic_level_1.findFirst({
      where: {
        code: {
          equals: scenario.characteristic_1,
          mode: 'insensitive'
        },
        is_active: true,
      }
    });

    // Se não encontrou pelo código, tentar pelo nome
    if (!char1) {
      console.log(`🔍 [REFERENCE] Não encontrou pelo código, tentando pelo nome...`);
      char1 = await prisma.characteristic_level_1.findFirst({
        where: {
          name: {
            contains: scenario.characteristic_1,
            mode: 'insensitive'
          },
          is_active: true,
        }
      });
    }

    // Se ainda não encontrou, listar todas as características para debug
    if (!char1) {
      const allChars = await prisma.characteristic_level_1.findMany({
        where: { is_active: true },
        select: { id: true, code: true, name: true }
      });
      console.log(`⚠️ [REFERENCE] Características disponíveis:`, JSON.stringify(allChars, null, 2));
      
      return res.status(404).json({
        error: `Característica "${scenario.characteristic_1}" não encontrada`,
        response: `Não encontrei a característica "${scenario.characteristic_1}" cadastrada. Características disponíveis: ${allChars.map(c => c.name || c.code).join(', ')}. Verifique se está configurada na área administrativa.`
      });
    }

    console.log(`✅ [REFERENCE] Característica 1 encontrada: ${char1.name} (${char1.code}) - ID: ${char1.id}`);

    // Buscar characteristic_level_2 se fornecido (case insensitive) - SEM filtro de organization_id
    let char2: any = null;
    if (scenario.characteristic_2) {
      console.log(`🔍 [REFERENCE] Buscando característica 2: "${scenario.characteristic_2}"`);
      char2 = await prisma.characteristic_level_2.findFirst({
        where: {
          OR: [
            { code: { equals: scenario.characteristic_2, mode: 'insensitive' } },
            { name: { contains: scenario.characteristic_2, mode: 'insensitive' } }
          ],
          is_active: true,
        }
      });
      if (char2) {
        console.log(`✅ [REFERENCE] Característica 2 encontrada: ${char2.name} (${char2.code}) - ID: ${char2.id}`);
      } else {
        console.log(`⚠️ [REFERENCE] Característica 2 "${scenario.characteristic_2}" não encontrada`);
      }
    }

    // Buscar characteristic_level_3 se fornecido (case insensitive) - SEM filtro de organization_id
    let char3: any = null;
    if (scenario.characteristic_3) {
      console.log(`🔍 [REFERENCE] Buscando característica 3: "${scenario.characteristic_3}"`);
      char3 = await prisma.characteristic_level_3.findFirst({
        where: {
          OR: [
            { code: { equals: scenario.characteristic_3, mode: 'insensitive' } },
            { name: { contains: scenario.characteristic_3, mode: 'insensitive' } }
          ],
          is_active: true,
        }
      });
      if (char3) {
        console.log(`✅ [REFERENCE] Característica 3 encontrada: ${char3.name} (${char3.code}) - ID: ${char3.id}`);
      } else {
        console.log(`⚠️ [REFERENCE] Característica 3 "${scenario.characteristic_3}" não encontrada`);
      }
    }

    // Extrair domínio do email do usuário para filtro específico
    const userEmail = profile.email || '';
    const userDomain = userEmail.includes('@') ? userEmail.split('@')[1] : null;
    
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`🔍 [REFERENCE] INICIANDO BUSCA DE ORDEM DE REFERÊNCIA`);
    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`📧 Email do usuário: ${userEmail}`);
    console.log(`🌐 Domínio do usuário: ${userDomain || 'não identificado'}`);
    console.log(`🏢 Organization ID: ${profile.organization_id}`);
    console.log(`🎯 Characteristic 1 ID: ${char1.id}`);
    console.log(`🎯 Characteristic 2 ID: ${char2?.id || 'null'}`);
    console.log(`🎯 Characteristic 3 ID: ${char3?.id || 'null'}`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    // ═══════════════════════════════════════════════════════════════
    // BUSCA HIERÁRQUICA EM 3 ETAPAS
    // ═══════════════════════════════════════════════════════════════
    
    let referenceOrder: any = null;
    let multipleMatches: any[] = [];

    // Primeiro, listar TODAS as ordens de referência da organização para debug
    const allOrgOrders = await prisma.reference_orders.findMany({
      where: {
        organization_id: profile.organization_id,
        is_active: true,
      },
      include: {
        characteristic_level_1: true,
        characteristic_level_2: true,
        characteristic_level_3: true,
      }
    });
    
    console.log(`📋 [DEBUG] Total de ordens de referência na organização: ${allOrgOrders.length}`);
    allOrgOrders.forEach((order, idx) => {
      console.log(`   ${idx + 1}. Ordem: ${order.order_number} | Domain: ${order.domain || 'null'} | Char1: ${order.characteristic_1_id} | Char2: ${order.characteristic_2_id || 'null'} | Char3: ${order.characteristic_3_id || 'null'}`);
    });

    // ETAPA 1: Busca EXATA (domain + char1 + char2 + char3)
    console.log(`\n🔍 [REFERENCE] ETAPA 1: Busca exata`);
    const exactWhere: any = {
      organization_id: profile.organization_id,
      characteristic_1_id: char1.id,
      is_active: true,
    };

    // Tratar domain - se o usuário tem domínio, buscar ordem com esse domínio OU sem domínio
    if (userDomain) {
      exactWhere.OR = [
        { domain: userDomain },
        { domain: null }
      ];
    }
    
    // Tratar char2
    if (char2) {
      exactWhere.characteristic_2_id = char2.id;
    } else if (!scenario.characteristic_2) {
      // Se não foi solicitada char2, buscar ordens sem char2
      exactWhere.characteristic_2_id = null;
    }
    
    // Tratar char3
    if (char3) {
      exactWhere.characteristic_3_id = char3.id;
    } else if (!scenario.characteristic_3) {
      // Se não foi solicitada char3, buscar ordens sem char3
      exactWhere.characteristic_3_id = null;
    }

    console.log(`   Query ETAPA 1:`, JSON.stringify(exactWhere, null, 2));

    referenceOrder = await prisma.reference_orders.findFirst({
      where: exactWhere,
      include: {
        characteristic_level_1: true,
        characteristic_level_2: true,
        characteristic_level_3: true,
      }
    });

    if (referenceOrder) {
      console.log(`✅ [REFERENCE] ETAPA 1: Encontrou ordem ${referenceOrder.order_number}`);
    } else {
      console.log(`❌ [REFERENCE] ETAPA 1: Nenhum resultado`);
      
      // ETAPA 2: Relaxa char3 (domain + char1 + char2)
      console.log(`\n🔍 [REFERENCE] ETAPA 2: Relaxando char3`);
      const level2Where: any = {
        organization_id: profile.organization_id,
        characteristic_1_id: char1.id,
        is_active: true,
      };

      if (userDomain) {
        level2Where.OR = [
          { domain: userDomain },
          { domain: null }
        ];
      }
      
      if (char2) {
        level2Where.characteristic_2_id = char2.id;
      } else if (!scenario.characteristic_2) {
        level2Where.characteristic_2_id = null;
      }
      // char3 não é filtrado aqui - aceita qualquer valor

      console.log(`   Query ETAPA 2:`, JSON.stringify(level2Where, null, 2));

      const level2Matches = await prisma.reference_orders.findMany({
        where: level2Where,
        include: {
          characteristic_level_1: true,
          characteristic_level_2: true,
          characteristic_level_3: true,
        }
      });

      console.log(`🔍 [REFERENCE] ETAPA 2: Encontrou ${level2Matches.length} resultado(s)`);

      if (level2Matches.length === 1) {
        referenceOrder = level2Matches[0];
        console.log(`✅ [REFERENCE] ETAPA 2: Usando ordem ${referenceOrder.order_number}`);
      } else if (level2Matches.length > 1) {
        multipleMatches = level2Matches;
        console.log(`⚠️ [REFERENCE] ETAPA 2: Múltiplos resultados - solicitando escolha do usuário`);
      } else {
        console.log(`❌ [REFERENCE] ETAPA 2: Nenhum resultado`);
        
        // ETAPA 3: Relaxa char2 e char3 (domain + char1 apenas)
        console.log(`\n🔍 [REFERENCE] ETAPA 3: Relaxando char2 e char3`);
        const level3Where: any = {
          organization_id: profile.organization_id,
          characteristic_1_id: char1.id,
          is_active: true,
        };

        if (userDomain) {
          level3Where.OR = [
            { domain: userDomain },
            { domain: null }
          ];
        }
        // char2 e char3 não são filtrados aqui

        console.log(`   Query ETAPA 3:`, JSON.stringify(level3Where, null, 2));

        const level3Matches = await prisma.reference_orders.findMany({
          where: level3Where,
          include: {
            characteristic_level_1: true,
            characteristic_level_2: true,
            characteristic_level_3: true,
          }
        });

        console.log(`🔍 [REFERENCE] ETAPA 3: Encontrou ${level3Matches.length} resultado(s)`);

        if (level3Matches.length === 1) {
          referenceOrder = level3Matches[0];
          console.log(`✅ [REFERENCE] ETAPA 3: Usando ordem ${referenceOrder.order_number}`);
        } else if (level3Matches.length > 1) {
          multipleMatches = level3Matches;
          console.log(`⚠️ [REFERENCE] ETAPA 3: Múltiplos resultados - solicitando escolha do usuário`);
        } else {
          console.log(`❌ [REFERENCE] ETAPA 3: Nenhum resultado encontrado em nenhuma etapa`);
        }
      }
    }

    // Se há múltiplos matches, pedir ao usuário para escolher
    if (multipleMatches.length > 0) {
      const options = multipleMatches.map(order => ({
        id: order.id,
        text: `${order.order_number} - ${order.characteristic_level_1?.name || ''}${order.characteristic_level_2 ? ' / ' + order.characteristic_level_2.name : ''}${order.characteristic_level_3 ? ' / ' + order.characteristic_level_3.name : ''}`,
        action: "SELECT_REFERENCE_ORDER",
        reference_order_id: order.id
      }));

      return res.json({
        success: false,
        response: `Encontrei ${multipleMatches.length} ordens de referência compatíveis com "${char1.name}". Qual você deseja usar?`,
        intent: "SELECT_REFERENCE",
        options
      });
    }

    // Se não encontrou nenhuma ordem
    if (!referenceOrder) {
      return res.status(404).json({
        error: "Ordem de referência não encontrada",
        response: `Não encontrei uma ordem de referência cadastrada para "${char1.name}". Configure uma ordem de referência na área administrativa.`,
        options: [
          { id: "config", text: "Configurar Ordens de Referência", action: "NAVIGATE_TO_CONFIG" }
        ]
      });
    }

    console.log(`✅ [REFERENCE] Ordem de referência selecionada: ${referenceOrder.order_number}`)

    // Resolver credenciais SAP
    const creds = await resolveSapCredentials(userId, referenceOrder.domain || undefined);

    // Gerar runId único
    const runId = `Test_${Date.now()}_${userId.substring(0, 8)}`;
    const char1Name = char1.name || 'N/A';

    // Usar função helper para executar o teste
    if (intent === "CONTINUE_FROM_STEP" && continue_from_step) {
      return res.json({
        success: true,
        response: `Funcionalidade de continuar de ${continue_from_step} será implementada em breve.`,
        intent: "CONTINUE_FROM_STEP"
      });
    }

    return await executeTestWithReferenceOrder(
      res, userId, profile.organization_id, referenceOrder, creds, runId, char1Name, intent
    );

  } catch (error: any) {
    console.error("❌ [SAP TEST] Erro:", error);
    
    // Extrair informações detalhadas do erro para o frontend
    let errorDetails: any = {
      endpoint: "/api/sap/execute-test",
      method: "POST"
    };
    
    // Tentar parsear JSON do erro SAP
    const errorMessage = error.message || "Erro desconhecido";
    const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        errorDetails.sapError = JSON.parse(jsonMatch[0]);
      } catch (e) {
        errorDetails.rawError = errorMessage;
      }
    } else {
      errorDetails.rawError = errorMessage;
    }
    
    res.status(500).json({
      error: errorMessage,
      response: `Erro ao executar teste: ${errorMessage}`,
      errorLog: errorDetails
    });
  }
});

// ===== OPERAÇÕES SAP DIRETAS =====

/**
 * POST /api/sap/consult - Consultar Ordem de Venda
 */
router.post("/consult", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { orderId, domain } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);

    const order = await fetchSalesOrder(baseUrl, auth, orderId);

    res.json({
      success: true,
      order,
      metadata: {
        domain: creds.domain,
        displayName: creds.displayName,
      },
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao consultar ordem:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/replicate - Replicar Ordem de Venda
 */
router.post("/replicate", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { orderId, domain, warehouseCode } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);

    const original = await fetchSalesOrder(baseUrl, auth, orderId);
    const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const newOrderPayload = buildNewOrderPayload(original, orderId, warehouseCode);
    const postHeaders = {
      Authorization: auth,
      "x-csrf-token": csrfToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookiesString,
    };

    const newOrder = await createSalesOrder(baseUrl, postHeaders, newOrderPayload);

    res.json({
      success: true,
      originalOrder: original.SalesOrder,
      newOrder: newOrder.SalesOrder,
      newOrderData: newOrder,
      metadata: {
        domain: creds.domain,
        displayName: creds.displayName,
      },
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao replicar ordem:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/delivery - Criar Remessa
 */
router.post("/delivery", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { salesOrderId, domain } = req.body;

    if (!salesOrderId) {
      return res.status(400).json({ error: "salesOrderId é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);
    const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const delivery = await createOutboundDelivery(baseUrl, auth, csrfToken, cookiesString, salesOrderId);

    res.json({
      success: true,
      salesOrderId,
      deliveryDocument: delivery.DeliveryDocument,
      deliveryData: delivery,
      alreadyExisted: delivery._alreadyExisted || false,
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao criar remessa:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/picking - Executar Picking
 */
router.post("/picking", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { deliveryDocument, domain } = req.body;

    if (!deliveryDocument) {
      return res.status(400).json({ error: "deliveryDocument é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);
    const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const deliveryWithItems = await fetchDeliveryWithItems(baseUrl, auth, deliveryDocument);
    const result = await pickAllItems(baseUrl, auth, csrfToken, cookiesString, deliveryDocument, deliveryWithItems.headerETag || undefined);

    res.json({
      success: true,
      deliveryDocument,
      result,
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao executar picking:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/pgi - Executar PGI
 */
router.post("/pgi", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { deliveryDocument, domain } = req.body;

    if (!deliveryDocument) {
      return res.status(400).json({ error: "deliveryDocument é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);
    const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const result = await executePostGoodsIssue(baseUrl, auth, csrfToken, cookiesString, deliveryDocument);

    res.json({
      success: true,
      deliveryDocument,
      result,
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao executar PGI:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/billing - Criar Faturamento
 */
router.post("/billing", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { deliveryDocument, domain } = req.body;

    if (!deliveryDocument) {
      return res.status(400).json({ error: "deliveryDocument é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);
    const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
    if (!csrfToken) throw new Error("Falha ao obter token CSRF");

    const billing = await createBillingDocument(baseUrl, auth, csrfToken, cookiesString, deliveryDocument);

    res.json({
      success: true,
      deliveryDocument,
      billingDocument: billing.BillingDocument,
      billingData: billing,
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao criar faturamento:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/nfe - Consultar NF-e
 */
router.post("/nfe", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { billingDocument, domain } = req.body;

    if (!billingDocument) {
      return res.status(400).json({ error: "billingDocument é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);

    const nfe = await fetchFiscalNote(baseUrl, auth, billingDocument);

    res.json({
      success: true,
      billingDocument,
      nfe,
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao consultar NF-e:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/bill-of-lading - Buscar Bill of Lading
 */
router.post("/bill-of-lading", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { deliveryDocument, domain } = req.body;

    if (!deliveryDocument) {
      return res.status(400).json({ error: "deliveryDocument é obrigatório" });
    }

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);

    const billOfLading = await fetchBillOfLading(baseUrl, auth, deliveryDocument);

    res.json({
      success: true,
      deliveryDocument,
      billOfLading,
    });
  } catch (error: any) {
    console.error("❌ [SAP] Erro ao buscar Bill of Lading:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap/full-flow - Fluxo Completo (direto, não via chat)
 */
router.post("/full-flow", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { orderId, domain, warehouseCode } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId é obrigatório" });
    }

    const flowResult = {
      success: true,
      steps: {
        order: { status: "pending", id: null as string | null, data: null as any },
        delivery: { status: "pending", id: null as string | null, data: null as any },
        picking: { status: "pending", data: null as any },
        pgi: { status: "pending", data: null as any },
        billing: { status: "pending", id: null as string | null, data: null as any },
        nfe: { status: "pending", id: null as string | null, data: null as any },
      },
      errors: [] as string[],
      completedSteps: 0,
      totalSteps: 6,
    };

    const creds = await resolveSapCredentials(userId, domain);
    const auth = buildBasicAuth(creds.username, creds.password);
    const baseUrl = buildSapBaseUrl(creds.baseUrl);

    try {
      // Step 1: Buscar ordem original
      const original = await fetchSalesOrder(baseUrl, auth, orderId);
      flowResult.steps.order = { status: "completed", id: orderId, data: original };
      flowResult.completedSteps++;

      const { csrfToken, cookiesString } = await getCsrfToken(baseUrl, auth);
      if (!csrfToken) throw new Error("Falha ao obter token CSRF");

      // Step 2: Replicar ordem
      const newOrderPayload = buildNewOrderPayload(original, orderId, warehouseCode);
      const postHeaders = {
        Authorization: auth,
        "x-csrf-token": csrfToken,
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookiesString,
      };
      const newOrder = await createSalesOrder(baseUrl, postHeaders, newOrderPayload);
      flowResult.steps.order.id = newOrder.SalesOrder;
      flowResult.steps.order.data = newOrder;

      // Step 3: Criar Remessa
      const delivery = await createOutboundDelivery(baseUrl, auth, csrfToken, cookiesString, newOrder.SalesOrder);
      flowResult.steps.delivery = { status: "completed", id: delivery.DeliveryDocument, data: delivery };
      flowResult.completedSteps++;

      // Step 4: Picking
      const deliveryWithItems = await fetchDeliveryWithItems(baseUrl, auth, delivery.DeliveryDocument);
      const pickingResult = await pickAllItems(baseUrl, auth, csrfToken, cookiesString, delivery.DeliveryDocument, deliveryWithItems.headerETag || undefined);
      flowResult.steps.picking = { status: "completed", data: pickingResult };
      flowResult.completedSteps++;

      // Step 5: PGI
      const pgiResult = await executePostGoodsIssue(baseUrl, auth, csrfToken, cookiesString, delivery.DeliveryDocument);
      flowResult.steps.pgi = { status: "completed", data: pgiResult };
      flowResult.completedSteps++;

      // Step 6: Billing (se API disponível)
      if (creds.hasApis.billing) {
        try {
          const billing = await createBillingDocument(baseUrl, auth, csrfToken, cookiesString, delivery.DeliveryDocument);
          flowResult.steps.billing = { status: "completed", id: billing.BillingDocument, data: billing };
          flowResult.completedSteps++;

          // Step 7: NF-e (se API disponível)
          if (creds.hasApis.nfe && billing.BillingDocument) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              const nfe = await fetchFiscalNote(baseUrl, auth, billing.BillingDocument);
              flowResult.steps.nfe = { status: "completed", id: nfe.NFeNumber || nfe.BRNFNumber, data: nfe };
              flowResult.completedSteps++;
            } catch (nfeError: any) {
              flowResult.steps.nfe = { status: "error", id: null, data: null };
              flowResult.errors.push(`NF-e: ${nfeError.message}`);
            }
          } else {
            flowResult.steps.nfe = { status: "skipped", id: null, data: null };
          }
        } catch (billingError: any) {
          flowResult.steps.billing = { status: "error", id: null, data: null };
          flowResult.steps.nfe = { status: "skipped", id: null, data: null };
          flowResult.errors.push(`Billing: ${billingError.message}`);
        }
      } else {
        flowResult.steps.billing = { status: "skipped", id: null, data: null };
        flowResult.steps.nfe = { status: "skipped", id: null, data: null };
      }
    } catch (stepError: any) {
      flowResult.success = false;
      flowResult.errors.push(stepError.message);
    }

    res.json(flowResult);
  } catch (error: any) {
    console.error("❌ [SAP] Erro no fluxo completo:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;

