/**
 * Comparador principal de ordens SAP
 * Migrado de: supabase/functions/sap-integration/comparison/orderComparator.ts
 */

import { compareHeaderFields, compareItemFields, FieldComparison, ItemComparison } from './fieldComparator';
import { calculateSummary, ComparisonSummary } from './summaryCalculator';

export interface ComparisonResult {
  orderId: string;
  newOrderId: string;
  differences: {
    header: FieldComparison[];
    items: ItemComparison[];
  };
  summary: ComparisonSummary;
  original_order: {
    id: string;
    customer: string;
    total: string;
    items: number;
    date: string;
  };
  new_order: {
    id: string;
    customer: string;
    total: string;
    items: number;
    date: string;
  };
}

/**
 * Compara duas ordens SAP e retorna as diferenças
 */
export function compareOrders(originalOrder: any, newOrder: any): ComparisonResult {
  console.log('🔍 [Comparison] Starting detailed order comparison');
  console.log(`📊 [Comparison] Original order: ${originalOrder.SalesOrder}`);
  console.log(`📊 [Comparison] New order: ${newOrder.SalesOrder}`);

  // Compare header fields (returns ALL fields with isIdentical flag)
  const headerDifferences = compareHeaderFields(originalOrder, newOrder);
  console.log(`📊 [Comparison] Header fields compared: ${headerDifferences.length} total`);

  // Compare items (returns ALL fields with isIdentical flag)
  const originalItems = originalOrder.to_Item?.results || [];
  const newItems = newOrder.to_Item?.results || [];
  const itemComparisons = compareItemFields(originalItems, newItems);
  console.log(`📊 [Comparison] Items compared: ${itemComparisons.length} total`);

  // Calculate summary (filters specific fields from count)
  const summary = calculateSummary(headerDifferences, itemComparisons);
  console.log(`📊 [Comparison] Total differences: ${summary.totalDifferences}`);

  // Extract order info for PDF export
  const originalOrderInfo = {
    id: originalOrder.SalesOrder || '',
    customer: originalOrder.SoldToParty || '',
    total: originalOrder.TotalNetAmount || originalOrder.NetAmount || '',
    items: originalItems.length,
    date: originalOrder.SalesOrderDate || new Date().toISOString()
  };

  const newOrderInfo = {
    id: newOrder.SalesOrder || '',
    customer: newOrder.SoldToParty || '',
    total: newOrder.TotalNetAmount || newOrder.NetAmount || '',
    items: newItems.length,
    date: newOrder.SalesOrderDate || new Date().toISOString()
  };

  return {
    orderId: originalOrder.SalesOrder,
    newOrderId: newOrder.SalesOrder,
    differences: {
      header: headerDifferences,
      items: itemComparisons
    },
    summary,
    original_order: originalOrderInfo,
    new_order: newOrderInfo
  };
}

