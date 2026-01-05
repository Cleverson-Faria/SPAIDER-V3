import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, RefreshCw, Search, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Copy, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SapLog {
  id: string;
  user_id: string;
  organization_id: string;
  test_execution_id: string | null;
  operation: string;
  http_method: string;
  endpoint: string;
  request_headers: any;
  request_payload: any;
  response_payload: any;
  response_status: number;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

interface LogStats {
  total: number;
  errors: number;
  success: number;
  errorRate: string;
  errorsByOperation: Array<{ operation: string; count: number }>;
}

export default function SapLogs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = useState<SapLog[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SapLog | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  
  // Filtros
  const [filters, setFilters] = useState({
    success: 'all',
    operation: 'all',
    startDate: '',
    endDate: '',
  });
  
  // Paginação
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (!authLoading && (isAdmin || isSuperAdmin)) {
      fetchLogs();
      fetchStats();
    }
  }, [authLoading, isAdmin, isSuperAdmin, pagination.page, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.success !== 'all') {
        params.append('success', filters.success);
      }
      if (filters.operation !== 'all') {
        params.append('operation', filters.operation);
      }
      if (filters.startDate) {
        params.append('startDate', filters.startDate);
      }
      if (filters.endDate) {
        params.append('endDate', filters.endDate);
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/admin/sap-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar logs');
      }

      const data = await response.json();
      setLogs(data.logs);
      setPagination(prev => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }));
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/admin/sap-logs/stats`, {
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
    }
  };

  const handleViewDetails = (log: SapLog) => {
    setSelectedLog(log);
    setShowDetailDialog(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Conteúdo copiado para a área de transferência.",
    });
  };

  const formatJson = (json: any) => {
    try {
      return JSON.stringify(json, null, 2);
    } catch {
      return String(json);
    }
  };

  const getOperationLabel = (operation: string) => {
    const labels: Record<string, string> = {
      'createSalesOrder': 'Criar Ordem de Venda',
      'fetchSalesOrder': 'Consultar Ordem',
      'createOutboundDelivery': 'Criar Remessa',
      'pickAllItems': 'Picking',
      'executePostGoodsIssue': 'PGI',
      'createBillingDocument': 'Faturamento',
      'fetchFiscalNote': 'Consultar NF-e',
    };
    return labels[operation] || operation;
  };

  // Verificar acesso
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Acesso Negado</h1>
        <p className="text-muted-foreground mb-4">
          Você não tem permissão para acessar esta página.
        </p>
        <Button onClick={() => navigate("/")}>Voltar ao Início</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Logs de Requisições SAP</h1>
          <p className="text-muted-foreground">
            Visualize e analise todas as requisições feitas ao SAP
          </p>
        </div>
        <div className="ml-auto">
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Requisições</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sucessos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.success}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Erros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Erro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.errorRate}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select
                value={filters.success}
                onValueChange={(value) => {
                  setFilters(prev => ({ ...prev, success: value }));
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Sucesso</SelectItem>
                  <SelectItem value="false">Erro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Operação</label>
              <Select
                value={filters.operation}
                onValueChange={(value) => {
                  setFilters(prev => ({ ...prev, operation: value }));
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="createSalesOrder">Criar Ordem</SelectItem>
                  <SelectItem value="fetchSalesOrder">Consultar Ordem</SelectItem>
                  <SelectItem value="createOutboundDelivery">Criar Remessa</SelectItem>
                  <SelectItem value="pickAllItems">Picking</SelectItem>
                  <SelectItem value="executePostGoodsIssue">PGI</SelectItem>
                  <SelectItem value="createBillingDocument">Faturamento</SelectItem>
                  <SelectItem value="fetchFiscalNote">Consultar NF-e</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data Início</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, startDate: e.target.value }));
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data Fim</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, endDate: e.target.value }));
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Requisições</CardTitle>
          <CardDescription>
            Mostrando {logs.length} de {pagination.total} registros
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum log encontrado
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Operação</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="max-w-[300px]">Endpoint</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className={!log.success ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                      <TableCell>
                        {log.success ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Erro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getOperationLabel(log.operation)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.http_method}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate font-mono text-xs">
                        {log.endpoint.replace(/https?:\/\/[^/]+/, '')}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={log.response_status >= 200 && log.response_status < 300 ? "default" : "destructive"}
                        >
                          {log.response_status || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.duration_ms}ms</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginação */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Página {pagination.page} de {pagination.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Detalhes da Requisição
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.operation} - {new Date(selectedLog?.created_at || '').toLocaleString('pt-BR')}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <Tabs defaultValue="request" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
                <TabsTrigger value="error">Erro</TabsTrigger>
              </TabsList>

              <TabsContent value="request" className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-medium">Endpoint</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(selectedLog.endpoint)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">
                    {selectedLog.http_method} {selectedLog.endpoint}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-medium">Request Payload (JSON Enviado)</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(formatJson(selectedLog.request_payload))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <ScrollArea className="h-[300px] w-full rounded-md border">
                    <pre className="p-4 text-sm font-mono bg-slate-950 text-slate-50 rounded-md">
                      {formatJson(selectedLog.request_payload)}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="response" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-medium">HTTP Status</label>
                    <div className="mt-1">
                      <Badge 
                        variant={selectedLog.response_status >= 200 && selectedLog.response_status < 300 ? "default" : "destructive"}
                        className="text-lg px-3 py-1"
                      >
                        {selectedLog.response_status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="font-medium">Duração</label>
                    <div className="mt-1 text-lg">{selectedLog.duration_ms}ms</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-medium">Response Payload (Resposta do SAP)</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(formatJson(selectedLog.response_payload))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <ScrollArea className="h-[300px] w-full rounded-md border">
                    <pre className="p-4 text-sm font-mono bg-slate-950 text-slate-50 rounded-md">
                      {formatJson(selectedLog.response_payload)}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="error" className="space-y-4">
                {selectedLog.error_code || selectedLog.error_message ? (
                  <>
                    <div>
                      <label className="font-medium">Código do Erro</label>
                      <div className="mt-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 rounded-md font-mono">
                        {selectedLog.error_code || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="font-medium">Mensagem de Erro</label>
                      <div className="mt-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 rounded-md">
                        {selectedLog.error_message || 'N/A'}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
                    <p>Nenhum erro registrado para esta requisição.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

