import { Router } from "express";
import { prisma } from "../prisma";
import { authenticate } from "../auth";
import { tableMap } from "../config/tables";

const router = Router();

/**
 * Tabelas que requerem filtro automático por organization_id
 * Usuários normais só podem ver dados da sua própria organização
 * Super admins podem ver dados de todas as organizações
 */
/**
 * Tabelas que TÊM coluna organization_id e requerem filtro automático
 * NOTA: Tabelas de comparação (test_header_comparisons, test_item_comparisons, etc.)
 * NÃO têm organization_id - são filtradas via relação com test_flow_executions
 */
const ORGANIZATION_FILTERED_TABLES = [
  'test_flow_executions',
  'nfe_documents',
  'reference_orders',
  'sap_request_logs',
  'chat_threads',
  'allowed_email_domains',
  'sap_domain_credentials',
  // NOTA: characteristic_level_1/2/3 são dados GLOBAIS compartilhados entre organizações
  // Todos podem visualizar, mas apenas super admin pode gerenciar (controlado na UI)
];

/**
 * Verifica se o usuário é super admin
 * APENAS o campo is_super_admin da tabela profiles determina super admin
 * NÃO confundir com role 'admin' que é admin de uma organização específica
 */
async function isSuperAdmin(userId: string): Promise<boolean> {
  try {
    // Verificar via SQL direto o campo is_super_admin
    const result = await prisma.$queryRawUnsafe(`
      SELECT is_super_admin 
      FROM profiles 
      WHERE id = $1
    `, userId) as any[];
    
    // APENAS is_super_admin === true determina super admin
    return result && result.length > 0 && result[0].is_super_admin === true;
  } catch (error) {
    console.error('[isSuperAdmin] Erro ao verificar:', error);
    return false;
  }
}

/**
 * Obtém o organization_id do usuário
 */
async function getUserOrganizationId(userId: string): Promise<string | null> {
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { organization_id: true }
  });
  return profile?.organization_id || null;
}

/**
 * POST /api/query/:table/search - Query genérica (substitui supabase.from().select())
 * 
 * SEGURANÇA: Filtra automaticamente por organization_id para tabelas sensíveis
 * Super admins podem ver dados de todas as organizações
 */
router.post("/:table/search", authenticate, async (req: any, res) => {
  try {
    const { table } = req.params;
    const { select, where, orderBy, limit, single } = req.body;
    const userId = req.user?.id;

    const prismaModel = tableMap[table];
    if (!prismaModel) {
      return res.status(404).json({ error: `Tabela ${table} não encontrada` });
    }

    const whereClause: any = {};
    if (where) {
      Object.keys(where).forEach(key => {
        const value = where[key];
        // Suportar operadores básicos
        if (typeof value === 'object' && value !== null) {
          if (value.eq !== undefined) whereClause[key] = value.eq;
          else if (value.in !== undefined) whereClause[key] = { in: value.in };
          else whereClause[key] = value;
        } else {
          whereClause[key] = value;
        }
      });
    }

    // 🔒 SEGURANÇA: Aplicar filtro de organização para tabelas sensíveis
    if (ORGANIZATION_FILTERED_TABLES.includes(table)) {
      const superAdmin = await isSuperAdmin(userId);
      
      if (!superAdmin) {
        const organizationId = await getUserOrganizationId(userId);
        
        if (!organizationId) {
          console.warn(`[SECURITY] Usuário ${userId} sem organization_id tentou acessar ${table}`);
          return res.status(403).json({ error: 'Usuário não vinculado a uma organização' });
        }
        
        // Forçar filtro por organization_id
        whereClause.organization_id = organizationId;
        console.log(`[SECURITY] Filtro de organização aplicado para ${table}: ${organizationId}`);
      } else {
        console.log(`[SECURITY] Super admin acessando ${table} - sem filtro de organização`);
      }
    }

    const options: any = {
      where: whereClause,
    };

    if (orderBy) {
      const [field, direction] = orderBy.split('.');
      options.orderBy = { [field]: direction || 'asc' };
    }

    if (limit) {
      options.take = limit;
    }

    const prismaClient = prisma as any;
    let result;

    if (single) {
      result = await prismaClient[prismaModel].findFirst(options);
      return res.json(result);
    } else {
      result = await prismaClient[prismaModel].findMany(options);
      return res.json(result);
    }
  } catch (error: any) {
    console.error(`Erro ao buscar ${req.params.table}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/query/:table/:id - Buscar por ID
 * 
 * SEGURANÇA: Verifica se o registro pertence à organização do usuário
 */
router.get("/:table/:id", authenticate, async (req: any, res) => {
  try {
    const { table, id } = req.params;
    const userId = req.user?.id;
    const prismaModel = tableMap[table];
    
    if (!prismaModel) {
      return res.status(404).json({ error: `Tabela ${table} não encontrada` });
    }

    const result = await (prisma as any)[prismaModel].findUnique({
      where: { id }
    });

    if (!result) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    // 🔒 SEGURANÇA: Verificar acesso à organização
    if (ORGANIZATION_FILTERED_TABLES.includes(table) && result.organization_id) {
      const superAdmin = await isSuperAdmin(userId);
      
      if (!superAdmin) {
        const organizationId = await getUserOrganizationId(userId);
        
        if (result.organization_id !== organizationId) {
          console.warn(`[SECURITY] Usuário ${userId} tentou acessar registro de outra organização: ${table}/${id}`);
          return res.status(403).json({ error: 'Acesso negado a este registro' });
        }
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error(`Erro ao buscar ${req.params.table}/${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/query/:table/create - Criar registro
 */
router.post("/:table/create", authenticate, async (req: any, res) => {
  try {
    const { table } = req.params;
    const data = req.body;
    const prismaModel = tableMap[table];
    
    if (!prismaModel) {
      return res.status(404).json({ error: `Tabela ${table} não encontrada` });
    }

    const result = await (prisma as any)[prismaModel].create({
      data
    });

    res.json(result);
  } catch (error: any) {
    console.error(`Erro ao criar em ${req.params.table}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/query/:table/:id - Atualizar registro
 * 
 * SEGURANÇA: Verifica se o registro pertence à organização do usuário
 */
router.patch("/:table/:id", authenticate, async (req: any, res) => {
  try {
    const { table, id } = req.params;
    const data = req.body;
    const userId = req.user?.id;
    const prismaModel = tableMap[table];
    
    if (!prismaModel) {
      return res.status(404).json({ error: `Tabela ${table} não encontrada` });
    }

    // 🔒 SEGURANÇA: Verificar acesso à organização antes de atualizar
    if (ORGANIZATION_FILTERED_TABLES.includes(table)) {
      const existing = await (prisma as any)[prismaModel].findUnique({
        where: { id },
        select: { organization_id: true }
      });

      if (existing?.organization_id) {
        const superAdmin = await isSuperAdmin(userId);
        
        if (!superAdmin) {
          const organizationId = await getUserOrganizationId(userId);
          
          if (existing.organization_id !== organizationId) {
            console.warn(`[SECURITY] Usuário ${userId} tentou atualizar registro de outra organização: ${table}/${id}`);
            return res.status(403).json({ error: 'Acesso negado a este registro' });
          }
        }
      }
    }

    const result = await (prisma as any)[prismaModel].update({
      where: { id },
      data
    });

    res.json(result);
  } catch (error: any) {
    console.error(`Erro ao atualizar ${req.params.table}/${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/query/:table/:id - Deletar registro
 * 
 * SEGURANÇA: Verifica se o registro pertence à organização do usuário
 */
router.delete("/:table/:id", authenticate, async (req: any, res) => {
  try {
    const { table, id } = req.params;
    const userId = req.user?.id;
    const prismaModel = tableMap[table];
    
    if (!prismaModel) {
      return res.status(404).json({ error: `Tabela ${table} não encontrada` });
    }

    // 🔒 SEGURANÇA: Verificar acesso à organização antes de deletar
    if (ORGANIZATION_FILTERED_TABLES.includes(table)) {
      const existing = await (prisma as any)[prismaModel].findUnique({
        where: { id },
        select: { organization_id: true }
      });

      if (existing?.organization_id) {
        const superAdmin = await isSuperAdmin(userId);
        
        if (!superAdmin) {
          const organizationId = await getUserOrganizationId(userId);
          
          if (existing.organization_id !== organizationId) {
            console.warn(`[SECURITY] Usuário ${userId} tentou deletar registro de outra organização: ${table}/${id}`);
            return res.status(403).json({ error: 'Acesso negado a este registro' });
          }
        }
      }
    }

    await (prisma as any)[prismaModel].delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error(`Erro ao deletar ${req.params.table}/${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

