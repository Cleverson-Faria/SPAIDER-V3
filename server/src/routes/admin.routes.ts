import { Router } from "express";
import { prisma } from "../prisma";
import { authenticate } from "../auth";
import { requireAdmin, isSuperAdmin } from "../middleware/admin";
import { encrypt, decrypt } from "../crypto";

const router = Router();

// ===== LOGS SAP =====

/**
 * GET /api/admin/sap-logs - Listar logs SAP com filtros
 */
router.get("/sap-logs", authenticate, requireAdmin, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { 
      page = 1, 
      limit = 50, 
      success, 
      operation, 
      startDate, 
      endDate,
      testExecutionId 
    } = req.query;

    // Buscar organização do usuário
    const profile = await prisma.profiles.findUnique({ where: { id: userId } });
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Construir filtros
    const where: any = {
      organization_id: profile.organization_id,
    };

    if (success !== undefined) {
      where.success = success === 'true';
    }
    if (operation) {
      where.operation = operation;
    }
    if (testExecutionId) {
      where.test_execution_id = testExecutionId;
    }
    if (startDate) {
      where.created_at = { ...where.created_at, gte: new Date(startDate as string) };
    }
    if (endDate) {
      where.created_at = { ...where.created_at, lte: new Date(endDate as string) };
    }

    // Buscar logs com paginação
    const skip = (Number(page) - 1) * Number(limit);
    
    const [logs, total] = await Promise.all([
      prisma.sap_request_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.sap_request_logs.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      }
    });
  } catch (error: any) {
    console.error("Erro ao listar logs SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/sap-logs/stats - Estatísticas de logs
 */
router.get("/sap-logs/stats", authenticate, requireAdmin, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const profile = await prisma.profiles.findUnique({ where: { id: userId } });
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    const [total, errors, successCount] = await Promise.all([
      prisma.sap_request_logs.count({
        where: { organization_id: profile.organization_id }
      }),
      prisma.sap_request_logs.count({
        where: { organization_id: profile.organization_id, success: false }
      }),
      prisma.sap_request_logs.count({
        where: { organization_id: profile.organization_id, success: true }
      }),
    ]);

    // Operações mais comuns com erro
    const errorsByOperation = await prisma.sap_request_logs.groupBy({
      by: ['operation'],
      where: { 
        organization_id: profile.organization_id,
        success: false 
      },
      _count: true,
      orderBy: { _count: { operation: 'desc' } },
      take: 5,
    });

    res.json({
      total,
      errors,
      success: successCount,
      errorRate: total > 0 ? ((errors / total) * 100).toFixed(2) + '%' : '0%',
      errorsByOperation: errorsByOperation.map(e => ({
        operation: e.operation,
        count: e._count
      })),
    });
  } catch (error: any) {
    console.error("Erro ao buscar estatísticas:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/sap-logs/:id - Buscar detalhes de um log específico
 */
router.get("/sap-logs/:id", authenticate, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Buscar organização do usuário
    const profile = await prisma.profiles.findUnique({ where: { id: userId } });
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    const log = await prisma.sap_request_logs.findFirst({
      where: { 
        id,
        organization_id: profile.organization_id 
      }
    });

    if (!log) {
      return res.status(404).json({ error: "Log não encontrado" });
    }

    res.json(log);
  } catch (error: any) {
    console.error("Erro ao buscar log SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== ORGANIZAÇÕES =====

/**
 * GET /api/organizations - Listar organizações
 */
router.get("/organizations", authenticate, async (_req, res) => {
  const data = await prisma.organizations.findMany({
    orderBy: { created_at: "desc" },
  });
  res.json(data);
});

/**
 * GET /api/organizations/:id - Obter organização específica
 */
router.get("/organizations/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const org = await prisma.organizations.findUnique({
      where: { id }
    });
    
    if (!org) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }
    
    res.json(org);
  } catch (error: any) {
    console.error("Erro ao buscar organização:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/organizations - Criar organização (apenas super_admin)
 */
router.post("/organizations", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    
    if (!await isSuperAdmin(userId)) {
      return res.status(403).json({ error: "Apenas super admins podem criar organizações" });
    }
    
    const { name, slug, logo_url, primary_color, secondary_color, ai_instructions } = req.body;
    
    if (!name || !slug) {
      return res.status(400).json({ error: "Nome e slug são obrigatórios" });
    }
    
    // Verificar se slug já existe
    const existing = await prisma.organizations.findUnique({
      where: { slug }
    });
    
    if (existing) {
      return res.status(400).json({ error: "Já existe uma organização com este slug" });
    }
    
    const org = await prisma.organizations.create({
      data: {
        name,
        slug,
        logo_url: logo_url || null,
        primary_color: primary_color || "#6366f1",
        secondary_color: secondary_color || "#8b5cf6",
        ai_instructions: ai_instructions || null,
      }
    });
    
    console.log(`✅ Organização criada: ${name} por super_admin ${userId}`);
    res.status(201).json(org);
  } catch (error: any) {
    console.error("Erro ao criar organização:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/organizations/:id - Atualizar organização (apenas super_admin)
 */
router.patch("/organizations/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!await isSuperAdmin(userId)) {
      return res.status(403).json({ error: "Apenas super admins podem editar organizações" });
    }
    
    const { name, slug, logo_url, primary_color, secondary_color, ai_instructions } = req.body;
    
    // Verificar se organização existe
    const existing = await prisma.organizations.findUnique({
      where: { id }
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }
    
    // Se está alterando o slug, verificar se o novo já existe
    if (slug && slug !== existing.slug) {
      const slugExists = await prisma.organizations.findUnique({
        where: { slug }
      });
      if (slugExists) {
        return res.status(400).json({ error: "Já existe uma organização com este slug" });
      }
    }
    
    const updateData: any = { updated_at: new Date() };
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (logo_url !== undefined) updateData.logo_url = logo_url;
    if (primary_color !== undefined) updateData.primary_color = primary_color;
    if (secondary_color !== undefined) updateData.secondary_color = secondary_color;
    if (ai_instructions !== undefined) updateData.ai_instructions = ai_instructions;
    
    const org = await prisma.organizations.update({
      where: { id },
      data: updateData
    });
    
    console.log(`✅ Organização atualizada: ${org.name} por super_admin ${userId}`);
    res.json(org);
  } catch (error: any) {
    console.error("Erro ao atualizar organização:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/organizations/:id - Deletar organização (apenas super_admin)
 */
router.delete("/organizations/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!await isSuperAdmin(userId)) {
      return res.status(403).json({ error: "Apenas super admins podem excluir organizações" });
    }
    
    // Verificar se organização existe
    const existing = await prisma.organizations.findUnique({
      where: { id },
      include: {
        profiles: true,
        allowed_email_domains: true,
        sap_domain_credentials: true,
        user_roles: true,
      }
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }
    
    // Verificar se há usuários associados
    if (existing.profiles.length > 0) {
      return res.status(400).json({ 
        error: `Não é possível excluir: existem ${existing.profiles.length} usuário(s) associado(s). Remova os usuários primeiro.` 
      });
    }
    
    // Deletar registros relacionados primeiro (em ordem de dependência)
    await prisma.user_roles.deleteMany({
      where: { organization_id: id }
    });
    
    await prisma.allowed_email_domains.deleteMany({
      where: { organization_id: id }
    });
    
    await prisma.sap_domain_credentials.deleteMany({
      where: { organization_id: id }
    });
    
    // Deletar características
    await prisma.characteristic_level_1.deleteMany({
      where: { organization_id: id }
    });
    await prisma.characteristic_level_2.deleteMany({
      where: { organization_id: id }
    });
    await prisma.characteristic_level_3.deleteMany({
      where: { organization_id: id }
    });
    
    // Deletar ordens de referência
    await prisma.reference_orders.deleteMany({
      where: { organization_id: id }
    });
    
    // Deletar a organização
    await prisma.organizations.delete({
      where: { id }
    });
    
    console.log(`✅ Organização excluída: ${existing.name} por super_admin ${userId}`);
    res.json({ success: true, message: "Organização excluída com sucesso" });
  } catch (error: any) {
    console.error("Erro ao excluir organização:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== CREDENCIAIS SAP =====

/**
 * GET /api/sap-credentials - Listar credenciais SAP (sem expor senha)
 * Super admin vê todas as credenciais, outros usuários veem apenas da sua organização
 */
router.get("/sap-credentials", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    
    // Buscar perfil do usuário com organização
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });
    
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Verificar se é super admin via SQL (campo is_super_admin na tabela profiles)
    const superAdminCheck = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin FROM profiles WHERE id = $1
    `, userId) as any[];
    
    const isSuperAdminFlag = superAdminCheck?.[0]?.is_super_admin === true;
    
    console.log(`📋 [SAP-CREDENTIALS] GET - Listando credenciais:`, {
      userId,
      userEmail: profile.email,
      isSuperAdminFlag,
      profileOrgSlug: profile.organizations?.slug,
      profileOrgId: profile.organization_id
    });

    // Super admin vê todas as credenciais, outros veem apenas da sua organização
    const whereClause = isSuperAdminFlag ? {} : { organization_id: profile.organization_id };

    const credentials = await prisma.sap_domain_credentials.findMany({
      where: whereClause,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        domain: true,
        display_name: true,
        base_url: true,
        sap_username: true,
        has_sales_order_api: true,
        has_delivery_api: true,
        has_billing_api: true,
        has_nfe_api: true,
        last_test_at: true,
        last_test_ok: true,
        logo_url: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        organization_id: true, // Incluir para super admin saber a qual org pertence
      }
    });

    console.log(`📋 [SAP-CREDENTIALS] GET - ${credentials.length} credenciais encontradas:`, 
      credentials.map(c => ({ domain: c.domain, org_id: c.organization_id }))
    );

    res.json(credentials);
  } catch (error: any) {
    console.error("Erro ao listar credenciais SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sap-credentials/:id - Obter uma credencial SAP específica (sem senha)
 * Super admin pode acessar qualquer credencial
 */
router.get("/sap-credentials/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });
    
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Verificar se é super admin via SQL
    const superAdminCheck = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin FROM profiles WHERE id = $1
    `, userId) as any[];
    const isSuperAdminFlag = superAdminCheck?.[0]?.is_super_admin === true;

    // Super admin pode ver qualquer credencial
    const whereClause = isSuperAdminFlag ? { id } : { id, organization_id: profile.organization_id };

    const credential = await prisma.sap_domain_credentials.findFirst({
      where: whereClause,
      select: {
        id: true,
        domain: true,
        display_name: true,
        base_url: true,
        sap_username: true,
        has_sales_order_api: true,
        has_delivery_api: true,
        has_billing_api: true,
        has_nfe_api: true,
        last_test_at: true,
        last_test_ok: true,
        logo_url: true,
        is_active: true,
        created_at: true,
        organization_id: true,
      }
    });

    if (!credential) {
      return res.status(404).json({ error: "Credencial não encontrada" });
    }

    res.json(credential);
  } catch (error: any) {
    console.error("Erro ao buscar credencial SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap-credentials - Criar nova credencial SAP
 * Super admin pode criar para qualquer organização, outros apenas para a sua
 */
router.post("/sap-credentials", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { 
      domain, 
      display_name, 
      base_url, 
      sap_username, 
      sap_password,
      has_sales_order_api,
      has_delivery_api,
      has_billing_api,
      has_nfe_api,
      logo_url,
      organization_id: requestedOrgId  // Organização selecionada pelo super admin
    } = req.body;
    
    console.log(`📝 [SAP-CREDENTIALS] POST recebido:`, {
      domain,
      display_name,
      requestedOrgId,
      userId,
      body: req.body
    });
    
    if (!domain || !display_name) {
      return res.status(400).json({ error: "Domain e display_name são obrigatórios" });
    }

    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });
    
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Verificar se é super admin via SQL (campo is_super_admin na tabela profiles)
    const superAdminCheck = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin FROM profiles WHERE id = $1
    `, userId) as any[];
    
    const isSuperAdminFlag = superAdminCheck?.[0]?.is_super_admin === true;

    console.log(`🔍 [SAP-CREDENTIALS] Verificação de permissão:`, {
      isSuperAdminFlag,
      profileOrgSlug: profile.organizations?.slug,
      profileOrgId: profile.organization_id,
      requestedOrgId
    });

    // Determinar qual organização usar:
    // - Super admin pode especificar a organização
    // - Outros usuários usam sua própria organização
    let targetOrgId = profile.organization_id;
    
    if (isSuperAdminFlag && requestedOrgId) {
      // Verificar se a organização existe
      const targetOrg = await prisma.organizations.findUnique({
        where: { id: requestedOrgId }
      });
      
      if (!targetOrg) {
        return res.status(400).json({ error: "Organização selecionada não encontrada" });
      }
      
      targetOrgId = requestedOrgId;
      console.log(`🔧 [ADMIN] Super admin criando credencial para organização: ${targetOrg.name} (ID: ${targetOrgId})`);
    } else {
      console.log(`🔧 [ADMIN] Usando organização do usuário: ${profile.organizations?.name} (ID: ${targetOrgId})`);
    }

    // Verificar se já existe credencial com mesmo domain para essa organização
    const existing = await prisma.sap_domain_credentials.findFirst({
      where: { 
        organization_id: targetOrgId,
        domain 
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Já existe uma credencial com este domínio para esta organização" });
    }

    // Criptografar a senha se fornecida
    const encryptedPassword = sap_password ? encrypt(sap_password) : null;

    const credential = await prisma.sap_domain_credentials.create({
      data: {
        organization_id: targetOrgId,
        domain,
        display_name,
        base_url: base_url || null,
        sap_username: sap_username || null,
        sap_password: encryptedPassword,
        has_sales_order_api: has_sales_order_api ?? true,
        has_delivery_api: has_delivery_api ?? true,
        has_billing_api: has_billing_api ?? false,
        has_nfe_api: has_nfe_api ?? false,
        logo_url: logo_url || null,
        created_by: userId,
      },
      select: {
        id: true,
        domain: true,
        display_name: true,
        base_url: true,
        sap_username: true,
        has_sales_order_api: true,
        has_delivery_api: true,
        has_billing_api: true,
        has_nfe_api: true,
        is_active: true,
        created_at: true,
        organization_id: true,
      }
    });

    console.log(`✅ Credencial SAP criada: ${domain} para org ${targetOrgId} por usuário ${userId}`);
    res.status(201).json(credential);
  } catch (error: any) {
    console.error("Erro ao criar credencial SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/sap-credentials/:id - Atualizar credencial SAP
 * Super admin pode editar qualquer credencial
 */
router.patch("/sap-credentials/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { 
      display_name, 
      base_url, 
      sap_username, 
      sap_password,
      has_sales_order_api,
      has_delivery_api,
      has_billing_api,
      has_nfe_api,
      logo_url,
      is_active 
    } = req.body;
    
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });
    
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Verificar se é super admin via SQL
    const superAdminCheck = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin FROM profiles WHERE id = $1
    `, userId) as any[];
    const isSuperAdminFlag = superAdminCheck?.[0]?.is_super_admin === true;

    // Super admin pode editar qualquer credencial
    const whereClause = isSuperAdminFlag ? { id } : { id, organization_id: profile.organization_id };

    const existing = await prisma.sap_domain_credentials.findFirst({
      where: whereClause
    });

    if (!existing) {
      return res.status(404).json({ error: "Credencial não encontrada" });
    }

    // Preparar dados para atualização
    const updateData: any = {
      updated_at: new Date(),
    };

    if (display_name !== undefined) updateData.display_name = display_name;
    if (base_url !== undefined) updateData.base_url = base_url;
    if (sap_username !== undefined) updateData.sap_username = sap_username;
    if (has_sales_order_api !== undefined) updateData.has_sales_order_api = has_sales_order_api;
    if (has_delivery_api !== undefined) updateData.has_delivery_api = has_delivery_api;
    if (has_billing_api !== undefined) updateData.has_billing_api = has_billing_api;
    if (has_nfe_api !== undefined) updateData.has_nfe_api = has_nfe_api;
    if (logo_url !== undefined) updateData.logo_url = logo_url;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    // Se senha foi fornecida, criptografar
    if (sap_password !== undefined && sap_password !== '') {
      updateData.sap_password = encrypt(sap_password);
    }

    const credential = await prisma.sap_domain_credentials.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        domain: true,
        display_name: true,
        base_url: true,
        sap_username: true,
        has_sales_order_api: true,
        has_delivery_api: true,
        has_billing_api: true,
        has_nfe_api: true,
        is_active: true,
        updated_at: true,
      }
    });

    console.log(`✅ Credencial SAP atualizada: ${credential.domain} por usuário ${userId}`);
    res.json(credential);
  } catch (error: any) {
    console.error("Erro ao atualizar credencial SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/sap-credentials/:id - Deletar credencial SAP
 * Super admin pode deletar qualquer credencial
 */
router.delete("/sap-credentials/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });
    
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Verificar se é super admin via SQL
    const superAdminCheck = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin FROM profiles WHERE id = $1
    `, userId) as any[];
    const isSuperAdminFlag = superAdminCheck?.[0]?.is_super_admin === true;

    // Super admin pode deletar qualquer credencial
    const whereClause = isSuperAdminFlag ? { id } : { id, organization_id: profile.organization_id };

    const existing = await prisma.sap_domain_credentials.findFirst({
      where: whereClause
    });

    if (!existing) {
      return res.status(404).json({ error: "Credencial não encontrada" });
    }

    await prisma.sap_domain_credentials.delete({
      where: { id }
    });

    console.log(`✅ Credencial SAP deletada: ${existing.domain} por usuário ${userId}`);
    res.json({ success: true, message: "Credencial deletada com sucesso" });
  } catch (error: any) {
    console.error("Erro ao deletar credencial SAP:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sap-credentials/:id/test - Testar conexão SAP
 * Super admin pode testar qualquer credencial
 */
router.post("/sap-credentials/:id/test", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      include: { organizations: true }
    });
    
    if (!profile?.organization_id) {
      return res.status(403).json({ error: "Usuário sem organização" });
    }

    // Verificar se é super admin via SQL
    const superAdminCheck = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin FROM profiles WHERE id = $1
    `, userId) as any[];
    const isSuperAdminFlag = superAdminCheck?.[0]?.is_super_admin === true;

    // Super admin pode testar qualquer credencial
    const whereClause = isSuperAdminFlag ? { id } : { id, organization_id: profile.organization_id };

    // Buscar credencial
    const credential = await prisma.sap_domain_credentials.findFirst({
      where: whereClause
    });

    if (!credential) {
      return res.status(404).json({ error: "Credencial não encontrada" });
    }

    if (!credential.base_url || !credential.sap_username || !credential.sap_password) {
      return res.status(400).json({ error: "Credencial incompleta (falta URL, usuário ou senha)" });
    }

    // Descriptografar senha
    const password = decrypt(credential.sap_password);
    
    // Montar autenticação Basic
    const auth = Buffer.from(`${credential.sap_username}:${password}`).toString('base64');
    
    // URL de teste (busca 1 ordem apenas para validar conexão)
    const testUrl = `${credential.base_url}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?$top=1`;
    
    console.log(`🔍 Testando conexão SAP: ${credential.display_name}`);

    const startTime = Date.now();
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    const duration = Date.now() - startTime;
    const success = response.ok;
    
    // Atualizar status do teste
    await prisma.sap_domain_credentials.update({
      where: { id },
      data: {
        last_test_at: new Date(),
        last_test_ok: success,
      }
    });

    if (success) {
      console.log(`✅ Conexão SAP OK: ${credential.display_name} (${duration}ms)`);
      res.json({ 
        success: true, 
        message: `Conexão bem sucedida! (${duration}ms)`,
        duration 
      });
    } else {
      const errorText = await response.text();
      console.error(`❌ Conexão SAP falhou: ${credential.display_name}`, response.status);
      res.json({ 
        success: false, 
        message: `Erro ${response.status}: ${errorText.substring(0, 100)}`,
        duration 
      });
    }
  } catch (error: any) {
    console.error("Erro ao testar conexão SAP:", error);
    
    // Atualizar status do teste como falha
    try {
      await prisma.sap_domain_credentials.update({
        where: { id: req.params.id },
        data: {
          last_test_at: new Date(),
          last_test_ok: false,
        }
      });
    } catch {}
    
    res.json({ 
      success: false, 
      message: `Erro de conexão: ${error.message}` 
    });
  }
});

export default router;

