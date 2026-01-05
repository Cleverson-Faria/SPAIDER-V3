import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download, Search, Filter, X, Calendar as CalendarIcon, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { exportComparisonToPDF } from "@/lib/pdfExporter";

interface TestExecution {
  id: string;
  run_id: string;
  execution_type: 'single-order' | 'full-flow';
  sap_module: string;
  document_type: string;
  original_document_id: string;
  new_document_id: string;
  total_differences: number;
  sections_with_differences: string[];
  test_status: string;
  raw_comparison_data: any;
  created_at: string;
  completed_steps?: number;
  total_steps?: number;
  failed_steps?: number;
  errors?: string[];
  // Campos de dados de cada etapa (full-flow)
  order_data?: any;
  delivery_data?: any;
  billing_data?: any;
  nfe_data?: any;
  order_status?: string;
  delivery_status?: string;
  picking_status?: string;
  pgi_status?: string;
  billing_status?: string;
  nfe_status?: string;
  delivery_id?: string;
  billing_id?: string;
  nfe_number?: string;
  reference_order?: {
    order_number: string;
    characteristic_1?: { name: string; code: string };
    characteristic_2?: { name: string; code: string };
    characteristic_3?: { name: string; code: string };
  };
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

const TestHistory = () => {
  const { user, profile, organization } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tests, setTests] = useState<TestExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Filtros
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Inicializar com data corrente para melhor performance
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [dateTo, setDateTo] = useState<Date | undefined>(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  });

  useEffect(() => {
    if (user) {
      loadTests(dateFrom, dateTo);
    }
  }, [user, dateFrom, dateTo]);

  // Polling automático para testes em andamento
  useEffect(() => {
    // Verificar se há testes em processamento ou parciais
    const hasProcessingTests = tests.some(
      test => test.test_status === 'processing' || 
              test.test_status === 'partial' ||
              test.nfe_status === 'processing' ||
              test.order_status === 'processing' ||
              test.delivery_status === 'processing' ||
              test.billing_status === 'processing'
    );

    if (hasProcessingTests && !pollingActive) {
      console.log('🔄 [TestHistory] Starting polling for processing tests');
      setPollingActive(true);
      
      // Polling a cada 5 segundos
      pollingIntervalRef.current = setInterval(() => {
        console.log('🔄 [TestHistory] Polling for updates...');
        loadTests(dateFrom, dateTo);
      }, 5000);
    } else if (!hasProcessingTests && pollingActive) {
      console.log('✅ [TestHistory] All tests completed, stopping polling');
      setPollingActive(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    // Cleanup
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [tests, pollingActive, dateFrom, dateTo]);

  // Destacar e abrir automaticamente teste recém-criado
  useEffect(() => {
    const state = location.state as any;
    if (state?.highlightRun && tests.length > 0) {
      // Esperar o DOM carregar
      setTimeout(() => {
        const element = document.getElementById(`test-${state.highlightRun}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-primary', 'animate-pulse');
          
          // Remover animação após 3 segundos
          setTimeout(() => {
            element.classList.remove('animate-pulse');
          }, 3000);
          
          // Auto-abrir detalhes se solicitado
          if (state.autoOpenDetails) {
            setTimeout(() => {
              const test = tests.find(t => t.run_id === state.highlightRun);
              if (test) {
                handleViewTest(test);
              }
            }, 1000);
          }
        }
        
        // Limpar state
        navigate(location.pathname, { replace: true, state: {} });
      }, 500);
    }
  }, [location.state, tests]);

  const loadTests = async (fromDate?: Date, toDate?: Date) => {
    try {
      setLoading(true);
      
      // Query base
      const whereClause: Record<string, any> = {};
      
      // Aplicar filtro de data para otimizar performance
      // TODO: Implementar filtros de data no backend
      
      const testsData = await api.query("test_flow_executions", {
        orderBy: "created_at.desc"
      });

      // Buscar order numbers únicos
      const orderNumbers = testsData?.map((t: any) => t.original_order_id || t.order_id) || [];
      
      // Buscar reference orders
      const refOrdersData = await api.query("reference_orders", {});
      
      // Buscar características para cada reference order
      const refOrdersWithChars = await Promise.all(
        (refOrdersData || []).map(async (ro: any) => {
          const [char1, char2, char3] = await Promise.all([
            ro.characteristic_1_id ? api.get("characteristic_level_1", ro.characteristic_1_id).catch(() => null) : null,
            ro.characteristic_2_id ? api.get("characteristic_level_2", ro.characteristic_2_id).catch(() => null) : null,
            ro.characteristic_3_id ? api.get("characteristic_level_3", ro.characteristic_3_id).catch(() => null) : null,
          ]);
          return {
            order_number: ro.order_number,
            characteristic_1: char1,
            characteristic_2: char2,
            characteristic_3: char3,
          };
        })
      );

      // Criar mapa de reference orders
      const refOrdersMap = new Map(
        (refOrdersWithChars || []).map((ro: any) => [ro.order_number, ro])
      );

      // Transformar dados para exibição
      const enrichedTests: TestExecution[] = (testsData || []).map(test => ({
        id: test.id,
        run_id: test.run_id,
        test_id: test.test_id,
        
        // Tipo do teste
        execution_type: test.test_type === 'sales_order' ? 'single-order' : 'full-flow',
        sap_module: 'SD',
        document_type: test.test_type,
        
        // Status
        test_status: test.global_status,
        
        // Dados da ordem
        original_document_id: test.original_order_id,
        new_document_id: test.order_id,
        total_differences: test.total_differences || 0,
        sections_with_differences: test.sections_with_differences || [],
        raw_comparison_data: test.raw_comparison_data,
        
        // Dados do fluxo (se aplicável)
        completed_steps: test.completed_steps,
        total_steps: test.total_steps,
        failed_steps: test.failed_steps || 0,
        errors: Array.isArray(test.errors) ? test.errors as string[] : [],
        
        // Status de cada caixinha
        order_status: test.order_status,
        delivery_status: test.delivery_status,
        picking_status: test.picking_status,
        pgi_status: test.pgi_status,
        billing_status: test.billing_status,
        nfe_status: test.nfe_status,
        
        // Dados de cada caixinha
        order_data: test.order_data,
        delivery_id: test.delivery_id,
        delivery_data: test.delivery_data,
        billing_id: test.billing_id,
        billing_data: test.billing_data,
        nfe_number: test.nfe_number,
        nfe_data: test.nfe_data,
        
        // Flags de caixinhas ativas
        order_enabled: test.order_enabled,
        delivery_enabled: test.delivery_enabled,
        billing_enabled: test.billing_enabled,
        nfe_enabled: test.nfe_enabled,
        
        created_at: test.created_at,
        updated_at: test.updated_at,
        
        reference_order: refOrdersMap.get(test.original_order_id || test.order_id)
      }));

      setTests(enrichedTests);
    } catch (error) {
      console.error("Error loading tests:", error);
      toast.error("Erro ao carregar histórico de testes");
    } finally {
      setLoading(false);
    }
  };

  const handleViewTest = (test: TestExecution) => {
    if (test.execution_type === 'full-flow') {
      // Construir objeto steps completo com todas as 6 etapas
      const steps = {
        order: {
          id: test.new_document_id,
          status: test.order_status || 'pending',
          data: test.order_data || null
        },
        delivery: {
          id: test.delivery_id || null,
          status: test.delivery_status || 'pending',
          data: test.delivery_data || null
        },
        picking: {
          id: null,
          status: test.picking_status || 'pending',
          data: null
        },
        pgi: {
          id: null,
          status: test.pgi_status || 'pending',
          data: null
        },
        billing: {
          id: test.billing_id || null,
          status: test.billing_status || 'pending',
          data: test.billing_data || null
        },
        nfe: {
          id: test.nfe_number || null,
          status: test.nfe_status || 'pending',
          data: test.nfe_data || null
        }
      };

      const flowData = {
        runId: test.run_id,
        orderId: test.original_document_id,
        completedSteps: test.completed_steps || 0,
        totalSteps: test.total_steps || 6,
        errors: test.errors || [],
        success: test.test_status === 'completed',
        steps: steps,
        testType: test.document_type,
        raw_comparison_data: test.raw_comparison_data,
      };

      localStorage.setItem(
        `flow_${test.run_id}`,
        JSON.stringify({ flow_result: flowData, timestamp: test.created_at })
      );

      navigate("/", {
        state: {
          view: "comparator",
          runId: test.run_id,
          mode: 'full-flow'
        }
      });
    } else {
      // Para single-order, manter lógica original
      const comparisonData = {
        comparison: test.raw_comparison_data,
        original_order: {
          id: test.original_document_id,
        },
        new_order: {
          id: test.new_document_id,
        },
      };

      localStorage.setItem(
        `comparison_${test.run_id}`,
        JSON.stringify(comparisonData)
      );

      navigate("/", {
        state: {
          view: "comparator",
          runId: test.run_id
        }
      });
    }
  };

  const handleExportPDF = async (test: TestExecution) => {
    try {
      setExporting(test.id);
      toast.info("Gerando PDF...");

      // Extract order information from test data
      const originalOrderInfo = test.raw_comparison_data?.original_order 
        ? extractOrderSummary(test.raw_comparison_data.original_order)
        : {};
      
      const newOrderInfo = test.order_data 
        ? extractOrderSummary(test.order_data)
        : {};

      const comparisonData = {
        comparison: test.raw_comparison_data,
        original_order: {
          id: test.original_document_id,
          ...originalOrderInfo
        },
        new_order: {
          id: test.new_document_id,
          ...newOrderInfo
        },
      };

      // Buscar logo do domínio SAP e logo do Spaider
      let domainLogo: string | undefined;
      let spaiderLogo: string | undefined;

      // 🆕 Buscar logo do domínio SAP usado no teste
      try {
        const testExecData = await api.get('test_flow_executions', test.id);

        if (testExecData?.sap_domain) {
          console.log('🔍 [PDF] Buscando logo do domínio:', testExecData.sap_domain);
          
          const credData = await api.query('sap_domain_credentials', {
            where: { domain: testExecData.sap_domain, is_active: true },
            single: true
          });
          
          const cred = Array.isArray(credData) ? credData[0] : credData;
          if (cred?.logo_url) {
            console.log('✅ [PDF] Logo do domínio encontrada:', cred.logo_url);
            domainLogo = cred.logo_url;
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
      if (organization?.id) {
        try {
          const orgData = await api.get('organizations', organization.id);
          
          if (orgData?.spaider_logo_url) {
            spaiderLogo = orgData.spaider_logo_url;
          }
        } catch (error) {
          console.warn('⚠️ [PDF] Erro ao buscar logo do Spaider:', error);
        }
      }

      // Preparar dados do fluxo se for full-flow
      const isFullFlow = test.execution_type === 'full-flow';
      const flowData = isFullFlow ? {
        delivery_status: test.delivery_status,
        delivery_id: test.delivery_id,
        delivery_data: test.delivery_data,
        picking_status: test.picking_status,
        pgi_status: test.pgi_status,
        billing_status: test.billing_status,
        billing_id: test.billing_id,
        billing_data: test.billing_data,
        nfe_status: test.nfe_status,
        nfe_number: test.nfe_number,
        nfe_data: test.nfe_data,
        completed_steps: test.completed_steps,
        total_steps: test.total_steps,
        test_status: test.test_status,
        errors: test.errors || []
      } : undefined;

      await exportComparisonToPDF(
        comparisonData,
        test.run_id,
        profile?.email || "user@example.com",
        organization?.name || "Organização",
        organization?.logo_url,
        domainLogo,
        spaiderLogo,
        isFullFlow,
        flowData,
        test.reference_order
      );

      toast.success("PDF gerado com sucesso!");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Erro ao gerar PDF");
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    // Limpar filtros mas manter data corrente para performance
    setModuleFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setSearchTerm("");
  };

  const viewAllHistory = () => {
    // Remover filtro de data para ver histórico completo
    setDateFrom(undefined);
    setDateTo(undefined);
    setModuleFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setSearchTerm("");
  };

  const hasActiveFilters = 
    moduleFilter !== "all" || 
    typeFilter !== "all" || 
    statusFilter !== "all" || 
    dateFrom !== undefined || 
    dateTo !== undefined ||
    searchTerm !== "";

  // Helper para busca segura em campos opcionais
  const safeIncludes = (value: string | null | undefined, search: string): boolean => {
    return value?.toLowerCase().includes(search.toLowerCase()) || false;
  };

  const filteredTests = tests.filter((test) => {
    // Busca por texto (expandida para todos os campos)
    const matchesSearch =
      searchTerm === "" ||
      safeIncludes(test.run_id, searchTerm) ||
      safeIncludes(test.original_document_id, searchTerm) ||
      safeIncludes(test.new_document_id, searchTerm) ||
      safeIncludes(test.sap_module, searchTerm) ||
      safeIncludes(test.document_type, searchTerm) ||
      safeIncludes(test.test_status, searchTerm) ||
      safeIncludes(test.reference_order?.characteristic_1?.name, searchTerm) ||
      safeIncludes(test.reference_order?.characteristic_1?.code, searchTerm) ||
      safeIncludes(test.reference_order?.characteristic_2?.name, searchTerm) ||
      safeIncludes(test.reference_order?.characteristic_2?.code, searchTerm) ||
      safeIncludes(test.reference_order?.characteristic_3?.name, searchTerm) ||
      safeIncludes(test.reference_order?.characteristic_3?.code, searchTerm);

    // Filtro por módulo
    const matchesModule = moduleFilter === "all" || test.sap_module === moduleFilter;

    // Filtro por tipo
    const matchesType = typeFilter === "all" || test.document_type === typeFilter;

    // Filtro por status
    const matchesStatus = statusFilter === "all" || test.test_status === statusFilter;

    // Filtro por data
    const testDate = new Date(test.created_at);
    const matchesDateFrom = !dateFrom || testDate >= dateFrom;
    const matchesDateTo = !dateTo || testDate <= new Date(dateTo.setHours(23, 59, 59, 999));

    return (
      matchesSearch &&
      matchesModule &&
      matchesType &&
      matchesStatus &&
      matchesDateFrom &&
      matchesDateTo
    );
  });

  // Extrair valores únicos para os filtros
  const uniqueModules = Array.from(new Set(tests.map((t) => t.sap_module)));
  const uniqueTypes = Array.from(new Set(tests.map((t) => t.document_type)));
  const uniqueStatuses = Array.from(new Set(tests.map((t) => t.test_status)));

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Histórico de Testes
                </h1>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Consulte seus testes anteriores e gere evidências
                  </p>
                  {dateFrom && dateTo && (
                    <Badge variant="secondary" className="text-xs">
                      📅 {format(dateFrom, "dd/MM/yyyy", { locale: ptBR })} até {format(dateTo, "dd/MM/yyyy", { locale: ptBR })}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar with Filter Toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, Ordem, Módulo, Tipo, Status ou Características..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="shrink-0"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {[
                    moduleFilter !== "all",
                    typeFilter !== "all",
                    statusFilter !== "all",
                    dateFrom !== undefined,
                    dateTo !== undefined,
                  ].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Filtros Avançados
                </h3>
                <div className="flex gap-2">
                  {(dateFrom || dateTo) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={viewAllHistory}
                      className="h-8"
                    >
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Ver Todo Histórico
                    </Button>
                  )}
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-8"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Limpar Filtros
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Módulo SAP */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Módulo SAP
                  </label>
                  <Select value={moduleFilter} onValueChange={setModuleFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueModules.map((module) => (
                        <SelectItem key={module} value={module}>
                          {module}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tipo de Documento */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Tipo de Documento
                  </label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Status
                  </label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Data De */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data De
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? (
                          format(dateFrom, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span className="text-muted-foreground">Selecionar</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Data Até */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data Até
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? (
                          format(dateTo, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span className="text-muted-foreground">Selecionar</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Results count */}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Mostrando <span className="font-semibold text-foreground">{filteredTests.length}</span> de{" "}
                  <span className="font-semibold text-foreground">{tests.length}</span> testes
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tests Table - Desktop */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhum teste encontrado
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Tente ajustar sua busca"
                : "Execute um teste para ver o histórico aqui"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Teste ID</TableHead>
                    <TableHead className="w-[80px]">Módulo</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead className="w-[90px]">Ordem Orig.</TableHead>
                    <TableHead className="w-[90px]">Nova Ordem</TableHead>
                    <TableHead className="w-[160px]">Características</TableHead>
                    <TableHead className="w-[80px] text-center">Progresso</TableHead>
                    <TableHead className="w-[80px] text-center">Diferenças</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[130px]">Data</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTests.map((test) => (
                    <TableRow key={test.id} className="stagger-item">
                      <TableCell className="font-mono text-xs py-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="truncate block max-w-[100px] text-left">
                              ...{test.run_id.slice(-10)}
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono text-xs">{test.run_id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-xs">{test.sap_module}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">
                        {test.execution_type === 'full-flow' 
                          ? 'Fluxo Completo'
                          : test.document_type.replace(/_/g, " ").substring(0, 12)
                        }
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2">
                        {test.original_document_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2">
                        {test.new_document_id || "-"}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col gap-1 max-w-[160px]">
                          {test.reference_order?.characteristic_1 && (
                            <Badge variant="outline" className="text-[10px] truncate">
                              {test.reference_order.characteristic_1.name}
                            </Badge>
                          )}
                          {test.reference_order?.characteristic_2 && (
                            <Badge variant="secondary" className="text-[10px] truncate">
                              {test.reference_order.characteristic_2.name}
                            </Badge>
                          )}
                          {test.reference_order?.characteristic_3 && (
                            <Badge variant="secondary" className="text-[10px] truncate">
                              {test.reference_order.characteristic_3.name}
                            </Badge>
                          )}
                          {!test.reference_order && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      {/* Coluna Progresso */}
                      <TableCell className="text-center py-2">
                        {test.execution_type === 'full-flow' ? (
                          <span className="text-xs text-muted-foreground">
                            {test.completed_steps}/{test.total_steps}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {test.test_status === 'completed' ? '1/1' : '0/1'}
                          </span>
                        )}
                      </TableCell>
                      
                      {/* Coluna Diferenças */}
                      <TableCell className="text-center py-2">
                        <Badge
                          variant={
                            test.total_differences === 0
                              ? "default"
                              : "destructive"
                          }
                          className="text-xs"
                        >
                          {test.total_differences}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={
                            test.test_status === "completed"
                              ? "default"
                              : test.test_status === "partial"
                              ? "secondary"
                              : "destructive"
                          }
                          className="text-xs"
                        >
                          {test.test_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">
                        {new Date(test.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <div className="flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewTest(test)}
                                  className="h-8 w-8"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Visualizar</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleExportPDF(test)}
                                  disabled={exporting === test.id}
                                  className="h-8 w-8"
                                >
                                  {exporting === test.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Exportar PDF</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile/Tablet Cards */}
            <div className="lg:hidden space-y-4">
              {filteredTests.map((test) => (
                <Card key={test.id} className="stagger-item">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">Teste ID</p>
                          <p className="font-mono text-xs truncate">{test.run_id}</p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">{test.sap_module}</Badge>
                      </div>

                      {/* Tipo */}
                      <div>
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        <p className="text-sm">
                          {test.execution_type === 'full-flow'
                            ? 'Fluxo Completo'
                            : test.document_type.replace(/_/g, " ")
                          }
                        </p>
                      </div>

                      {/* Características */}
                      {test.reference_order && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Características</p>
                          <div className="flex flex-wrap gap-1">
                            {test.reference_order.characteristic_1 && (
                              <Badge variant="outline" className="text-xs">
                                {test.reference_order.characteristic_1.name}
                              </Badge>
                            )}
                            {test.reference_order.characteristic_2 && (
                              <Badge variant="secondary" className="text-xs">
                                {test.reference_order.characteristic_2.name}
                              </Badge>
                            )}
                            {test.reference_order.characteristic_3 && (
                              <Badge variant="secondary" className="text-xs">
                                {test.reference_order.characteristic_3.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Ordens */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Ordem Original</p>
                          <p className="font-mono text-sm">{test.original_document_id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Nova Ordem</p>
                          <p className="font-mono text-sm">{test.new_document_id || "-"}</p>
                        </div>
                      </div>

                      {/* Status e Diferenças */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <Badge
                              variant={
                                test.test_status === "completed"
                                  ? "default"
                                  : test.test_status === "partial"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="text-xs mt-1"
                            >
                              {test.test_status}
                            </Badge>
                          </div>
                          {/* Progresso (para todos os tipos) */}
                          <div>
                            <p className="text-xs text-muted-foreground">Progresso</p>
                            <span className="text-xs text-muted-foreground mt-1 block">
                              {test.execution_type === 'full-flow' 
                                ? `${test.completed_steps}/${test.total_steps}`
                                : test.test_status === 'completed' ? '1/1' : '0/1'
                              }
                            </span>
                          </div>
                          
                          {/* Diferenças (para todos) */}
                          <div>
                            <p className="text-xs text-muted-foreground">Diferenças</p>
                            <Badge
                              variant={
                                test.total_differences === 0
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-xs mt-1"
                            >
                              {test.total_differences}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Data</p>
                          <p className="text-xs font-mono mt-1">
                            {formatDate(test.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewTest(test)}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Visualizar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportPDF(test)}
                          disabled={exporting === test.id}
                          className="flex-1"
                        >
                          {exporting === test.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          Exportar PDF
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TestHistory;
