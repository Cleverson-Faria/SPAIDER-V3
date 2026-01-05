import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma";

/**
 * Verifica se o usuário é super_admin
 * APENAS o campo is_super_admin da tabela profiles determina super admin
 * NÃO confundir com role 'admin' que é admin de uma organização específica
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
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
 * Middleware para verificar se é admin ou super_admin
 */
export async function requireAdmin(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const userRole = await prisma.user_roles.findFirst({
      where: { user_id: userId }
    });

    if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      return res.status(403).json({ error: "Acesso negado. Apenas administradores podem acessar." });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Middleware para verificar se é super_admin
 */
export async function requireSuperAdmin(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (!await isSuperAdmin(userId)) {
      return res.status(403).json({ error: "Apenas super admins podem acessar" });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

