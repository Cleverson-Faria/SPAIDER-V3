/**
 * Calculates the number of differences in a comparison data object
 */
export function calculateDifferences(comparisonData: any): {
  headerDifferences: number;
  itemsDifferences: number;
  total: number;
} {
  if (!comparisonData?.differences) {
    return { headerDifferences: 0, itemsDifferences: 0, total: 0 };
  }
  
  // Count header differences (excluding filtered fields)
  const excludedHeaderFields = [
    'SalesOrder', 
    'PurchaseOrderByCustomer', 
    'SalesOrderType',
    'nfAuthenticationDate',
    'nfeDocumentStatus',
    'nfeNumber',
    'notaFiscal'
  ];
  
  const headerDiffs = comparisonData.differences.header?.filter(
    (h: any) => !h.isIdentical && !excludedHeaderFields.includes(h.field)
  ).length || 0;
  
  // Count items differences (fields + taxes)
  const excludedItemFields = ['brNfSourceDocumentNumber', 'purchaseOrder', 'notaFiscal'];
  
  let itemsDiffs = 0;
  if (comparisonData.differences.items) {
    comparisonData.differences.items.forEach((item: any) => {
      // Count field differences (excluding specific fields)
      itemsDiffs += item.fields?.filter((f: any) => 
        !f.isIdentical && 
        !excludedItemFields.includes(f.field)
      ).length || 0;
      
      // Count tax differences
      if (item.taxes) {
        Object.values(item.taxes).forEach((tax: any) => {
          itemsDiffs += tax.differences?.length || 0;
        });
      }
    });
  }
  
  return {
    headerDifferences: headerDiffs,
    itemsDifferences: itemsDiffs,
    total: headerDiffs + itemsDiffs
  };
}

/**
 * Returns the appropriate badge variant based on the number of differences
 */
export function getDifferencesBadgeVariant(differences: number): "default" | "secondary" | "destructive" {
  if (differences === 0) return "default";
  if (differences <= 5) return "secondary";
  return "destructive";
}
