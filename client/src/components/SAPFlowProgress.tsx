import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

interface SAPFlowStep {
  id: string;
  label: string;
  emoji: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  documentId?: string;
}

interface SAPFlowProgressProps {
  currentStep?: string;
  completedSteps: number;
  totalSteps: number;
  stepData?: {
    order?: { id: string };
    delivery?: { id: string };
    billing?: { id: string };
    nfe?: { number: string };
  };
  errors?: string[];
  onViewHistory?: () => void;
}

export const SAPFlowProgress = ({ 
  currentStep, 
  completedSteps, 
  totalSteps,
  stepData,
  errors = [],
  onViewHistory
}: SAPFlowProgressProps) => {
  const progressPercentage = (completedSteps / totalSteps) * 100;
  const previousCompletedSteps = useRef(completedSteps);
  const [justCompletedStep, setJustCompletedStep] = useState<string | null>(null);
  
  // 🎉 Efeito de confetes quando todas as etapas são concluídas
  useEffect(() => {
    if (completedSteps === totalSteps && previousCompletedSteps.current < totalSteps) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      return () => clearInterval(interval);
    }
    previousCompletedSteps.current = completedSteps;
  }, [completedSteps, totalSteps]);

  // ✅ Animar etapa quando ela é concluída
  useEffect(() => {
    if (completedSteps > previousCompletedSteps.current) {
      // Determinar qual etapa acabou de ser concluída
      const stepNames = ['order', 'delivery', 'picking', 'pgi', 'billing', 'nfe'];
      const justCompleted = stepNames[completedSteps - 1];
      setJustCompletedStep(justCompleted);
      
      // Mini confete para etapa individual
      confetti({
        particleCount: 30,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10b981', '#22c55e', '#4ade80']
      });
      
      setTimeout(() => setJustCompletedStep(null), 1000);
    }
  }, [completedSteps]);

  const steps: SAPFlowStep[] = [
    { 
      id: 'order', 
      label: 'Criando Ordem de Vendas (OV)', 
      emoji: '📝',
      status: getStepStatus('order', currentStep, completedSteps, 0, errors),
      documentId: stepData?.order?.id
    },
    { 
      id: 'delivery', 
      label: 'Criando Remessa', 
      emoji: '📦',
      status: getStepStatus('delivery', currentStep, completedSteps, 1, errors),
      documentId: stepData?.delivery?.id
    },
    { 
      id: 'picking', 
      label: 'Executando Picking', 
      emoji: '📋',
      status: getStepStatus('picking', currentStep, completedSteps, 2, errors)
    },
    { 
      id: 'pgi', 
      label: 'Executando PGI (Saída de Mercadorias)', 
      emoji: '🚚',
      status: getStepStatus('pgi', currentStep, completedSteps, 3, errors)
    },
    { 
      id: 'billing', 
      label: 'Gerando Faturamento', 
      emoji: '💰',
      status: getStepStatus('billing', currentStep, completedSteps, 4, errors),
      documentId: stepData?.billing?.id
    },
    { 
      id: 'nfe', 
      label: 'Consultando Nota Fiscal (NFe)', 
      emoji: '📄',
      status: getStepStatus('nfe', currentStep, completedSteps, 5, errors),
      documentId: stepData?.nfe?.number
    }
  ];

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progresso do Fluxo SAP</span>
          <span className={cn(
            "text-muted-foreground transition-all duration-300",
            completedSteps === totalSteps && "text-green-700 font-semibold scale-110"
          )}>
            {completedSteps}/{totalSteps} etapas
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2 transition-all duration-500" />
        <div className={cn(
          "text-xs text-muted-foreground text-right transition-all duration-300",
          completedSteps === totalSteps && "text-green-700 font-semibold"
        )}>
          {Math.round(progressPercentage)}%
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={cn(
              "flex items-start gap-3 p-2 rounded-md transition-all duration-300",
              step.status === 'processing' && "bg-primary/10 scale-[1.02] shadow-sm",
              step.status === 'completed' && "bg-green-500/10",
              step.status === 'failed' && "bg-destructive/10",
              justCompletedStep === step.id && "animate-scale-in"
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'pending' && (
                <Circle className="h-5 w-5 text-muted-foreground transition-all duration-200" />
              )}
              {step.status === 'processing' && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
              {step.status === 'completed' && (
                <div className={cn(
                  "relative",
                  justCompletedStep === step.id && "animate-[scale-in_0.5s_ease-out]"
                )}>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  {justCompletedStep === step.id && (
                    <div className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" />
                  )}
                </div>
              )}
              {step.status === 'failed' && (
                <XCircle className="h-5 w-5 text-destructive animate-scale-in" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-lg transition-transform duration-300",
                  step.status === 'completed' && "scale-110",
                  justCompletedStep === step.id && "animate-bounce"
                )}>
                  {step.emoji}
                </span>
                <span className={cn(
                  "text-sm font-medium transition-all duration-300",
                  step.status === 'pending' && "text-muted-foreground",
                  step.status === 'processing' && "text-primary font-semibold",
                  step.status === 'completed' && "text-green-700 font-semibold",
                  step.status === 'failed' && "text-destructive"
                )}>
                  {step.label}
                </span>
              </div>
              
              {step.documentId && (
                <div className={cn(
                  "text-xs text-muted-foreground mt-1 font-mono animate-fade-in",
                  step.status === 'completed' && "text-green-700/70 font-medium"
                )}>
                  {step.id === 'nfe' ? 'NFe: ' : 'Doc: '}{step.documentId}
                </div>
              )}
              
              {step.status === 'processing' && (
                <div className="text-xs text-primary mt-1 animate-pulse">
                  Processando...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 animate-fade-in">
          <div className="font-semibold mb-1">⚠️ Erros encontrados:</div>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      
      {completedSteps === totalSteps && errors.length === 0 && (
        <div className="text-center py-2 animate-fade-in">
          <div className="text-2xl mb-1">🎉</div>
          <div className="text-sm font-semibold text-green-700">
            Fluxo SAP concluído com sucesso!
          </div>
          {onViewHistory && (
            <Button 
              onClick={onViewHistory}
              variant="outline"
              className="mt-3 gap-2"
              size="sm"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M12 7v5l4 2"/>
              </svg>
              Ver Detalhes no Histórico
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

function getStepStatus(
  stepId: string, 
  currentStep: string | undefined,
  completedSteps: number, 
  stepIndex: number,
  errors: string[]
): 'pending' | 'processing' | 'completed' | 'failed' {
  // Se há erros e completedSteps é menor ou igual ao índice, pode ter falhado
  if (errors.length > 0 && completedSteps <= stepIndex) {
    return 'failed';
  }
  
  // Se completedSteps é maior que o índice, a etapa foi concluída
  if (completedSteps > stepIndex) {
    return 'completed';
  }
  
  // Se é a etapa atual, está em processamento
  if (currentStep === stepId) {
    return 'processing';
  }
  
  // Caso contrário, está pendente
  return 'pending';
}
