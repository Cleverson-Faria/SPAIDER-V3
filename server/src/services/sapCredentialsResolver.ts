import { prisma } from "../prisma";
import { decrypt } from "../crypto";

export interface SapCredentials {
  id: string;
  domain: string;
  displayName: string;
  baseUrl: string;
  username: string;
  password: string;
  organizationId: string;
  hasApis: {
    salesOrder: boolean;
    delivery: boolean;
    billing: boolean;
    nfe: boolean;
  };
}

/**
 * Resolve as credenciais SAP do usuário
 * @param userId ID do usuário
 * @param domain Domínio específico (opcional)
 */
export async function resolveSapCredentials(userId: string, domain?: string): Promise<SapCredentials> {
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
  });

  if (!profile?.organization_id) {
    throw new Error("Usuário sem organização");
  }

  // Buscar credencial ativa
  const whereClause: any = {
    organization_id: profile.organization_id,
    is_active: true,
  };

  if (domain) {
    whereClause.domain = domain;
  }

  const credential = await prisma.sap_domain_credentials.findFirst({
    where: whereClause,
  });

  if (!credential) {
    throw new Error(`Credenciais SAP não encontradas${domain ? ` para o domínio ${domain}` : ""}`);
  }

  if (!credential.base_url || !credential.sap_username || !credential.sap_password) {
    throw new Error("Credenciais SAP incompletas (falta URL, usuário ou senha)");
  }

  // Descriptografar senha
  const password = decrypt(credential.sap_password);

  return {
    id: credential.id,
    domain: credential.domain,
    displayName: credential.display_name,
    baseUrl: credential.base_url,
    username: credential.sap_username,
    password,
    organizationId: profile.organization_id,
    hasApis: {
      salesOrder: credential.has_sales_order_api ?? true,
      delivery: credential.has_delivery_api ?? true,
      billing: credential.has_billing_api ?? false,
      nfe: credential.has_nfe_api ?? false,
    },
  };
}

