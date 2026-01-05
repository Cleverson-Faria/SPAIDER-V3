import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Circle, Eye } from "lucide-react";
import { calculateDifferences, getDifferencesBadgeVariant } from "@/lib/comparisonUtils";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { NFeRetryProgress } from "@/components/NFeRetryProgress";


interface FlowStep {
  id: string;
  status: string;
  data: any;
  retryAttempt?: number;
  maxRetries?: number;
  nextDelaySeconds?: number;
}

interface FlowTimelineProps {
  flowData: {
    steps: {
      order: FlowStep;
      delivery: FlowStep;
      picking: FlowStep;
      pgi: FlowStep;
      billing: FlowStep;
      nfe: FlowStep;
    };
    completedSteps: number;
    totalSteps: number;
    errors: string[];
    raw_comparison_data?: any;
    testType?: string;
    nfe_differences?: number; // 🆕 Número de diferenças da NF-e
  };
  onViewOrderComparison?: () => void;
  onViewNFeComparison?: () => void; // 🆕 Callback para visualizar comparação de NF-e
}

export const FlowTimeline = ({ flowData, onViewOrderComparison, onViewNFeComparison }: FlowTimelineProps) => {
  const { isSuperAdmin } = useAuth();
  
  // ✅ Validação defensiva
  if (!flowData) {
    return (
      <Card className="p-4">
        <p className="text-muted-foreground">Nenhum dado de fluxo disponível.</p>
      </Card>
    );
  }
  
  const getTooltipMessage = (stepKey: string) => {
    if (stepKey === 'order') {
      return "Ver comparação detalhada da ordem";
    }
    const stepLabels: Record<string, string> = {
      delivery: 'Remessa',
      picking: 'Picking',
      pgi: 'PGI',
      billing: 'Faturamento',
      nfe: 'NFe'
    };
    return `Comparação de ${stepLabels[stepKey] || stepKey} ainda não disponível`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-6 w-6 text-green-600" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-destructive" />;
      case 'processing':
        return <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />;
      default:
        return <Circle className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Concluído</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processando</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  // Calculate differences for the order step - use backend calculated value
  console.log('🎯 [DEBUG] FlowTimeline recebeu:', {
    hasRawComparisonData: !!flowData.raw_comparison_data,
    hasSummary: !!flowData.raw_comparison_data?.summary,
    totalDifferences: flowData.raw_comparison_data?.summary?.totalDifferences,
    valorFinal: flowData.raw_comparison_data?.summary?.totalDifferences || 0
  });
  
  const orderDifferences = flowData.raw_comparison_data?.summary?.totalDifferences || 0;

  const steps = [
    { 
      key: 'order', 
      label: 'Ordem de Vendas', 
      data: flowData.steps?.order || { status: 'pending', id: null, data: null },
      differences: orderDifferences,
      enabled: true // Sempre mostrar ordem de vendas
    },
    { 
      key: 'delivery', 
      label: 'Remessa', 
      data: flowData.steps?.delivery || { status: 'pending', id: null, data: null },
      differences: 0, // TODO: Will be calculated when delivery comparison is implemented
      enabled: flowData.testType !== 'sales_order' // Ocultar para test only
    },
    { 
      key: 'picking', 
      label: 'Picking', 
      data: flowData.steps?.picking || { status: 'pending', id: null, data: null },
      differences: 0, // No comparison for picking
      enabled: flowData.testType !== 'sales_order'
    },
    { 
      key: 'pgi', 
      label: 'PGI (Saída de Mercadorias)', 
      data: flowData.steps?.pgi || { status: 'pending', id: null, data: null },
      differences: 0, // No comparison for PGI
      enabled: flowData.testType !== 'sales_order'
    },
    { 
      key: 'billing', 
      label: 'Faturamento', 
      data: flowData.steps?.billing || { status: 'pending', id: null, data: null },
      differences: 0, // TODO: Will be calculated when billing comparison is implemented
      enabled: flowData.testType !== 'sales_order'
    },
    { 
      key: 'nfe', 
      label: 'Nota Fiscal Eletrônica', 
      data: flowData.steps?.nfe || { status: 'pending', id: null, data: null },
      differences: flowData.nfe_differences || 0, // 🆕 Buscar do flowData
      enabled: flowData.testType !== 'sales_order'
    },
  ].filter(step => step.enabled);

  return (
    <div className="space-y-4">
      {/* Progress Summary */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Progresso do Fluxo</h3>
              <span className="text-sm text-muted-foreground">
                {flowData.completedSteps ?? 0} de {flowData.totalSteps ?? 1} etapas
              </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-500"
            style={{ width: `${((flowData.completedSteps ?? 0) / (flowData.totalSteps ?? 1)) * 100}%` }}
          />
        </div>
        {(flowData.errors?.length ?? 0) > 0 && (
          <div className="mt-3 p-2 bg-destructive/10 rounded text-sm text-destructive">
            <strong>Erros encontrados:</strong>
            <ul className="list-disc list-inside mt-1">
              {flowData.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Timeline Steps */}
      <Accordion type="single" collapsible className="space-y-2">
        {steps.map((step, index) => (
          <AccordionItem key={step.key} value={step.key} className="border rounded-lg">
            <Card className="p-0">
              <AccordionTrigger 
                className={cn(
                  "p-4 hover:no-underline",
                  !isSuperAdmin && "[&>svg]:hidden"
                )}
                onClick={(e) => {
                  if (!isSuperAdmin) {
                    e.preventDefault();
                  }
                }}
              >
                <div className="flex items-center gap-4 w-full">
                  {/* Step Number Circle with connecting line */}
                  <div className="relative flex flex-col items-center">
                    <div className="flex items-center justify-center">
                      {getStatusIcon(step.data.status)}
                    </div>
                    {index < steps.length - 1 && (
                      <div className="absolute top-8 w-0.5 h-8 bg-border" />
                    )}
                  </div>
                  
                  {/* Step Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{step.label}</span>
                      {step.data.id && (
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">
                          {step.data.id}
                        </code>
                      )}
                    </div>
                  </div>
                  
                  {/* Differences Badge - only show for completed steps with comparison data */}
                  {step.data.status === 'completed' && (
                    <Badge 
                      variant={getDifferencesBadgeVariant(step.differences)}
                      className="text-xs"
                    >
                      {step.differences > 0 
                        ? `${step.differences} diferença${step.differences > 1 ? 's' : ''}` 
                        : 'Idêntico'}
                    </Badge>
                  )}
                  
                  {/* View Details Button - Available for all users */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8",
                              !((step.key === 'order' && onViewOrderComparison) || (step.key === 'nfe' && onViewNFeComparison)) && "opacity-50 cursor-not-allowed"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (step.key === 'order' && onViewOrderComparison) {
                                onViewOrderComparison();
                              } else if (step.key === 'nfe' && onViewNFeComparison) {
                                onViewNFeComparison();
                              }
                            }}
                            disabled={!((step.key === 'order' && onViewOrderComparison) || (step.key === 'nfe' && onViewNFeComparison))}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{getTooltipMessage(step.key)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {/* Status Badge */}
                  {getStatusBadge(step.data.status)}
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="px-4 pb-4">
                {/* NFe Retry Progress Indicator */}
                {step.key === 'nfe' && (step.data.status === 'processing' || step.data.status === 'retrying') && (
                  <div className="mb-3">
                    <NFeRetryProgress 
                      attempt={step.data.retryAttempt || 1}
                      maxAttempts={step.data.maxRetries || 5}
                      nextDelaySeconds={step.data.nextDelaySeconds || 10}
                      status={step.data.status}
                    />
                  </div>
                )}
                
                {/* JSON Data - Only visible for Super Admins */}
                {isSuperAdmin && step.data.data && (
                  <div className="mt-2 p-3 bg-muted rounded-lg">
                    <h4 className="text-sm font-semibold mb-2">
                      {step.data.data?.endpoint 
                        ? `Requisição ${step.data.data.method || 'API'}` 
                        : 'Dados do Documento'}
                    </h4>
                    {/* Mostrar endpoint quando disponível */}
                    {step.data.data?.endpoint && (
                      <div className="mb-3 p-2 bg-background rounded border">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn(
                            "px-2 py-0.5 text-white rounded font-mono font-semibold",
                            step.data.data.method === 'GET' ? 'bg-blue-600' : 'bg-green-600'
                          )}>
                            {step.data.data.method || 'POST'}
                          </span>
                          <code className="flex-1 text-muted-foreground break-all">
                            {step.data.data.endpoint}
                          </code>
                        </div>
                      </div>
                    )}
                    <pre className="text-xs overflow-x-auto max-h-96 overflow-y-auto">
                      {JSON.stringify(
                        step.data.data?.request !== undefined
                          ? step.data.data.request 
                          : step.data.data, 
                        null, 
                        2
                      )}
                    </pre>
                  </div>
                )}
                
                {/* Technical message - Only for super admins */}
                {isSuperAdmin && !step.data.data && step.data.status === 'completed' && (
                  <p className="text-sm text-muted-foreground">
                    Etapa concluída sem dados adicionais
                  </p>
                )}
                
                {/* Error messages with appropriate detail level */}
                {step.data.status === 'failed' && (
                  <div className="mt-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
                    {isSuperAdmin 
                      ? 'Esta etapa falhou. Verifique os logs para mais detalhes.'
                      : 'Esta etapa falhou. Entre em contato com o administrador.'}
                  </div>
                )}
              </AccordionContent>
            </Card>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};
