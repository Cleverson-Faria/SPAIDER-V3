/**
 * Comparador de impostos SAP
 * Migrado de: supabase/functions/sap-integration/comparison/taxComparator.ts
 */

import { TAX_MAPPING } from './constants';

export interface TaxData {
  rate: number | null;
  base: number | null;
  baseValue: number | null;
  amount: number | null;
}

export interface TaxComparison {
  original: TaxData;
  new: TaxData;
  differences: string[];
}

export function extractTaxData(pricingElements: any[], taxType: string): TaxData {
  const mapping = TAX_MAPPING[taxType];
  if (!mapping) {
    return { rate: null, base: null, baseValue: null, amount: null };
  }

  const taxData: TaxData = {
    rate: null,
    base: null,
    baseValue: null,
    amount: null
  };

  // Find rate element
  const rateElement = pricingElements.find(pe => pe.ConditionType === mapping.rate);
  if (rateElement) {
    taxData.rate = parseFloat(rateElement.ConditionRateValue) || 0;
  }

  // Find base element
  const baseElement = pricingElements.find(pe => pe.ConditionType === mapping.base);
  if (baseElement) {
    taxData.base = parseFloat(baseElement.ConditionRateValue) || 0;
  }

  // Find baseValue element
  const baseValueElement = pricingElements.find(pe => pe.ConditionType === mapping.baseValue);
  if (baseValueElement) {
    taxData.baseValue = parseFloat(baseValueElement.ConditionAmount) || 0;
  }

  // Find amount element
  const amountElement = pricingElements.find(pe => pe.ConditionType === mapping.amount);
  if (amountElement) {
    taxData.amount = parseFloat(amountElement.ConditionAmount) || 0;
  }

  return taxData;
}

export function compareTaxData(original: TaxData, newData: TaxData, taxType: string): string[] {
  const differences: string[] = [];

  if (original.rate !== newData.rate) {
    differences.push(`${taxType} Taxa: ${original.rate || 0} → ${newData.rate || 0}`);
  }

  if (original.base !== newData.base) {
    differences.push(`${taxType} Base Cálculo: ${original.base || 0} → ${newData.base || 0}`);
  }

  if (original.baseValue !== newData.baseValue) {
    differences.push(`${taxType} Valor Base: ${original.baseValue || 0} → ${newData.baseValue || 0}`);
  }

  if (original.amount !== newData.amount) {
    differences.push(`${taxType} Valor Imposto: ${original.amount || 0} → ${newData.amount || 0}`);
  }

  return differences;
}

export function compareItemTaxes(originalItem: any, newItem: any): Record<string, TaxComparison> {
  const originalPE = originalItem.to_PricingElement?.results || [];
  const newPE = newItem.to_PricingElement?.results || [];

  const taxTypes = ['ICMS', 'PIS', 'COFINS', 'ICMS_ST', 'CBS', 'IBS'];
  const result: Record<string, TaxComparison> = {};

  taxTypes.forEach(taxType => {
    const originalTax = extractTaxData(originalPE, taxType);
    const newTax = extractTaxData(newPE, taxType);
    
    result[taxType] = {
      original: originalTax,
      new: newTax,
      differences: compareTaxData(originalTax, newTax, taxType)
    };
  });

  return result;
}

// Default empty tax structure for items without taxes
export function getDefaultTaxStructure(): Record<string, TaxComparison> {
  const defaultTax: TaxComparison = {
    original: { rate: null, base: null, baseValue: null, amount: null },
    new: { rate: null, base: null, baseValue: null, amount: null },
    differences: []
  };

  return {
    ICMS: { ...defaultTax },
    PIS: { ...defaultTax },
    COFINS: { ...defaultTax },
    ICMS_ST: { ...defaultTax },
    CBS: { ...defaultTax },
    IBS: { ...defaultTax }
  };
}

