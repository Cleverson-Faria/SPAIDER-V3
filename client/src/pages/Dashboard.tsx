import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, TrendingUp, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TestExecution {
  id: string;
  run_id: string;
  sap_module: string;
  document_type: string;
  total_differences: number;
  test_status: string;
  created_at: string;
  original_document_id?: string;
}

interface TestWithCharacteristics extends TestExecution {
  reference_order?: {
    characteristic_1?: { name: string; code: string };
    characteristic_2?: { name: string; code: string };
    characteristic_3?: { name: string; code: string };
  };
}

interface CharCombination {
  char1: string;
  char2: string;
  char3: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

interface FieldDifferenceItem {
  fieldName: string;
  displayName: string;
  type: 'field' | 'tax';
  total: number;
  success: number;
  withDifferences: number;
  successRate: number;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--muted))", "hsl(var(--accent))"];

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestExecution[]>([]);
  const [testsWithChars, setTestsWithChars] = useState<TestWithCharacteristics[]>([]);
  const [topItems, setTopItems] = useState<FieldDifferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState(30); // Período padrão: último mês
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      loadTests();
      startPollingForProcessingNFe();
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [user]);

  // 🔄 Polling para monitorar NFe em processamento
  const startPollingForProcessingNFe = () => {
    // Limpar polling anterior se existir
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll a cada 5 segundos
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const processingTests = await api.query('test_flow_executions', {
          where: { nfe_status: 'processing' }
        });

        if (processingTests && processingTests.length > 0) {
          console.log(`🔄 Polling: ${processingTests.length} test(s) with NFe processing`);
          
          // Verificar se algum mudou de status
          for (const test of processingTests) {
            const updatedTest = await api.get('test_flow_executions', test.id);

            if (updatedTest && updatedTest.nfe_status === 'completed') {
              console.log(`✅ NFe completed for test ${test.id}`);
              toast.success('NFe Processada!', {
                description: `NFe ${updatedTest.nfe_number} foi emitida com sucesso`
              });
              
              // Recarregar testes
              loadTests();
            } else if (updatedTest && updatedTest.nfe_status === 'failed') {
              console.log(`❌ NFe failed for test ${test.id}`);
              toast.error('NFe não disponível', {
                description: 'Não foi possível buscar a NFe após múltiplas tentativas'
              });
              
              // Recarregar testes
              loadTests();
            }
          }
        } else {
          // Se não há mais testes com NFe processing, parar polling
          if (pollingIntervalRef.current) {
            console.log('⏹️ No processing NFe found, stopping polling');
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('Error polling NFe status:', error);
      }
    }, 5000);
  };

  // Mapeia test_type para sap_module
  const getSapModuleFromTestType = (testType: string | null): string => {
    if (!testType) return "Desconhecido";
    
    const moduleMap: Record<string, string> = {
      'fluxo_completo': 'SD - Vendas (Fluxo Completo)',
      'sales_order': 'SD - Vendas',
      'delivery': 'SD - Remessa',
      'billing': 'SD - Faturamento',
      'fiscal_note': 'FI - Fiscal',
      'quotation': 'SD - Cotação',
    };
    
    return moduleMap[testType] || `SD - ${testType}`;
  };

  const loadTests = async () => {
    try {
      setLoading(true);
      
      // Buscar todos os testes da tabela test_flow_executions
      const testsData = await api.query("test_flow_executions", {
        orderBy: "created_at.desc"
      });
      
      // Mapear campos para formato esperado pelo Dashboard
      const mappedTests = testsData?.map(test => ({
        id: test.id,
        run_id: test.run_id,
        sap_module: getSapModuleFromTestType(test.test_type),
        document_type: test.test_type || 'unknown',
        total_differences: test.total_differences || 0,
        test_status: test.global_status || 'completed',
        created_at: test.created_at || new Date().toISOString(),
        original_document_id: test.original_order_id,
        new_document_id: test.order_id
      })) || [];
      
      setTests(mappedTests);

      // Buscar ordens de referência com características
      if (mappedTests.length > 0) {
        const orderNumbers = [...new Set(mappedTests
          .map(t => t.original_document_id)
          .filter(Boolean)
        )];

        if (orderNumbers.length > 0) {
          const ordersData = await api.query("reference_orders", {});
          
          // Buscar características para cada ordem
          const ordersWithChars = await Promise.all(
            (ordersData || []).map(async (order: any) => {
              const [char1, char2, char3] = await Promise.all([
                order.characteristic_1_id ? api.get("characteristic_level_1", order.characteristic_1_id).catch(() => null) : null,
                order.characteristic_2_id ? api.get("characteristic_level_2", order.characteristic_2_id).catch(() => null) : null,
                order.characteristic_3_id ? api.get("characteristic_level_3", order.characteristic_3_id).catch(() => null) : null,
              ]);
              return {
                order_number: order.order_number,
                characteristic_1: char1,
                characteristic_2: char2,
                characteristic_3: char3,
              };
            })
          );

          // Merge dos dados
          const merged = mappedTests.map(test => ({
            ...test,
            reference_order: ordersWithChars?.find((o: any) => o.order_number === test.original_document_id)
          }));

          setTestsWithChars(merged);
        } else {
          setTestsWithChars(mappedTests);
        }
      }
    } catch (error) {
      console.error("Error loading tests:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTopItemsWithDifferences = async (filteredTestIds: string[]) => {
    try {
      // Mapeamento de nomes técnicos para nomes amigáveis
      const fieldDisplayNames: Record<string, string> = {
        // Campos
        'NetAmount': 'Valor Líquido',
        'RequestedQuantity': 'Quantidade Solicitada',
        'ProfitCenter': 'Centro de Lucro',
        'ShippingPoint': 'Ponto de Expedição',
        'ProductionPlant': 'Centro',
        'Material': 'Material',
        'ProductTaxClassification1': 'NCM',
        'ItemGrossWeight': 'Peso Bruto',
        'ItemNetWeight': 'Peso Líquido',
        'SalesOrderItemText': 'Texto do Item',
        'MaterialGroup': 'Grupo de Material',
        'Plant': 'Centro',
        'StorageLocation': 'Depósito',
        // Impostos
        'CBS': 'CBS',
        'IBS': 'IBS',
        'ICMS': 'ICMS',
        'PIS': 'PIS',
        'COFINS': 'COFINS',
        'ICMS_ST': 'ICMS ST'
      };

      // Buscar comparações de campos
      // TODO: Implementar filtro 'in' no backend
      const allItemComparisons = await api.query('test_item_comparisons', {});
      const itemComparisons = (allItemComparisons || []).filter((item: any) => 
        filteredTestIds.includes(item.test_execution_id)
      );

      // Buscar comparações de impostos
      const allTaxComparisons = await api.query('test_tax_comparisons', {});
      const taxComparisons = (allTaxComparisons || []).filter((tax: any) => 
        filteredTestIds.includes(tax.test_execution_id)
      );

      // Agregar por campo/imposto
      const fieldStats: Record<string, {
        type: 'field' | 'tax';
        testIds: Set<string>;
        testsWithDiff: Set<string>;
      }> = {};

      // Processar comparações de campos
      itemComparisons?.forEach(item => {
        if (!item.field_name) return;
        
        if (!fieldStats[item.field_name]) {
          fieldStats[item.field_name] = {
            type: 'field',
            testIds: new Set(),
            testsWithDiff: new Set()
          };
        }
        fieldStats[item.field_name].testIds.add(item.test_execution_id);
        if (!item.is_identical) {
          fieldStats[item.field_name].testsWithDiff.add(item.test_execution_id);
        }
      });

      // Processar comparações de impostos
      taxComparisons?.forEach(tax => {
        if (!tax.tax_type) return;
        
        if (!fieldStats[tax.tax_type]) {
          fieldStats[tax.tax_type] = {
            type: 'tax',
            testIds: new Set(),
            testsWithDiff: new Set()
          };
        }
        fieldStats[tax.tax_type].testIds.add(tax.test_execution_id);
        if (tax.has_differences) {
          fieldStats[tax.tax_type].testsWithDiff.add(tax.test_execution_id);
        }
      });

      // Transformar em array e calcular estatísticas
      const fieldsArray: FieldDifferenceItem[] = Object.entries(fieldStats)
        .map(([fieldName, stats]) => {
          const total = filteredTestIds.length;  // Total de testes do período
          const withDifferences = stats.testsWithDiff.size;
          const success = total - withDifferences;
          const successRate = total > 0 ? (success / total) * 100 : 0;

          return {
            fieldName,
            displayName: fieldDisplayNames[fieldName] || fieldName,
            type: stats.type,
            total,
            success,
            withDifferences,
            successRate
          };
        })
        .filter(item => item.withDifferences > 0)
        .sort((a, b) => b.withDifferences - a.withDifferences)
        .slice(0, 10);

      setTopItems(fieldsArray);
    } catch (error) {
      console.error("Error loading top items with differences:", error);
    }
  };

  // Filtrar testes baseado no período selecionado
  const periodStartDate = startOfDay(subDays(new Date(), periodDays - 1));
  const filteredTests = tests.filter((test) => {
    const testDate = new Date(test.created_at);
    return testDate >= periodStartDate;
  });

  // Carregar Top 10 quando os testes filtrados mudarem
  useEffect(() => {
    if (filteredTests.length > 0) {
      const filteredTestIds = filteredTests.map(t => t.id);
      loadTopItemsWithDifferences(filteredTestIds);
    } else {
      setTopItems([]);
    }
  }, [filteredTests.length, periodDays]);

  // KPIs
  const totalTests = filteredTests.length;
  const successfulTests = filteredTests.filter((t) => t.total_differences === 0).length;
  const successRate = totalTests > 0 ? ((successfulTests / totalTests) * 100).toFixed(1) : "0";
  const failedTests = totalTests - successfulTests;

  // Quantidade por módulo
  const moduleStats = filteredTests.reduce((acc, test) => {
    const module = test.sap_module || "Desconhecido";
    if (!acc[module]) {
      acc[module] = { name: module, total: 0, success: 0, failed: 0 };
    }
    acc[module].total += 1;
    if (test.total_differences === 0) {
      acc[module].success += 1;
    } else {
      acc[module].failed += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; total: number; success: number; failed: number }>);

  const moduleData = Object.values(moduleStats);

  // Distribuição de status
  const statusStats = filteredTests.reduce((acc, test) => {
    const status = test.total_differences === 0 ? "Sucesso" : "Com Diferenças";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusData = Object.entries(statusStats).map(([name, value]) => ({
    name,
    value,
  }));

  // Tendência ao longo do tempo (baseado no período selecionado)
  const periodTrend = Array.from({ length: periodDays }, (_, i) => {
    const date = startOfDay(subDays(new Date(), periodDays - 1 - i));
    return {
      date: format(date, "dd/MM", { locale: ptBR }),
      fullDate: date,
      total: 0,
      success: 0,
      failed: 0,
    };
  });

  filteredTests.forEach((test) => {
    const testDate = startOfDay(new Date(test.created_at));
    const dayEntry = periodTrend.find(
      (day) => day.fullDate.getTime() === testDate.getTime()
    );
    if (dayEntry) {
      dayEntry.total += 1;
      if (test.total_differences === 0) {
        dayEntry.success += 1;
      } else {
        dayEntry.failed += 1;
      }
    }
  });

  // Tipo de documento
  const documentTypeStats = filteredTests.reduce((acc, test) => {
    const type = test.document_type || "Desconhecido";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const documentTypeData = Object.entries(documentTypeStats)
    .map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  // Filtrar testes com características baseado no período
  const filteredTestsWithChars = testsWithChars.filter((test) => {
    const testDate = new Date(test.created_at);
    return testDate >= periodStartDate;
  });

  // Agregação por Característica Nível 1
  const char1Stats = filteredTestsWithChars.reduce((acc, test) => {
    const char1Name = test.reference_order?.characteristic_1?.name || "Não classificado";
    if (!acc[char1Name]) {
      acc[char1Name] = { name: char1Name, total: 0, success: 0, failed: 0 };
    }
    acc[char1Name].total += 1;
    if (test.total_differences === 0) {
      acc[char1Name].success += 1;
    } else {
      acc[char1Name].failed += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; total: number; success: number; failed: number }>);

  const char1Data = Object.values(char1Stats).sort((a, b) => b.total - a.total);

  // Agregação por Característica Nível 2
  const char2Stats = filteredTestsWithChars.reduce((acc, test) => {
    const char2Name = test.reference_order?.characteristic_2?.name || "Não especificado";
    acc[char2Name] = (acc[char2Name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const char2Data = Object.entries(char2Stats)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Agregação por Característica Nível 3
  const char3Stats = filteredTestsWithChars.reduce((acc, test) => {
    const char3Name = test.reference_order?.characteristic_3?.name || "Não especificado";
    if (!acc[char3Name]) {
      acc[char3Name] = { name: char3Name, total: 0, success: 0, failed: 0 };
    }
    acc[char3Name].total += 1;
    if (test.total_differences === 0) {
      acc[char3Name].success += 1;
    } else {
      acc[char3Name].failed += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; total: number; success: number; failed: number }>);

  const char3Data = Object.values(char3Stats).sort((a, b) => b.total - a.total);

  // Top 10 combinações
  const combinationStats = filteredTestsWithChars.reduce((acc, test) => {
    const char1 = test.reference_order?.characteristic_1?.name || "N/A";
    const char2 = test.reference_order?.characteristic_2?.name || "N/A";
    const char3 = test.reference_order?.characteristic_3?.name || "N/A";
    const key = `${char1}|${char2}|${char3}`;
    
    if (!acc[key]) {
      acc[key] = { char1, char2, char3, total: 0, success: 0, failed: 0, successRate: 0 };
    }
    acc[key].total += 1;
    if (test.total_differences === 0) {
      acc[key].success += 1;
    } else {
      acc[key].failed += 1;
    }
    return acc;
  }, {} as Record<string, CharCombination>);

  const topCombinations = Object.values(combinationStats)
    .map(combo => ({
      ...combo,
      successRate: combo.total > 0 ? (combo.success / combo.total) * 100 : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-6 w-6" />
                  Dashboard de Estatísticas
                </h1>
                <p className="text-sm text-muted-foreground">
                  Visão geral dos testes e performance
                </p>
              </div>
            </div>
            
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Filtro de Período */}
        <div className="flex justify-center">
          <Tabs value={periodDays.toString()} onValueChange={(value) => setPeriodDays(Number(value))}>
            <TabsList>
              <TabsTrigger value="7">Última Semana</TabsTrigger>
              <TabsTrigger value="30">Último Mês</TabsTrigger>
              <TabsTrigger value="90">Últimos 3 Meses</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="stagger-item">
            <CardHeader className="pb-2">
              <CardDescription>Total de Testes</CardDescription>
              <CardTitle className="text-3xl">{totalTests}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Todos os testes executados
              </p>
            </CardContent>
          </Card>

          <Card className="stagger-item">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Testes com Sucesso
              </CardDescription>
              <CardTitle className="text-3xl text-primary">
                {successfulTests}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Sem diferenças encontradas
              </p>
            </CardContent>
          </Card>

          <Card className="stagger-item">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Com Diferenças
              </CardDescription>
              <CardTitle className="text-3xl text-destructive">
                {failedTests}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Necessitam revisão
              </p>
            </CardContent>
          </Card>

          <Card className="stagger-item">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Taxa de Sucesso
              </CardDescription>
              <CardTitle className="text-3xl">{successRate}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Comparações perfeitas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Módulos SAP */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
            <CardHeader>
              <CardTitle>Testes por Módulo SAP</CardTitle>
              <CardDescription>
                Distribuição de testes entre módulos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={moduleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" name="Sucesso" fill="hsl(var(--primary))" />
                  <Bar dataKey="failed" name="Com Diferenças" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
            <CardHeader>
              <CardTitle>Distribuição de Resultados</CardTitle>
              <CardDescription>
                Proporção entre testes com sucesso e diferenças
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="hsl(var(--primary))"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "Sucesso"
                            ? "hsl(var(--primary))"
                            : "hsl(var(--destructive))"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tendência ao longo do tempo */}
          <Card className="lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
            <CardHeader>
              <CardTitle>
                Tendência no Período ({periodDays === 7 ? 'Última Semana' : periodDays === 30 ? 'Último Mês' : 'Últimos 3 Meses'})
              </CardTitle>
              <CardDescription>
                Volume de testes executados ao longo do tempo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={periodTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
              <Line
                type="monotone"
                dataKey="success"
                name="Sucesso"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--success))" }}
              />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    name="Com Diferenças"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--destructive))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Document Types */}
        <Card className="animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
          <CardHeader>
            <CardTitle>Tipos de Documento Mais Testados</CardTitle>
            <CardDescription>
              Distribuição por tipo de documento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={documentTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  width={150}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Bar dataKey="value" name="Quantidade" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Características Section Header */}
        <div className="col-span-full">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Análise por Características
          </h2>
          <p className="text-sm text-muted-foreground">
            Distribuição dos testes pelos 3 níveis hierárquicos de características
          </p>
        </div>

        {/* Charts Row 3 - Características */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Característica Nível 1 */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
            <CardHeader>
              <CardTitle>Testes por Característica Nível 1</CardTitle>
              <CardDescription>
                Distribuição dos testes pelo primeiro nível hierárquico
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={char1Data} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" name="Sucesso" fill="hsl(var(--primary))" stackId="a" />
                  <Bar dataKey="failed" name="Com Diferenças" fill="hsl(var(--destructive))" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Característica Nível 2 */}
          <Card className="animate-fade-in-up" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
            <CardHeader>
              <CardTitle>Distribuição por Característica Nível 2</CardTitle>
              <CardDescription>
                Proporção de testes por segundo nível hierárquico
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={char2Data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="hsl(var(--primary))"
                    dataKey="value"
                  >
                    {char2Data.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Característica Nível 3 - Full Width */}
        <Card className="animate-fade-in-up" style={{ animationDelay: '0.8s', animationFillMode: 'both' }}>
          <CardHeader>
            <CardTitle>Testes por Característica Nível 3</CardTitle>
            <CardDescription>
              Distribuição detalhada pelo terceiro nível hierárquico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={char3Data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Legend />
                <Bar dataKey="success" name="Sucesso" fill="hsl(var(--primary))" stackId="a" />
                <Bar dataKey="failed" name="Com Diferenças" fill="hsl(var(--destructive))" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Combinações - Table */}
        <Card className="col-span-full animate-fade-in-up" style={{ animationDelay: '0.9s', animationFillMode: 'both' }}>
          <CardHeader>
            <CardTitle>Top 10 Combinações de Características Mais Testadas</CardTitle>
            <CardDescription>
              Combinações de características ordenadas por volume de testes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left text-sm font-semibold text-muted-foreground">
                      Nível 1
                    </th>
                    <th className="p-3 text-left text-sm font-semibold text-muted-foreground">
                      Nível 2
                    </th>
                    <th className="p-3 text-left text-sm font-semibold text-muted-foreground">
                      Nível 3
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Total Testes
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Sucesso
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Com Diferenças
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Taxa de Sucesso
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topCombinations.map((combo, index) => (
                    <tr 
                      key={index}
                      className={`border-b border-border hover:bg-accent/50 transition-colors duration-200 stagger-item ${
                        combo.successRate < 50 ? 'bg-destructive/10' : ''
                      }`}
                    >
                      <td className="p-3 text-sm">{combo.char1}</td>
                      <td className="p-3 text-sm">{combo.char2}</td>
                      <td className="p-3 text-sm">{combo.char3}</td>
                      <td className="p-3 text-center text-sm font-semibold">
                        {combo.total}
                      </td>
                      <td className="p-3 text-center text-sm text-primary">
                        {combo.success}
                      </td>
                      <td className="p-3 text-center text-sm text-destructive">
                        {combo.failed}
                      </td>
                      <td className="p-3 text-center text-sm">
                        <span className={`font-semibold ${
                          combo.successRate >= 80 ? 'text-primary' :
                          combo.successRate >= 50 ? 'text-yellow-500' :
                          'text-destructive'
                        }`}>
                          {combo.successRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top 10 Campos/Impostos com Diferenças */}
        <Card className="col-span-full animate-fade-in-up" style={{ animationDelay: '1s', animationFillMode: 'both' }}>
          <CardHeader>
            <CardTitle>Top 10 Campos/Impostos com Diferenças</CardTitle>
            <CardDescription>
              Campos e impostos ordenados por volume de diferenças encontradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left text-sm font-semibold text-muted-foreground">
                      Campo/Imposto
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Total Testes
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Sucesso
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Com Diferenças
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-muted-foreground">
                      Taxa de Sucesso
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                        Nenhum campo/imposto com diferenças no período selecionado
                      </td>
                    </tr>
                  ) : (
                    topItems.map((item, index) => (
                      <tr 
                        key={index}
                        className={`border-b border-border hover:bg-accent/50 transition-colors duration-200 stagger-item ${
                          item.successRate < 50 ? 'bg-destructive/10' : ''
                        }`}
                      >
                        <td className="p-3 text-sm font-medium">{item.displayName}</td>
                        <td className="p-3 text-center text-sm font-semibold">
                          {item.total}
                        </td>
                        <td className="p-3 text-center text-sm text-primary">
                          {item.success}
                        </td>
                        <td className="p-3 text-center text-sm text-destructive font-semibold">
                          {item.withDifferences}
                        </td>
                        <td className="p-3 text-center text-sm">
                          <span className={`font-semibold ${
                            item.successRate >= 80 ? 'text-primary' :
                            item.successRate >= 50 ? 'text-yellow-500' :
                            'text-destructive'
                          }`}>
                            {item.successRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
