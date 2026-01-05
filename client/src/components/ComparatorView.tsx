import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, PlayCircle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { exportComparisonToPDF } from "@/lib/pdfExporter";
import { FlowTimeline } from "@/components/FlowTimeline";
import { TaxComparisonTable } from "./TaxComparisonTable";
import { NFeComparisonTable } from "./NFeComparisonTable";
import { NFeItemsTable } from "./NFeItemsTable";
import { translateField } from "@/lib/fieldTranslations";
import { detectBrowser, checkStorageCapabilities, AdaptiveStorage } from "@/lib/browserCompat";
import { localStorageManager } from "@/lib/localStorageManager";

// Função para validar estrutura de taxes em um item
function validateItemTaxesStructure(item: any): boolean {
  if (!item.taxes || typeof item.taxes !== 'object') {
    console.warn(`⚠️ Item ${item.itemNumber}: Missing taxes object`);
    return false;
  }
  
  // Verificar se tem PELO MENOS UM imposto válido
  const taxEntries = Object.entries(item.taxes);
  
  if (taxEntries.length === 0) {
    console.warn(`⚠️ Item ${item.itemNumber}: No taxes found`);
    return false;
  }
  
  // Validar que cada imposto presente tem a estrutura correta
  for (const [taxName, tax] of taxEntries) {
    const taxData = tax as any;
    
    if (!taxData || typeof taxData !== 'object') {
      console.warn(`⚠️ Item ${item.itemNumber}: Tax ${taxName} is invalid`);
      return false;
    }
    
    // Verificar estrutura original (pode ter valores null)
    if (!taxData.original || typeof taxData.original !== 'object') {
      console.warn(`⚠️ Item ${item.itemNumber}: Tax ${taxName} missing 'original' structure`);
      return false;
    }
    
    // Verificar estrutura new (pode ter valores null)
    if (!taxData.new || typeof taxData.new !== 'object') {
      console.warn(`⚠️ Item ${item.itemNumber}: Tax ${taxName} missing 'new' structure`);
      return false;
    }
    
    // Verificar que tem as propriedades (valores podem ser null)
    const hasOriginalProps = 'rate' in taxData.original && 'base' in taxData.original && 
                            'baseValue' in taxData.original && 'amount' in taxData.original;
    const hasNewProps = 'rate' in taxData.new && 'base' in taxData.new && 
                       'baseValue' in taxData.new && 'amount' in taxData.new;
    
    if (!hasOriginalProps || !hasNewProps) {
      console.warn(`⚠️ Item ${item.itemNumber}: Tax ${taxName} missing required properties`);
      return false;
    }
    
    // Verificar array de differences (pode estar vazio)
    if (!Array.isArray(taxData.differences)) {
      console.warn(`⚠️ Item ${item.itemNumber}: Tax ${taxName} missing 'differences' array`);
      return false;
    }
  }
  
  console.log(`✅ Item ${item.itemNumber}: Taxes structure valid (${taxEntries.length} taxes found)`);
  return true;
}

// Helper function to extract order summary from order_data
const extractOrderSummary = (orderData: any) => {
  if (!orderData) return {};
  
  return {
    customer: orderData.SoldToParty || orderData.Customer || null,
    total: orderData.TotalNetAmount || orderData.NetAmount || null,
    items: orderData.to_Item?.results?.length || orderData.items?.length || 0,
    date: orderData.SalesOrderDate || orderData.CreationDate || orderData.DocumentDate || null
  };
};

/**
 * Reconstrói estrutura de comparação a partir das tabelas dedicadas
 */
async function fetchComparisonFromTables(testExecutionId: string) {
  console.log('🔍 [Comparator] Buscando comparação das tabelas dedicadas...');
  
  // 1. Buscar metadados do flow execution (incluindo order_data para extrair informações)
  const flowExecution = await api.get('test_flow_executions', testExecutionId);

  if (!flowExecution) {
    throw new Error('Erro ao buscar metadados do flow execution');
  }
  
  // Buscar das 3 tabelas em paralelo
  const [headerData, itemsData, taxesData] = await Promise.all([
    api.query('test_header_comparisons', {
      where: { test_execution_id: testExecutionId },
      orderBy: 'field_name.asc'
    }),
    
    api.query('test_item_comparisons', {
      where: { test_execution_id: testExecutionId },
      orderBy: 'item_number.asc'
    }),
    
    api.query('test_tax_comparisons', {
      where: { test_execution_id: testExecutionId },
      orderBy: 'item_number.asc'
    })
  ]);

  // Extract order information for PDF export
  const rawComparisonData = flowExecution.raw_comparison_data as any;
  const originalOrderInfo = rawComparisonData?.original_order 
    ? extractOrderSummary(rawComparisonData.original_order)
    : {};
  
  const newOrderInfo = flowExecution.order_data 
    ? extractOrderSummary(flowExecution.order_data as any)
    : {};

  // Reconstruir estrutura esperada pelo UI
  const headerDifferences = (headerData || []).map((h: any) => ({
    field: h.field_name,
    originalValue: h.original_value,
    newValue: h.new_value,
    path: h.field_path,
    isIdentical: h.is_identical
  }));

  // Agrupar items por item_number
  const itemsGrouped = new Map();
  (itemsData || []).forEach((item: any) => {
    if (!itemsGrouped.has(item.item_number)) {
      itemsGrouped.set(item.item_number, {
        itemNumber: item.item_number,
        fields: [],
        taxes: {}
      });
    }
    
    itemsGrouped.get(item.item_number).fields.push({
      field: item.field_name,
      originalValue: item.original_value,
      newValue: item.new_value,
      path: item.field_path,
      isIdentical: item.is_identical
    });
  });

  // Adicionar taxes aos items
  (taxesData || []).forEach((tax: any) => {
    const item = itemsGrouped.get(tax.item_number);
    if (!item) return;
    
    item.taxes[tax.tax_type] = {
      original: {
        rate: tax.original_rate,
        base: tax.original_base,
        baseValue: tax.original_base_value,
        amount: tax.original_amount
      },
      new: {
        rate: tax.new_rate,
        base: tax.new_base,
        baseValue: tax.new_base_value,
        amount: tax.new_amount
      },
      differences: tax.differences_list || []
    };
  });

  const itemComparisons = Array.from(itemsGrouped.values());

  // Inicializar todos os impostos com estrutura vazia para garantir renderização
  itemComparisons.forEach(item => {
    const defaultTaxStructure = {
      original: { rate: null, base: null, baseValue: null, amount: null },
      new: { rate: null, base: null, baseValue: null, amount: null },
      differences: []
    };
    
    ['ICMS', 'PIS', 'COFINS', 'ICMS_ST', 'CBS', 'IBS'].forEach(taxType => {
      if (!item.taxes[taxType]) {
        item.taxes[taxType] = { ...defaultTaxStructure };
      }
    });
  });

  // 2. Calcular summary dinamicamente
  const headerDiffsCount = headerDifferences.filter(h => !h.isIdentical).length;
  let itemDiffsCount = 0;
  
  itemComparisons.forEach(item => {
    // Contar fields diferentes
    itemDiffsCount += item.fields.filter((f: any) => !f.isIdentical).length;
    
    // Contar taxes com diferenças
    Object.values(item.taxes).forEach((tax: any) => {
      itemDiffsCount += tax.differences?.length || 0;
    });
  });

  const summary = {
    totalDifferences: headerDiffsCount + itemDiffsCount,
    headerDifferences: headerDiffsCount,
    itemsDifferences: itemDiffsCount
  };

  console.log(`✅ [Comparator] Reconstruído: ${headerDifferences.length} headers, ${itemComparisons.length} items, ${(taxesData || []).length} taxes`);
  console.log(`📊 [Comparator] Summary: ${summary.totalDifferences} diferenças totais`);

  // 3. Retornar estrutura completa com informações de ordem
  return {
    orderId: flowExecution.original_order_id,
    newOrderId: flowExecution.order_id,
    differences: {
      header: headerDifferences,
      items: itemComparisons
    },
    summary,
    original_order: {
      id: flowExecution.original_order_id,
      ...originalOrderInfo
    },
    new_order: {
      id: flowExecution.order_id,
      ...newOrderInfo
    }
  };
}

interface ComparatorViewProps {
  runId: string | null;
  onBackToChat: () => void;
  mode?: 'single-order' | 'full-flow';
}

export const ComparatorView = ({ runId, onBackToChat, mode = 'single-order' }: ComparatorViewProps) => {
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [flowData, setFlowData] = useState<any>(null);
  const [nfeComparisons, setNfeComparisons] = useState<any[]>([]);
  const [nfeItems, setNfeItems] = useState<any[]>([]);
  const [nfeDifferencesCount, setNfeDifferencesCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [activeView, setActiveView] = useState<'timeline' | 'order-comparison' | 'nfe-comparison'>('timeline');
  const [adaptiveStorage, setAdaptiveStorage] = useState<AdaptiveStorage | null>(null);
  const { toast } = useToast();
  const { user, organization, isSuperAdmin } = useAuth();

  // Inicializar storage adaptativo na montagem do componente
  useEffect(() => {
    const initStorage = async () => {
      try {
        const browser = detectBrowser();
        const capabilities = await checkStorageCapabilities();
        
        console.log('🔍 [ComparatorView] Inicializando storage:', {
          browser: `${browser.name} ${browser.version}`,
          strategy: capabilities.recommendedStrategy,
          quotaMB: (capabilities.localStorageQuota / 1024 / 1024).toFixed(2),
          usedMB: (capabilities.localStorageUsed / 1024 / 1024).toFixed(2),
          availableMB: ((capabilities.localStorageQuota - capabilities.localStorageUsed) / 1024 / 1024).toFixed(2)
        });
        
        const storage = new AdaptiveStorage(capabilities.recommendedStrategy);
        setAdaptiveStorage(storage);
        
        // Feedback para usuário se não for localStorage
        if (capabilities.recommendedStrategy !== 'localStorage') {
          const messages = {
            sessionStorage: 'Cache temporário ativo (dados serão perdidos ao fechar o navegador)',
            memory: 'Cache em memória ativo (dados serão perdidos ao recarregar a página)',
            none: 'Cache desabilitado - dados carregados do servidor'
          };
          
          toast({
            title: 'ℹ️ Modo de Cache Alternativo',
            description: messages[capabilities.recommendedStrategy],
            variant: 'default'
          });
        }
        
        // Limpar localStorage antigo se necessário
        if (capabilities.canWriteLocalStorage) {
          const percentUsed = (capabilities.localStorageUsed / capabilities.localStorageQuota) * 100;
          if (percentUsed > 70) {
            console.log('🧹 LocalStorage acima de 70%, limpando itens antigos...');
            localStorageManager.cleanOldComparisons();
          }
        }
      } catch (error) {
        console.error('❌ Erro ao inicializar storage:', error);
        // Fallback para memória
        setAdaptiveStorage(new AdaptiveStorage('memory'));
      }
    };
    
    initStorage();
  }, []);

  useEffect(() => {
    const loadComparisonData = async () => {
      if (!runId || !adaptiveStorage) return;

      console.log('🔍 [ComparatorView] Iniciando carregamento de dados:', {
        runId,
        storageStrategy: adaptiveStorage.getStrategy(),
        browser: detectBrowser().name
      });

      // 1️⃣ PRIMEIRO: Tentar carregar do storage adaptativo
      let storedComparison: string | null = null;
      let storedFlow: string | null = null;
      
      try {
        storedComparison = adaptiveStorage.getItem(`comparison_${runId}`);
        storedFlow = adaptiveStorage.getItem(`flow_${runId}`);
        
        console.log('📦 [ComparatorView] Storage check:', {
          hasComparison: !!storedComparison,
          hasFlow: !!storedFlow,
          comparisonSize: storedComparison ? (storedComparison.length / 1024).toFixed(2) + ' KB' : 'N/A',
          flowSize: storedFlow ? (storedFlow.length / 1024).toFixed(2) + ' KB' : 'N/A'
        });
      } catch (error) {
        console.error('❌ Erro ao ler do storage:', error);
        
        // Feedback para usuário
        toast({
          title: '⚠️ Problema no Cache',
          description: 'Carregando dados diretamente do servidor',
          variant: 'default'
        });
      }

      if (storedComparison) {
        try {
          const parsed = JSON.parse(storedComparison);
          
          // ✅ Validar estrutura básica
          if (
            parsed &&
            parsed.differences &&
            Array.isArray(parsed.differences.header) &&
            Array.isArray(parsed.differences.items) &&
            parsed.summary &&
            parsed.orderId &&
            parsed.newOrderId
          ) {
            // ✅ NOVA VALIDAÇÃO: Verificar estrutura de taxes em todos os itens
            const allItemsHaveValidTaxes = parsed.differences.items.every((item: any) => 
              validateItemTaxesStructure(item)
            );
            
            if (allItemsHaveValidTaxes) {
              console.log('✅ Dados válidos carregados do localStorage (incluindo impostos)');
              setComparisonData(parsed);
            } else {
              console.warn('⚠️ Estrutura de impostos inválida no storage, removendo...', {
                itemCount: parsed.differences.items.length,
                sampleItem: parsed.differences.items[0]
              });
              adaptiveStorage.removeItem(`comparison_${runId}`);
              storedComparison = null;
            }
          } else {
            console.warn('⚠️ Estrutura básica inválida no storage, removendo...', parsed);
            adaptiveStorage.removeItem(`comparison_${runId}`);
            storedComparison = null;
          }
        } catch (e) {
          console.error('❌ Erro ao parsear storage:', e);
          adaptiveStorage.removeItem(`comparison_${runId}`);
          storedComparison = null;
        }
      }

      if (storedFlow) {
        const parsed = JSON.parse(storedFlow);
        
        // ✅ Verificar se localStorage tem dados completos
        const hasValidData = parsed.flow_result.raw_comparison_data?.summary?.totalDifferences !== undefined;
        
        console.log('📦 [DEBUG] Dados do localStorage:', {
          fonte: 'localStorage',
          runId: runId,
          hasRawComparisonData: !!parsed.flow_result.raw_comparison_data,
          hasSummary: !!parsed.flow_result.raw_comparison_data?.summary,
          totalDifferences: parsed.flow_result.raw_comparison_data?.summary?.totalDifferences,
          summaryCompleto: parsed.flow_result.raw_comparison_data?.summary
        });
        
        if (!hasValidData) {
          console.warn('⚠️ Storage desatualizado detectado - limpando...');
          adaptiveStorage.removeItem(`flow_${runId}`);
          adaptiveStorage.removeItem(`comparison_${runId}`);
          storedFlow = null; // Força busca do banco
        } else {
          console.log('✅ Storage válido, usando cache');
          setFlowData(parsed.flow_result);
        }
      }

      // 2️⃣ FALLBACK: Se não encontrou no storage, buscar do banco
      console.log('🔍 Verificando necessidade de buscar do banco:', {
        storedComparison: !!storedComparison,
        storedFlow: !!storedFlow,
        shouldFetchFromDB: !storedComparison || !storedFlow
      });
      
      if (!storedComparison || !storedFlow) {
        try {
          const flowExecutions = await api.query('test_flow_executions', {
            where: { run_id: runId },
            single: true
          });
          const flowExecution = Array.isArray(flowExecutions) ? flowExecutions[0] : flowExecutions;

          if (flowExecution) {
            // 🆕 Buscar comparações de NF-e das 3 novas tabelas
            if (flowExecution.nfe_differences && flowExecution.nfe_differences > 0) {
              try {
                const headerData = await api.query('test_nfe_header_comparisons', {
                  where: { test_execution_id: flowExecution.id },
                  orderBy: 'field_name.asc'
                });
                
                const itemData = await api.query('test_nfe_item_comparisons', {
                  where: { test_execution_id: flowExecution.id },
                  orderBy: 'item_number.asc'
                });
                
                const taxData = await api.query('test_nfe_tax_comparisons', {
                  where: { test_execution_id: flowExecution.id },
                  orderBy: 'item_number.asc'
                });
                
                if (headerData || itemData || taxData) {
                  console.log(`✅ [Comparator] Loaded NFe comparisons: ${headerData?.length || 0} headers, ${itemData?.length || 0} items, ${taxData?.length || 0} taxes`);
                  
                  // Reconstruir estrutura de comparação
                  const nfeComparison: any = {
                    differences: {
                      header: headerData?.map(h => ({
                        field: h.field_name,
                        path: h.field_path,
                        originalValue: h.original_value,
                        newValue: h.new_value,
                        isIdentical: h.is_identical
                      })) || [],
                      items: []
                    }
                  };
                  
                  // Agrupar itens
                  const itemsMap = new Map();
                  itemData?.forEach(item => {
                    if (!itemsMap.has(item.item_number)) {
                      itemsMap.set(item.item_number, {
                        itemNumber: item.item_number,
                        fields: [],
                        taxes: {}
                      });
                    }
                    itemsMap.get(item.item_number).fields.push({
                      field: item.field_name,
                      path: item.field_path,
                      originalValue: item.original_value,
                      newValue: item.new_value,
                      isIdentical: item.is_identical
                    });
                  });
                  
                  // Adicionar impostos
                  taxData?.forEach(tax => {
                    if (itemsMap.has(tax.item_number)) {
                      itemsMap.get(tax.item_number).taxes[tax.tax_type] = {
                        original: {
                          rate: tax.original_rate,
                          base: tax.original_base,
                          baseValue: tax.original_base_value,
                          amount: tax.original_amount
                        },
                        new: {
                          rate: tax.new_rate,
                          base: tax.new_base,
                          baseValue: tax.new_base_value,
                          amount: tax.new_amount
                        },
                        differences: tax.differences_list || []
                      };
                    }
                  });
                  
              nfeComparison.differences.items = Array.from(itemsMap.values());
              setNfeComparisons(nfeComparison.differences.header);
              setNfeItems(nfeComparison.differences.items);
              setNfeDifferencesCount(flowExecution.nfe_differences);
                }
              } catch (error) {
                console.error('❌ [Comparator] Error loading NFe comparisons:', error);
              }
            }

            // 3️⃣ PRIORIDADE 1: Tentar buscar das tabelas dedicadas
            if (!storedComparison) {
              try {
                const reconstructedComparison = await fetchComparisonFromTables(flowExecution.id);
                
                // Use the helper function to extract order information
                const rawComparisonData = flowExecution.raw_comparison_data as any;
                const originalOrderInfo = rawComparisonData?.original_order 
                  ? extractOrderSummary(rawComparisonData.original_order)
                  : extractOrderSummary(rawComparisonData?.originalOrder); // fallback to camelCase
                
                const newOrderInfo = flowExecution.order_data 
                  ? extractOrderSummary(flowExecution.order_data as any)
                  : {};
                
                // Adicionar metadados necessários
                const fullComparison = {
                  ...reconstructedComparison,
                  
                  // Alias para PDF exporter
                  comparison: reconstructedComparison.differences,
                  
                  summary: {
                    totalDifferences: flowExecution.total_differences || 0,
                    sectionsWithDifferences: flowExecution.sections_with_differences || []
                  }
                };
                
                console.log('✅ [Comparator] Comparação carregada das tabelas dedicadas');
                setComparisonData(fullComparison);
                
                // Salvar no storage para cache
                try {
                  adaptiveStorage.setItem(`comparison_${runId}`, JSON.stringify(fullComparison));
                } catch (storageError) {
                  console.warn('⚠️ Erro ao salvar no storage:', storageError);
                }
                
              } catch (tableError) {
                console.warn('⚠️ [Comparator] Falha ao buscar das tabelas, tentando JSONB...', tableError);
                
                // 🔄 FALLBACK: Usar JSONB se tabelas falharem
                if (flowExecution.raw_comparison_data) {
                  const compData = flowExecution.raw_comparison_data as any;
                  
                  // Extract order info if not present
                  if (!compData.original_order || !compData.new_order) {
                    const rawComparisonData = flowExecution.raw_comparison_data as any;
                    const originalOrderInfo = rawComparisonData?.original_order 
                      ? extractOrderSummary(rawComparisonData.original_order)
                      : extractOrderSummary(rawComparisonData?.originalOrder);
                    
                    const newOrderInfo = flowExecution.order_data 
                      ? extractOrderSummary(flowExecution.order_data as any)
                      : {};
                    
                    compData.original_order = {
                      id: flowExecution.original_order_id,
                      ...originalOrderInfo
                    };
                    compData.new_order = {
                      id: flowExecution.order_id,
                      ...newOrderInfo
                    };
                  }
                  
                  console.log('📊 [Comparator] Usando JSONB como fallback');
                  setComparisonData(compData);
                  try {
                    adaptiveStorage.setItem(`comparison_${runId}`, JSON.stringify(compData));
                  } catch (storageError) {
                    console.warn('⚠️ Erro ao salvar no storage:', storageError);
                  }
                } else {
                  console.error('❌ [Comparator] Nenhuma fonte de dados disponível');
                  toast({
                    title: "Dados Incompletos",
                    description: "Não foi possível carregar os dados de comparação.",
                    variant: "destructive"
                  });
                }
              }
            }

            // 4️⃣ Reconstituir os dados de fluxo
            if (!storedFlow) {
              const orderData = flowExecution.order_data as any;
              
              // Criar objeto de steps - SEMPRE criar todos os steps, usar status do banco
              const steps = {
                order: {
                  status: flowExecution.order_status || 'pending',
                  data: flowExecution.order_data,
                  id: orderData?.SalesOrder || flowExecution.order_id || ''
                },
                delivery: {
                  status: flowExecution.delivery_status || 'pending',
                  data: flowExecution.delivery_data || null,
                  id: flowExecution.delivery_id || (flowExecution.delivery_data as any)?.DeliveryDocument || null
                },
                picking: {
                  status: flowExecution.picking_status || 'pending',
                  data: null,
                  id: null
                },
                pgi: {
                  status: flowExecution.pgi_status || 'pending',
                  data: null,
                  id: null
                },
                billing: {
                  status: flowExecution.billing_status || 'pending',
                  data: flowExecution.billing_data || null,
                  id: flowExecution.billing_id || (flowExecution.billing_data as any)?.BillingDocument || null
                },
                nfe: {
                  status: flowExecution.nfe_status || 'pending',
                  data: flowExecution.nfe_data || null,
                  id: flowExecution.nfe_number || 
                      (flowExecution.nfe_data as any)?.notaFiscal?.toString() || 
                      (flowExecution.nfe_data as any)?.nfeNumber?.toString() || 
                      null
                }
              };
              
              // ✅ Usar completed_steps e total_steps do banco (não recalcular!)
              const completedSteps = flowExecution.completed_steps || 0;
              const totalSteps = flowExecution.total_steps || 6;
              
              // ✅ Criar array de errors baseado nos status
              const errors: string[] = [];
              Object.entries(steps).forEach(([stepName, step]) => {
                if (step.status === 'error' || step.status === 'failed') {
                  errors.push(`Erro na etapa: ${stepName}`);
                }
              });
              
              const reconstructedFlow = {
                steps,
                completedSteps,
                totalSteps,
                errors,
                raw_comparison_data: flowExecution.raw_comparison_data,
                testType: flowExecution.test_type || 'fluxo_completo'
              };
              
              console.log('🔄 [Comparator] Flow reconstituído:', {
                completedSteps,
                totalSteps,
                testType: reconstructedFlow.testType,
                steps: Object.entries(steps).map(([k, v]) => ({ step: k, status: v.status, id: v.id }))
              });
              
              setFlowData(reconstructedFlow);
              try {
                adaptiveStorage.setItem(`flow_${runId}`, JSON.stringify({ flow_result: reconstructedFlow }));
              } catch (storageError) {
                console.warn('⚠️ Erro ao salvar no storage:', storageError);
              }
            }
          } else {
            toast({
              title: "Dados Não Encontrados",
              description: "Nenhum registro foi encontrado para este teste.",
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error('❌ Erro ao processar dados do banco:', {
            error,
            runId,
            message: error instanceof Error ? error.message : 'Erro desconhecido'
          });
          toast({
            title: "Erro ao Processar Dados",
            description: `Ocorreu um erro ao processar os dados do teste ${runId}. Tente recarregar a página.`,
            variant: "destructive"
          });
        }
      }
    };

    loadComparisonData();
  }, [runId, toast, adaptiveStorage]);

  const handleExport = async () => {
    if (!comparisonData || !user || !organization) {
      toast({
        title: "Dados Incompletos",
        description: "Não há dados de comparação disponíveis para exportar.",
        variant: "destructive"
      });
      return;
    }
    
    setIsExporting(true);
    try {
      // Buscar logo do domínio SAP e logo do Spaider
      let domainLogo: string | undefined;
      let spaiderLogo: string | undefined;

      // 🆕 Buscar logo do domínio SAP usado no teste
      try {
        const testDataResult = await api.query('test_flow_executions', {
          where: { run_id: runId },
          single: true
        });
        const testData = Array.isArray(testDataResult) ? testDataResult[0] : testDataResult;

        if (testData?.sap_domain) {
          console.log('🔍 [PDF] Buscando logo do domínio:', testData.sap_domain);
          
          const credDataResult = await api.query('sap_domain_credentials', {
            where: { domain: testData.sap_domain, is_active: true },
            single: true
          });
          const credData = Array.isArray(credDataResult) ? credDataResult[0] : credDataResult;
          
          if (credData?.logo_url) {
            console.log('✅ [PDF] Logo do domínio encontrada:', credData.logo_url);
            domainLogo = credData.logo_url;
          } else {
            console.warn('⚠️ [PDF] Logo do domínio não encontrada');
          }
        } else {
          console.warn('⚠️ [PDF] sap_domain não encontrado no teste');
        }
      } catch (error) {
        console.warn('⚠️ [PDF] Erro ao buscar logo do domínio:', error);
      }

      // Buscar logo do Spaider
      try {
        const orgData = await api.get('organizations', organization.id);
        
        if (orgData?.spaider_logo_url) {
          spaiderLogo = orgData.spaider_logo_url;
        }
      } catch (error) {
        console.warn('⚠️ [PDF] Erro ao buscar logo do Spaider:', error);
      }

      // 🔧 Construir estrutura de dados esperada pelo pdfExporter
      // O pdfExporter espera: { comparison, original_order, new_order }
      const pdfData = {
        comparison: comparisonData.comparison || comparisonData.differences || {
          header: comparisonData.differences?.header || [],
          items: comparisonData.differences?.items || []
        },
        original_order: comparisonData.original_order || {
          id: comparisonData.orderId || flowData?.orderId || 'N/A',
          customer: comparisonData.originalOrder?.SoldToParty || 'N/A',
          total: comparisonData.originalOrder?.TotalNetAmount || 'N/A',
          items: comparisonData.differences?.items?.length || 0,
          date: comparisonData.originalOrder?.SalesOrderDate || new Date().toISOString()
        },
        new_order: comparisonData.new_order || {
          id: comparisonData.newOrderId || flowData?.steps?.order?.id || 'N/A',
          customer: comparisonData.newOrder?.SoldToParty || 'N/A',
          total: comparisonData.newOrder?.TotalNetAmount || 'N/A',
          items: comparisonData.differences?.items?.length || 0,
          date: comparisonData.newOrder?.SalesOrderDate || new Date().toISOString()
        },
        // Incluir summary se existir
        summary: comparisonData.summary || {
          totalDifferences: 0,
          sectionsWithDifferences: []
        },
        // Manter dados de diferenças
        differences: comparisonData.differences || comparisonData.comparison || {
          header: [],
          items: []
        }
      };

      console.log('📄 [PDF] Dados preparados para exportação:', {
        hasComparison: !!pdfData.comparison,
        hasOriginalOrder: !!pdfData.original_order,
        hasNewOrder: !!pdfData.new_order,
        originalOrderId: pdfData.original_order.id,
        newOrderId: pdfData.new_order.id
      });

      // For full-flow mode, include flow data
      if (mode === 'full-flow' && flowData) {
        // Transform nested flowData to flat structure (same as TestHistory)
        const flatFlowData = {
          // Delivery
          delivery_status: flowData.steps?.delivery?.status || 'pending',
          delivery_id: flowData.steps?.delivery?.data?.DeliveryDocument || null,
          delivery_data: flowData.steps?.delivery?.data || null,
          
          // Picking and PGI
          picking_status: flowData.steps?.picking?.status || 'pending',
          pgi_status: flowData.steps?.pgi?.status || 'pending',
          
          // Billing
          billing_status: flowData.steps?.billing?.status || 'pending',
          billing_id: flowData.steps?.billing?.data?.BillingDocument || null,
          billing_data: flowData.steps?.billing?.data || null,
          
          // NFe
          nfe_status: flowData.steps?.nfe?.status || 'pending',
          nfe_number: flowData.steps?.nfe?.data?.BRNFNumber || null,
          nfe_data: flowData.steps?.nfe?.data || null,
          
          // Summary
          completed_steps: flowData.completedSteps || 0,
          total_steps: flowData.totalSteps || 0,
          test_status: flowData.completedSteps === flowData.totalSteps ? 'completed' : 'processing',
          errors: flowData.errors || []
        };
        
        await exportComparisonToPDF(
          pdfData,
          runId,
          user?.email,
          organization?.name,
          organization?.logo_url || undefined,
          domainLogo,
          spaiderLogo,
          true,
          flatFlowData
        );
      } else {
        await exportComparisonToPDF(
          pdfData, 
          runId, 
          user?.email,
          organization?.name,
          organization?.logo_url || undefined,
          domainLogo,
          spaiderLogo
        );
      }
      
      toast({
        title: "PDF Gerado com Sucesso",
        description: "O relatório de comparação foi baixado.",
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao Gerar PDF",
        description: "Ocorreu um erro ao criar o documento. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewOrderComparison = () => {
    setActiveView('order-comparison');
  };

  const handleViewNFeComparison = () => {
    setActiveView('nfe-comparison');
  };

  const handleBackToTimeline = () => {
    setActiveView('timeline');
  };

  const handleRetryFlow = async () => {
    if (!flowData?.steps?.order?.id) {
      toast({
        title: 'Erro',
        description: 'Ordem base não encontrada',
        variant: 'destructive'
      });
      return;
    }

    setIsRetrying(true);
    
    try {
      const existingOrderId = flowData.steps.order.id;
      const continueRunId = `${runId}_Continue_${Date.now()}`;

      // ✅ Buscar testExecutionId do banco usando runId ORIGINAL
      let testExecutionId: string | undefined;
      try {
        const existingTestResult = await api.query('test_flow_executions', {
          where: { run_id: runId },
          single: true
        });
        const existingTest = Array.isArray(existingTestResult) ? existingTestResult[0] : existingTestResult;
        testExecutionId = existingTest?.id;
      } catch (fetchError) {
        console.error('Error fetching test execution:', fetchError);
        toast({
          title: 'Erro',
          description: 'Não foi possível localizar o teste original',
          variant: 'destructive'
        });
        return;
      }

      if (!testExecutionId) {
        toast({
          title: 'Erro',
          description: 'ID do teste não encontrado. Execute um fluxo completo primeiro.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: "Continuando Fluxo",
        description: "Retomando processo a partir da etapa que falhou...",
      });

      const data = await api.invoke('sap-integration', {
        action: 'resume-flow',
        orderId: existingOrderId,
        runId: continueRunId,
        testExecutionId: testExecutionId, // ✅ Passa o ID correto
        userId: user?.id,
        organizationId: organization?.id
      });

      if (data.localStorage?.key && data.localStorage?.value) {
        try {
          adaptiveStorage.setItem(data.localStorage.key, data.localStorage.value);
        } catch (storageError) {
          console.warn('⚠️ Erro ao salvar no storage após retry:', storageError);
        }
      }

      const newFlowData = JSON.parse(data.localStorage.value).flow_result;
      setFlowData(newFlowData);

      toast({
        title: data.ui?.toast?.title || "Fluxo Continuado",
        description: data.ui?.toast?.description || "O fluxo foi retomado",
        variant: data.ui?.toast?.variant || 'default'
      });

    } catch (error) {
      console.error('Error continuing flow:', error);
      toast({
        title: 'Erro ao Continuar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive'
      });
    } finally {
      setIsRetrying(false);
    }
  };

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Nenhuma comparação selecionada</p>
      </div>
    );
  }

  // If in full-flow mode, show flow timeline or order comparison
  if (mode === 'full-flow' && flowData) {
    // When viewing NFe comparison within full-flow mode
    if (activeView === 'nfe-comparison' && nfeComparisons && nfeComparisons.length > 0) {
      return (
        <div className="h-full flex flex-col bg-background">
          <div className="flex items-center justify-between p-4 border-b bg-card">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBackToTimeline}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold">Comparação de NF-e</h2>
                <p className="text-sm text-muted-foreground">Run ID: {runId}</p>
              </div>
            </div>
            <Badge variant={nfeDifferencesCount > 0 ? "destructive" : "default"}>
              {nfeDifferencesCount} diferença(s)
            </Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header da NFe */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Campos do Cabeçalho</h3>
              <NFeComparisonTable comparisons={nfeComparisons} />
            </Card>
            
            {/* Itens e Impostos da NFe */}
            {nfeItems && nfeItems.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Itens da NF-e</h3>
                <NFeItemsTable items={nfeItems} />
              </Card>
            )}
          </div>
        </div>
      );
    }
    
    // When viewing order comparison within full-flow mode
    if (activeView === 'order-comparison' && comparisonData) {
      // ✅ VALIDAÇÃO: Verificar estrutura completa antes de usar
      if (
        !comparisonData.differences ||
        !Array.isArray(comparisonData.differences.header) ||
        !Array.isArray(comparisonData.differences.items) ||
        !comparisonData.summary ||
        !comparisonData.orderId ||
        !comparisonData.newOrderId
      ) {
        console.error('❌ Estrutura inválida em full-flow order-comparison:', comparisonData);
        return (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <Card className="p-6 max-w-md text-center">
              <h2 className="text-xl font-bold mb-2">Dados Incompletos</h2>
              <p className="text-muted-foreground mb-4">
                A estrutura de dados de comparação está incompleta ou corrompida.
              </p>
              <div className="space-y-2">
                <Button onClick={handleBackToTimeline} className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar para Timeline
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
                  Recarregar Página
                </Button>
              </div>
            </Card>
          </div>
        );
      }

      const { differences, summary, orderId, newOrderId } = comparisonData;
      const displayHeaderFields = differences.header.filter(
        (h: any) => !['SalesOrder', 'PurchaseOrderByCustomer', 'SalesOrderType'].includes(h.field)
      );

      return (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="border-b border-border bg-background p-4">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToTimeline}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para Timeline
              </Button>
              <h2 className="text-lg font-semibold">Comparação: Ordem de Vendas</h2>
              
              {/* Botão Exportar PDF */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
              >
                <FileDown className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
                {isExporting ? 'Exportando...' : 'Exportar PDF'}
              </Button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Total de Diferenças</div>
                <div className="text-2xl font-bold">{summary.totalDifferences}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Seções Afetadas</div>
                <div className="text-2xl font-bold">{summary.sectionsWithDifferences.join(', ') || 'Nenhuma'}</div>
              </Card>
            </div>

            {/* Order Info */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Ordem Original</div>
                <div className="font-semibold">{orderId}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Ordem Criada</div>
                <div className="font-semibold">{newOrderId}</div>
              </Card>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Banner de Sucesso */}
            {summary.totalDifferences === 0 && (
              <Card className="p-4 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <div className="text-green-600 dark:text-green-400 text-2xl">✓</div>
                  <div>
                    <div className="text-green-800 dark:text-green-200 font-semibold">Comparação Perfeita</div>
                    <p className="text-green-700 dark:text-green-300 text-sm">
                      Todas as informações foram replicadas com sucesso. Nenhuma diferença encontrada.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Header Fields */}
            <Card className="p-4 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              <h3 className="font-semibold mb-4">Campos do Cabeçalho</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Campo</th>
                      <th className="text-left p-2">Valor Original</th>
                      <th className="text-left p-2">Valor Criado</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayHeaderFields.map((field: any, idx: number) => (
                      <tr key={idx} className="border-b stagger-item">
                        <td className="p-2 font-medium">{translateField(field.field)}</td>
                        <td className="p-2">{field.originalValue || '-'}</td>
                        <td className="p-2">{field.newValue || '-'}</td>
                        <td className="p-2 text-center">
                          <Badge variant={field.isIdentical ? "default" : "destructive"}>
                            {field.isIdentical ? "Igual" : "Diferente"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Items */}
            <Card className="p-4 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              <h3 className="font-semibold mb-4">Itens da Ordem</h3>
              <Accordion type="single" collapsible className="w-full">
                {differences.items.map((item: any, itemIdx: number) => (
                  <AccordionItem key={itemIdx} value={`item-${itemIdx}`}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <span>Item {item.itemNumber}</span>
                        {item.fields.some((f: any) => !f.isIdentical) && (
                          <Badge variant="destructive" className="text-xs">
                            {item.fields.filter((f: any) => !f.isIdentical).length} diferença(s)
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {/* Item Fields */}
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold mb-2">Campos do Item</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-2">Campo</th>
                                <th className="text-left p-2">Original</th>
                                <th className="text-left p-2">Criado</th>
                                <th className="text-center p-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.fields.map((field: any, fieldIdx: number) => (
                                <tr key={fieldIdx} className="border-b stagger-item">
                                  <td className="p-2 font-medium">{translateField(field.field)}</td>
                                  <td className="p-2">{field.originalValue || '-'}</td>
                                  <td className="p-2">{field.newValue || '-'}</td>
                                  <td className="p-2 text-center">
                                    <Badge variant={field.isIdentical ? "default" : "destructive"}>
                                      {field.isIdentical ? "Igual" : "Diferente"}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Taxes */}
                      {item.taxes && Object.keys(item.taxes).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Impostos</h4>
                          <TaxComparisonTable taxes={item.taxes} />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          </div>
        </div>
      );
    }

    // Timeline view (default for full-flow mode)
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-border bg-background p-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToChat}
              disabled={isRetrying}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <h2 className="text-lg font-semibold">Fluxo Completo SAP</h2>
            
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (adaptiveStorage) {
                      adaptiveStorage.removeItem(`flow_${runId}`);
                      adaptiveStorage.removeItem(`comparison_${runId}`);
                    }
                    toast({
                      title: "Cache Limpo",
                      description: "Recarregando dados do banco...",
                    });
                    window.location.reload();
                  }}
                >
                  🗑️ Limpar Cache
                </Button>
              )}
              
              {(!flowData.success || flowData.completedSteps < flowData.totalSteps) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetryFlow}
                  disabled={isRetrying}
                >
                  <PlayCircle className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Continuando...' : 'Continuar Fluxo'}
                </Button>
              )}
              
              {/* Botão Exportar PDF */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting || !comparisonData}
              >
                <FileDown className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
                {isExporting ? 'Exportando...' : 'Exportar PDF'}
              </Button>
            </div>
          </div>

          {/* Flow Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Etapas Concluídas</div>
              <div className="text-2xl font-bold">{flowData.completedSteps}/{flowData.totalSteps}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Status</div>
              <Badge variant={
                flowData.completedSteps === flowData.totalSteps && (flowData.errors?.length || 0) === 0
                  ? "default" 
                  : "destructive"
              } className="text-sm">
                {flowData.completedSteps === flowData.totalSteps && (flowData.errors?.length || 0) === 0
                  ? "Concluído" 
                  : "Com Erros"}
              </Badge>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Ordem Base</div>
              <div className="font-semibold">{flowData.steps?.order?.id || flowData.orderId || 'N/A'}</div>
            </Card>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <FlowTimeline 
            flowData={{
              ...flowData,
              testType: flowData.testType
            }}
            onViewOrderComparison={
              (comparisonData || flowData?.raw_comparison_data) 
                ? handleViewOrderComparison 
                : undefined
            }
            onViewNFeComparison={
              (nfeComparisons && nfeComparisons.length > 0)
                ? handleViewNFeComparison
                : undefined
            }
          />
        </div>
      </div>
    );
  }


  if (!comparisonData) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Carregando dados de comparação...</p>
      </div>
    );
  }

  // Single-order comparison mode
  // ✅ VALIDAÇÃO: Verificar estrutura completa antes de usar
  if (
    !comparisonData.differences ||
    !Array.isArray(comparisonData.differences.header) ||
    !Array.isArray(comparisonData.differences.items) ||
    !comparisonData.summary ||
    !comparisonData.orderId ||
    !comparisonData.newOrderId
  ) {
    console.error('❌ Estrutura inválida em single-order mode:', comparisonData);
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Dados Incompletos</h2>
          <p className="text-muted-foreground mb-4">
            A estrutura de dados de comparação está incompleta ou corrompida.
          </p>
          <div className="space-y-2">
            <Button onClick={onBackToChat} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Chat
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              Recarregar Página
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const { differences, summary, orderId, newOrderId } = comparisonData;

  // Filter header fields for display (exclude certain fields from view)
  const displayHeaderFields = differences.header.filter(
    (h: any) => !['SalesOrder', 'PurchaseOrderByCustomer', 'SalesOrderType'].includes(h.field)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-background p-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToChat}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h2 className="text-lg font-semibold">Comparação de Ordens</h2>
          
          {/* Botão Exportar PDF */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
          >
            <FileDown className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
            {isExporting ? 'Exportando...' : 'Exportar PDF'}
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground mb-1">Total de Diferenças</div>
            <div className="text-2xl font-bold">{summary.totalDifferences}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground mb-1">Seções Afetadas</div>
            <div className="text-2xl font-bold">{summary.sectionsWithDifferences.join(', ') || 'Nenhuma'}</div>
          </Card>
        </div>

        {/* Order Info */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Ordem Original</div>
            <div className="font-semibold">{orderId}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Ordem Criada</div>
            <div className="font-semibold">{newOrderId}</div>
          </Card>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Banner de Sucesso - Mostrar apenas quando não houver diferenças */}
        {summary.totalDifferences === 0 && (
          <Card className="p-4 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="text-green-600 dark:text-green-400 text-2xl">✓</div>
              <div>
                <div className="text-green-800 dark:text-green-200 font-semibold">Comparação Perfeita</div>
                <p className="text-green-700 dark:text-green-300 text-sm">
                  Todas as informações foram replicadas com sucesso. Nenhuma diferença encontrada.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Header Fields - SEMPRE MOSTRAR */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Campos do Cabeçalho</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Campo</th>
                  <th className="text-left p-2">Valor Original</th>
                  <th className="text-left p-2">Valor Criado</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayHeaderFields.map((field: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2 font-medium">{field.field}</td>
                    <td className="p-2">{field.originalValue || '-'}</td>
                    <td className="p-2">{field.newValue || '-'}</td>
                    <td className="p-2 text-center">
                      <Badge variant={field.isIdentical ? "default" : "destructive"}>
                        {field.isIdentical ? "Igual" : "Diferente"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Items - SEMPRE MOSTRAR */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Itens da Ordem</h3>
          <Accordion type="single" collapsible className="w-full">
            {differences.items.map((item: any, itemIdx: number) => (
              <AccordionItem key={itemIdx} value={`item-${itemIdx}`}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>Item {item.itemNumber}</span>
                    {item.fields.some((f: any) => !f.isIdentical) && (
                      <Badge variant="destructive" className="text-xs">
                        {item.fields.filter((f: any) => !f.isIdentical).length} diferença(s)
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* Item Fields */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold mb-2">Campos do Item</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Campo</th>
                            <th className="text-left p-2">Original</th>
                            <th className="text-left p-2">Criado</th>
                            <th className="text-center p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.fields.map((field: any, fieldIdx: number) => (
                            <tr key={fieldIdx} className="border-b">
                              <td className="p-2 font-medium">{field.field}</td>
                              <td className="p-2">{field.originalValue || '-'}</td>
                              <td className="p-2">{field.newValue || '-'}</td>
                              <td className="p-2 text-center">
                                <Badge variant={field.isIdentical ? "default" : "destructive"} className="text-xs">
                                  {field.isIdentical ? "Igual" : "Diferente"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Item Taxes */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Impostos do Item</h4>
                    {item.taxes && (
                      <TaxComparisonTable taxes={item.taxes} />
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>
    </div>
  );
};
