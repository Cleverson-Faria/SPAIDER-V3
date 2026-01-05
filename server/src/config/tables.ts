/**
 * Mapeamento de tabelas para queries genéricas
 * Mapeia nomes de tabelas (usados pelo frontend) para modelos Prisma
 */
export const tableMap: Record<string, string> = {
  'profiles': 'profiles',
  'organizations': 'organizations',
  'user_roles': 'user_roles',
  'reference_orders': 'reference_orders',
  'allowed_email_domains': 'allowed_email_domains',
  'sap_domain_credentials': 'sap_domain_credentials',
  'characteristic_level_1': 'characteristic_level_1',
  'characteristic_level_2': 'characteristic_level_2',
  'characteristic_level_3': 'characteristic_level_3',
  'test_flow_executions': 'test_flow_executions',
  'test_header_comparisons': 'test_header_comparisons',
  'test_item_comparisons': 'test_item_comparisons',
  'test_tax_comparisons': 'test_tax_comparisons',
  'test_nfe_header_comparisons': 'test_nfe_header_comparisons',
  'test_nfe_item_comparisons': 'test_nfe_item_comparisons',
  'test_nfe_tax_comparisons': 'test_nfe_tax_comparisons',
  'nfe_documents': 'nfe_documents',
  'chat_threads': 'chat_threads',
  'sap_request_logs': 'sap_request_logs',
};

