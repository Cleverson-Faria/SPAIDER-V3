/**
 * Calculador de resumo de comparação
 * Migrado de: supabase/functions/sap-integration/comparison/summaryCalculator.ts
 */

import { EXCLUDED_HEADER_FIELDS, EXCLUDED_ITEM_FIELDS } from './constants';
import { FieldComparison, ItemComparison } from './fieldComparator';

export interface ComparisonSummary {
  totalDifferences: number;
  headerDifferences: number;
  itemDifferences: number;
  taxDifferences: number;
  sectionsWithDifferences: string[];
}

export function calculateSummary(
  headerDifferences: FieldComparison[], 
  itemComparisons: ItemComparison[]
): ComparisonSummary {
  // Filter out fields that should not be counted as differences
  const filteredHeaderDifferences = headerDifferences.filter(
    h => !h.isIdentical && !EXCLUDED_HEADER_FIELDS.includes(h.field)
  );

  let itemFieldDifferences = 0;
  let taxDifferences = 0;

  // Calculate item and tax differences
  itemComparisons.forEach(item => {
    // Count item field differences (excluding excluded fields)
    itemFieldDifferences += item.fields.filter(
      f => !f.isIdentical && !EXCLUDED_ITEM_FIELDS.includes(f.field)
    ).length;
    
    // Count tax differences
    if (item.taxes) {
      taxDifferences += item.taxes.ICMS?.differences?.length || 0;
      taxDifferences += item.taxes.PIS?.differences?.length || 0;
      taxDifferences += item.taxes.COFINS?.differences?.length || 0;
      taxDifferences += item.taxes.ICMS_ST?.differences?.length || 0;
      taxDifferences += item.taxes.CBS?.differences?.length || 0;
      taxDifferences += item.taxes.IBS?.differences?.length || 0;
    }
  });

  const totalDifferences = filteredHeaderDifferences.length + itemFieldDifferences + taxDifferences;

  // Determine which sections have differences
  const sectionsWithDifferences: string[] = [];
  
  if (filteredHeaderDifferences.length > 0) {
    sectionsWithDifferences.push('Cabeçalho');
  }
  
  if (itemFieldDifferences > 0 || taxDifferences > 0) {
    sectionsWithDifferences.push('Itens');
  }

  return {
    totalDifferences,
    headerDifferences: filteredHeaderDifferences.length,
    itemDifferences: itemFieldDifferences,
    taxDifferences,
    sectionsWithDifferences
  };
}

