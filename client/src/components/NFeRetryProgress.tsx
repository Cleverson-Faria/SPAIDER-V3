import { Card } from "@/components/ui/card";
import { Loader2, Clock } from "lucide-react";

interface NFeRetryProgressProps {
  attempt?: number;
  maxAttempts?: number;
  nextDelaySeconds?: number;
  status: string;
}

export const NFeRetryProgress = ({ 
  attempt = 1, 
  maxAttempts = 5, 
  nextDelaySeconds = 10,
  status 
}: NFeRetryProgressProps) => {
  if (status !== 'processing' && status !== 'retrying') {
    return null;
  }

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
      <div className="flex items-start gap-3">
        <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin mt-1 flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                🔄 Processando NFe em Segundo Plano
              </span>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                {maxAttempts} tentativas
              </span>
            </div>
          </div>

          {/* Background Status Message */}
          <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="font-medium">
                ✅ Você pode navegar livremente
              </span>
            </div>
            
            <p className="text-xs">
              A NFe está sendo buscada automaticamente em segundo plano com intervalos de até 25s entre tentativas.
            </p>
            
            <p className="text-xs">
              O status será atualizado automaticamente quando a NFe estiver disponível.
            </p>
          </div>

          {/* Explanation */}
          <div className="text-xs text-blue-600 dark:text-blue-400 border-t border-blue-200 dark:border-blue-800 pt-2">
            💡 A NFe pode levar alguns minutos para ser emitida pelo SAP após o faturamento
          </div>
        </div>
      </div>
    </Card>
  );
};
