/**
 * Constantes para comparação de ordens SAP
 * Migrado de: supabase/functions/sap-integration/comparison/constants.ts
 */

// Tax mapping according to RVABRA
export const TAX_MAPPING: Record<string, { rate: string; base: string; baseValue: string; amount: string }> = {
  ICMS: {
    rate: 'BX13',
    base: 'ICBS',
    baseValue: 'BX13',
    amount: 'BX13'
  },
  PIS: {
    rate: 'BPI1',
    base: 'BPI2',
    baseValue: 'BX70',
    amount: 'BX72'
  },
  COFINS: {
    rate: 'BCO1',
    base: 'BCO2',
    baseValue: 'BX80',
    amount: 'BX82'
  },
  ICMS_ST: {
    rate: 'ISTS',
    base: 'IBRX',
    baseValue: 'BX40',
    amount: 'BX41'
  },
  CBS: {
    rate: 'CBS3',
    base: 'IBRX',
    baseValue: 'IBRX',
    amount: 'CBS3'
  },
  IBS: {
    rate: 'IB3S',
    base: 'IBRX',
    baseValue: 'IBRX',
    amount: 'IB3S'
  }
};

export const HEADER_FIELDS = [
  'SalesOrder',
  'SalesOrderType',
  'SalesOrganization',
  'DistributionChannel',
  'OrganizationDivision',
  'SoldToParty',
  'PurchaseOrderByCustomer',
  'CustomerPaymentTerms',
  'ShippingCondition',
  'IncotermsClassification',
  'IncotermsLocation1'
];

export const ITEM_FIELDS = [
  'SalesOrderItem',
  'Material',
  'RequestedQuantity',
  'RequestedQuantityUnit',
  'NetAmount',
  'ShippingPoint',
  'ProductionPlant',
  'SalesOrderItemCategory',
  'MaterialGroup',
  'ProductTaxClassification1',
  'ProfitCenter'
];

// Campos que não devem contar como diferenças no summary
export const EXCLUDED_HEADER_FIELDS = [
  'SalesOrder',
  'PurchaseOrderByCustomer',
  'SalesOrderType',
  'nfAuthenticationDate',
  'nfeDocumentStatus',
  'nfeNumber',
  'notaFiscal'
];

export const EXCLUDED_ITEM_FIELDS = [
  'brNfSourceDocumentNumber',
  'purchaseOrder',
  'notaFiscal'
];

