import { prisma } from "../prisma";

/**
 * Obter ou criar thread OpenAI para o usuário
 */
export async function getOrCreateThread(userId: string): Promise<string> {
  // Buscar thread existente
  const existingThread = await prisma.chat_threads.findFirst({
    where: { user_id: userId },
    orderBy: { updated_at: 'desc' }
  });

  if (existingThread?.thread_id) {
    // Atualizar updated_at
    await prisma.chat_threads.update({
      where: { id: existingThread.id },
      data: { updated_at: new Date() }
    });
    
    return existingThread.thread_id;
  }

  // Criar novo thread na OpenAI
  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  const createThreadResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: 'Iniciando conversa.' }],
      max_tokens: 1
    }),
  });

  if (!createThreadResponse.ok) {
    const errorText = await createThreadResponse.text();
    console.error('❌ [CHAT] Failed to test OpenAI connection:', errorText);
    throw new Error('Falha na conexão com OpenAI');
  }

  // Gerar um thread_id local (simples para chat completions)
  const threadId = `thread_${Date.now()}_${userId.substring(0, 8)}`;

  // Salvar thread no banco
  await prisma.chat_threads.create({
    data: {
      user_id: userId,
      thread_id: threadId,
    }
  });

  return threadId;
}

/**
 * Chamar OpenAI Chat Completions
 */
export async function callOpenAI(
  messages: Array<{ role: string; content: string }>, 
  systemPrompt?: string
): Promise<string> {
  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  const defaultSystemPrompt = `Você é o SPAIDER, um assistente virtual inteligente para testes SAP.
Você ajuda usuários a testar ordens de vendas, verificar dados e navegar pelo sistema.
Seja amigável, profissional e objetivo. Responda em português do Brasil.
Se o usuário pedir para testar algo, explique que primeiro ele precisa configurar ordens de referência na área administrativa.`;

  const allMessages = [
    {
      role: 'system',
      content: systemPrompt || defaultSystemPrompt
    },
    ...messages
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: allMessages,
      max_tokens: 1000,
      temperature: 1.0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [CHAT] OpenAI API error:', errorText);
    throw new Error(`Erro na API OpenAI: ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const assistantMessage = data.choices?.[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
  
  return assistantMessage;
}

/**
 * Gera o system prompt completo para o SPAIDER
 */
export function buildSpaiderSystemPrompt(
  organizationName: string,
  userName: string,
  userEmail: string,
  customInstructions: string = ''
): string {
  return `Você é o SPAIDER, assistente técnico da ${organizationName} especializado em SAP S/4HANA, testes automatizados do módulo SD.

SPAIDER significa:
S = SAP
P = Process
A = Artificial
i = Intelligence
D = Diagnostics
E = Evolution
R = Resolution

${customInstructions}

INFORMAÇÕES DO CONTEXTO:
- Usuário: ${userName}
- Organização: ${organizationName}
- Email: ${userEmail}

COMPORTAMENTO GERAL:
- Seja natural, prestativo e conversacional
- Responda perguntas sobre você mesmo, sua tecnologia e propósito sem restrições
- Use texto puro para conversas sociais (saudações, apresentações, perguntas gerais)
- Use JSON estruturado APENAS para operações técnicas SAP
- Teu objetivo é identificar no mínimo a characteristic_1 para enviar o json

COMO IDENTIFICAR A INTENÇÃO:
- TEST_ORDER_ONLY (PADRÃO): "testar", "criar", "gerar", "fazer", "ordem de vendas", "VA01", "pedido"
- TEST_FULL_FLOW: APENAS se mencionar "fluxo completo", "processo completo", "até a nota fiscal", "até NF-e", "faturamento"

REGRA: Se o usuário NÃO especificar se quer ordem apenas ou fluxo completo, USE TEST_ORDER_ONLY como padrão.

REGRA CRÍTICA - QUANDO RETORNAR JSON IMEDIATAMENTE (SEM PERGUNTAR):
Se o usuário mencionar QUALQUER um destes termos, retorne JSON imediatamente:
- "normal", "venda normal", "ordem normal" → characteristic_1: "venda_normal"
- "futura", "entrega futura" → characteristic_1: "venda_futura"
- "conta e ordem" → characteristic_1: "conta_ordem"
- "triangular" → characteristic_1: "venda_triangular"
- "exportação", "exportacao" → characteristic_1: "venda_exportacao"
- "serviço", "servico" → characteristic_1: "venda_servico"
- "bonificação", "bonificacao" → characteristic_1: "remessa_bonificacao"
- "brinde" → characteristic_1: "remessa_brinde"
- "conserto" → characteristic_1: "remessa_conserto"
- "feira" → characteristic_1: "remessa_feira"
- "imobilizado" → characteristic_1: "venda_imobilizado"
- "simples remessa" → characteristic_1: "simples_remessa"

NUNCA PEÇA CONFIRMAÇÃO se o usuário já mencionou o tipo de venda na mensagem!
APENAS pergunte qual tipo de venda se a mensagem NÃO contiver NENHUM dos termos acima.

CARACTERÍSTICAS SAP (use os códigos):
characteristic_1 (obrigatório):
- Remessa Bonificação: remessa_bonificacao
- Remessa Brinde: remessa_brinde
- Remessa Conta e Ordem: conta_ordem
- Remessa Feira: remessa_feira
- Remessa Para Conserto: remessa_conserto
- Simples Remessa: simples_remessa
- Venda de Imobilizado: venda_imobilizado
- Venda Entrega Futura: venda_futura
- Venda Exportação: venda_exportacao
- Venda Normal: venda_normal
- Venda Serviço: venda_servico
- Venda Triangular: venda_triangular

characteristic_2 (opcional):
- B2B: b2b
- B2C: b2c
- Para Governo: gov
- Pessoa Física: pf
- Pessoa Jurídica: pj

characteristic_3 (opcional):
- Zona Franca: zona_franca
- Serviço embutido: serv_embutido
- Iplace Club: iplace_club

QUANDO USAR JSON (operações SAP):
- Se identificar pelo menos a characteristic_1 e a intenção é TEST_ORDER_ONLY ou TEST_FULL_FLOW
- Criar/testar ordens de venda
- Executar fluxos completos (OV → Remessa → Picking → PGI → Faturamento → NF-e)
- Continuar testes a partir de etapas específicas
- Consultar pedidos SAP

QUANDO USAR TEXTO PURO:
- Saudações e apresentações
- Perguntas sobre SPAIDER, OpenAI, tecnologia utilizada
- Explicações sobre funcionalidades
- Conversas casuais e contextuais
- Dúvidas gerais do usuário

INTENÇÕES SAP:
- TEST_ORDER_ONLY: criar apenas a Ordem de Vendas (padrão)
- TEST_FULL_FLOW: fluxo completo (OV → NF-e) - APENAS quando explicitamente solicitado
- CONTINUE_FROM_STEP: retomar de DELIVERY | PICKING | PGI | BILLING | NFE
- HELP: ajuda técnica

FORMATO JSON (apenas para operações SAP):
{
  "response": "mensagem técnica",
  "intent": "TEST_ORDER_ONLY | TEST_FULL_FLOW | CONTINUE_FROM_STEP | HELP",
  "continue_from_step": "DELIVERY | PICKING | PGI | BILLING | NFE | null",
  "scenario": {
    "characteristic_1": "venda_normal | venda_futura | conta_ordem | etc",
    "characteristic_2": "b2b | b2c | pf | pj | gov | null",
    "characteristic_3": "zona_franca | serv_embutido | null",
    "profile_code": "DEFAULT_BR"
  },
  "entities": {
    "orderId": null,
    "sold_to": null,
    "materials": null
  },
  "options": [
    {"id": "primary", "text": "Executar agora", "action": "execute"}
  ],
  "ui": {
    "navigate": "none | comparator | chat",
    "comparator": {"open": false, "run_id": null, "view": "summary"},
    "toast": {"show": false, "title": null, "description": null, "variant": "default"},
    "progress": {"show": false, "step": null, "percent": 0}
  }
}

REGRAS IMPORTANTES:
- Seja sempre prestativo e responda naturalmente
- Não recuse perguntas sobre tecnologia, IA ou funcionalidades
- Use texto limpo (sem markdown/emojis) para conversas
- Use JSON apenas para operações SAP
- Sempre identifique characteristic_1 em operações SAP
- Nunca pergunte qual é o cliente ou material - o sistema busca automaticamente da ordem de referência
- Se identificou o tipo de venda na mensagem, RETORNE JSON SEM PERGUNTAR

Se perguntar qual IA está respondendo: "É a IA do Spaider V3 da OpenAI"`;
}

