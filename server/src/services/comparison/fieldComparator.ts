/**
 * Comparador de campos de ordens SAP
 * Migrado de: supabase/functions/sap-integration/comparison/fieldComparator.ts
 */

import { HEADER_FIELDS, ITEM_FIELDS } from './constants';
import { compareItemTaxes, getDefaultTaxStructure, TaxComparison } from './taxComparator';

export interface FieldComparison {
  field: string;
  originalValue: any;
  newValue: any;
  path: string;
  isIdentical: boolean;
}

export interface ItemComparison {
  itemNumber: string;
  fields: FieldComparison[];
  taxes: Record<string, TaxComparison>;
}

export function compareHeaderFields(originalOrder: any, newOrder: any): FieldComparison[] {
  const headerDifferences: FieldComparison[] = [];

  HEADER_FIELDS.forEach(field => {
    const originalValue = originalOrder[field];
    const newValue = newOrder[field];
    const isIdentical = originalValue === newValue;

    headerDifferences.push({
      field,
      originalValue,
      newValue,
      path: `header.${field}`,
      isIdentical
    });
  });

  return headerDifferences;
}

export function compareItemFields(originalItems: any[], newItems: any[]): ItemComparison[] {
  const itemComparisons: ItemComparison[] = [];
  
  console.log(`🔍 [Comparison] Comparing items by SalesOrderItem field`);
  console.log(`📊 [Comparison] Original items: ${originalItems.map(i => i.SalesOrderItem).join(', ')}`);
  console.log(`📊 [Comparison] New items: ${newItems.map(i => i.SalesOrderItem).join(', ')}`);

  // Create a map of new items using SalesOrderItem as key
  const newItemsMap = new Map<string, any>();
  newItems.forEach(item => {
    if (item.SalesOrderItem) {
      newItemsMap.set(item.SalesOrderItem, item);
    }
  });

  // Track which new items we've processed
  const processedNewItems = new Set<string>();

  // Compare original items with their corresponding new items
  originalItems.forEach(originalItem => {
    const itemNumber = originalItem.SalesOrderItem;
    const newItem = newItemsMap.get(itemNumber);

    if (!newItem) {
      // Item exists in original but not in new order
      console.log(`⚠️ [Comparison] Item ${itemNumber} exists in original but not in new order`);
      itemComparisons.push({
        itemNumber: itemNumber || 'Unknown',
        fields: [{
          field: 'existence',
          originalValue: 'exists',
          newValue: 'missing',
          path: `items[${itemNumber}]`,
          isIdentical: false
        }],
        taxes: getDefaultTaxStructure()
      });
      return;
    }

    // Mark this new item as processed
    processedNewItems.add(itemNumber);

    const itemFields: FieldComparison[] = [];

    // Compare ALL item fields (including identical ones)
    ITEM_FIELDS.forEach(field => {
      const originalValue = originalItem[field];
      const newValue = newItem[field];
      const isIdentical = originalValue === newValue;

      itemFields.push({
        field,
        originalValue,
        newValue,
        path: `items[${itemNumber}].${field}`,
        isIdentical
      });
    });

    // Compare taxes
    const taxComparison = compareItemTaxes(originalItem, newItem);

    // Add the item comparison
    itemComparisons.push({
      itemNumber: itemNumber,
      fields: itemFields,
      taxes: taxComparison
    });

    console.log(`✅ [Comparison] Item ${itemNumber} compared successfully`);
  });

  // Check for items that exist in new order but not in original
  newItemsMap.forEach((newItem, itemNumber) => {
    if (!processedNewItems.has(itemNumber)) {
      console.log(`⚠️ [Comparison] Item ${itemNumber} exists in new order but not in original`);
      itemComparisons.push({
        itemNumber: itemNumber,
        fields: [{
          field: 'existence',
          originalValue: 'missing',
          newValue: 'exists',
          path: `items[${itemNumber}]`,
          isIdentical: false
        }],
        taxes: getDefaultTaxStructure()
      });
    }
  });

  return itemComparisons;
}

