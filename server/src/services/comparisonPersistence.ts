/**
 * Persistência de dados de comparação nas tabelas dedicadas
 * Migrado de: supabase/functions/sap-integration/handlers/comparisonPersistence.ts
 */

import { prisma } from '../prisma';
import { ComparisonResult } from './comparison';

interface PersistenceResult {
  success: boolean;
  error?: any;
  stats?: {
    headerRecords: number;
    itemRecords: number;
    taxRecords: number;
  };
}

/**
 * Salva dados de comparação nas 3 tabelas dedicadas
 * - test_header_comparisons
 * - test_item_comparisons  
 * - test_tax_comparisons
 */
export async function saveComparisonToTables(
  testExecutionId: string,
  comparisonData: ComparisonResult
): Promise<PersistenceResult> {
  console.log('💾 [Persistence] Salvando comparação nas tabelas dedicadas...');
  console.log(`📊 [Persistence] Test Execution ID: ${testExecutionId}`);

  try {
    // 1️⃣ Salvar header comparisons
    const headerRecords = comparisonData.differences.header.map((h) => ({
      test_execution_id: testExecutionId,
      field_name: h.field,
      field_path: h.path || `header.${h.field}`,
      original_value: String(h.originalValue ?? ''),
      new_value: String(h.newValue ?? ''),
      is_identical: h.isIdentical
    }));

    if (headerRecords.length > 0) {
      await prisma.test_header_comparisons.createMany({
        data: headerRecords
      });
      console.log(`✅ [Persistence] ${headerRecords.length} header comparisons saved`);
    }

    // 2️⃣ Salvar item field comparisons
    const itemFieldRecords: any[] = [];
    comparisonData.differences.items.forEach((item, itemPosition) => {
      item.fields.forEach((field) => {
        itemFieldRecords.push({
          test_execution_id: testExecutionId,
          item_number: item.itemNumber,
          item_position: itemPosition,
          field_name: field.field,
          field_path: field.path || `items[${item.itemNumber}].${field.field}`,
          original_value: String(field.originalValue ?? ''),
          new_value: String(field.newValue ?? ''),
          is_identical: field.isIdentical
        });
      });
    });

    if (itemFieldRecords.length > 0) {
      await prisma.test_item_comparisons.createMany({
        data: itemFieldRecords
      });
      console.log(`✅ [Persistence] ${itemFieldRecords.length} item field comparisons saved`);
    }

    // 3️⃣ Salvar tax comparisons
    const taxRecords: any[] = [];
    comparisonData.differences.items.forEach((item) => {
      const taxTypes = ['ICMS', 'PIS', 'COFINS', 'ICMS_ST', 'CBS', 'IBS'] as const;
      
      taxTypes.forEach(taxType => {
        const tax = item.taxes?.[taxType];
        if (!tax) return;

        taxRecords.push({
          test_execution_id: testExecutionId,
          item_number: item.itemNumber,
          tax_type: taxType,
          original_rate: String(tax.original?.rate ?? ''),
          original_base: String(tax.original?.base ?? ''),
          original_base_value: String(tax.original?.baseValue ?? ''),
          original_amount: String(tax.original?.amount ?? ''),
          new_rate: String(tax.new?.rate ?? ''),
          new_base: String(tax.new?.base ?? ''),
          new_base_value: String(tax.new?.baseValue ?? ''),
          new_amount: String(tax.new?.amount ?? ''),
          has_differences: Array.isArray(tax.differences) && tax.differences.length > 0,
          differences_list: tax.differences || []
        });
      });
    });

    if (taxRecords.length > 0) {
      await prisma.test_tax_comparisons.createMany({
        data: taxRecords
      });
      console.log(`✅ [Persistence] ${taxRecords.length} tax comparisons saved`);
    }

    const stats = {
      headerRecords: headerRecords.length,
      itemRecords: itemFieldRecords.length,
      taxRecords: taxRecords.length
    };

    console.log(`✅ [Persistence] Total records saved: ${stats.headerRecords} headers + ${stats.itemRecords} items + ${stats.taxRecords} taxes`);
    
    return { success: true, stats };
  } catch (error: any) {
    console.error('❌ [Persistence] Erro ao salvar comparações:', error);
    return { success: false, error };
  }
}

/**
 * Atualiza o registro de test_flow_executions com os dados de comparação
 */
export async function updateTestExecutionWithComparison(
  testExecutionId: string,
  comparisonData: ComparisonResult,
  orderData: any
): Promise<void> {
  console.log('💾 [Persistence] Atualizando test_flow_execution com dados de comparação...');

  await prisma.test_flow_executions.update({
    where: { id: testExecutionId },
    data: {
      raw_comparison_data: comparisonData as any,
      order_data: orderData,
      total_differences: comparisonData.summary.totalDifferences,
      sections_with_differences: comparisonData.summary.sectionsWithDifferences
    }
  });

  console.log('✅ [Persistence] test_flow_execution atualizado com sucesso');
}

