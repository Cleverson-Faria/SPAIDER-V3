import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const MAX_RETRIES = 3;
const MAX_RETRIES_INFRA_ERROR = 1; // Reduzido para erros de infraestrutura
const INITIAL_TIMEOUT = 30000; // 30 seconds

interface BillOfLadingQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryDocument: string;
}

export const BillOfLadingQRDialog = ({
  open,
  onOpenChange,
  deliveryDocument,
}: BillOfLadingQRDialogProps) => {
  const [billOfLading, setBillOfLading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [progress, setProgress] = useState("");
  const [manualInput, setManualInput] = useState("");

  const fetchBillOfLadingWithRetry = async (attempt: number = 0): Promise<void> => {
    setLoading(true);
    setError(null);
    setBillOfLading(null);
    setRetryCount(attempt);

    try {
      setProgress(attempt > 0 ? `Tentativa ${attempt + 1} de ${MAX_RETRIES + 1}...` : "Buscando conhecimento de embarque...");

      console.log("[BOL] Chamando get_bill_of_lading", { deliveryDocument, attempt });

      // Obter perfil do usuário autenticado
      const profile = await api.getProfile();
      if (!profile) {
        throw new Error("Perfil do usuário não encontrado");
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), INITIAL_TIMEOUT);

      try {
        const data = await api.invoke("sap-integration", {
          action: "get_bill_of_lading",
          deliveryDocument,
          userId: profile.id,
          organizationId: profile.organization_id,
        });

        clearTimeout(timeoutId);

        console.log("[BOL] Resposta da função", { data });

        if (data?.billOfLading) {
          setBillOfLading(data.billOfLading);
          setProgress("");
          toast.success("Conhecimento de embarque obtido com sucesso");
          return;
        } else {
          throw new Error("Conhecimento de embarque não encontrado na resposta");
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err: any) {
      console.error("[BOL] Erro ao buscar Bill of Lading", {
        attempt,
        deliveryDocument,
        name: err?.name,
        message: err?.message,
      });
      
      const rawMessage = err?.message || "";
      const isFunctionsFetchError = 
        err?.name === "FunctionsFetchError" ||
        rawMessage.includes("Failed to send a request to the Edge Function");

      const isRetryable = 
        isFunctionsFetchError ||
        rawMessage.includes("timeout") ||
        rawMessage.includes("AbortError") ||
        rawMessage.includes("network");

      // Para erros de infraestrutura, tentar menos vezes
      const maxRetries = isFunctionsFetchError ? MAX_RETRIES_INFRA_ERROR : MAX_RETRIES;

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        setProgress(`Erro de conexão. Tentando novamente em ${delay / 1000}s...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchBillOfLadingWithRetry(attempt + 1);
      }

      const errorMessage = 
        rawMessage === "Usuário não autenticado"
          ? "Você precisa estar autenticado para buscar o conhecimento de embarque"
          : rawMessage === "Perfil do usuário não encontrado"
          ? "Perfil do usuário não encontrado. Entre em contato com o suporte."
          : isFunctionsFetchError
          ? "Instabilidade na infraestrutura do servidor. Sua requisição foi processada, mas a resposta não foi entregue. Use o campo abaixo para gerar o QR manualmente ou tente novamente em alguns minutos."
          : rawMessage.includes("timeout") || rawMessage.includes("AbortError")
          ? `Tempo de requisição excedido após ${attempt + 1} tentativas. Tente novamente.`
          : rawMessage || "Não foi possível buscar o conhecimento de embarque";
      
      setError(errorMessage);
      setProgress("");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchBillOfLading = () => fetchBillOfLadingWithRetry(0);

  const handleManualGenerate = () => {
    const trimmedInput = manualInput.trim();
    if (!trimmedInput) {
      toast.error("Digite o número do Conhecimento de Embarque");
      return;
    }
    setBillOfLading(trimmedInput);
    setError(null);
    setManualInput("");
    toast.success("QR Code gerado manualmente");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setBillOfLading(null);
      setError(null);
      setRetryCount(0);
      setProgress("");
      setManualInput("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Conhecimento de Embarque - Remessa {deliveryDocument}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center space-y-4 py-6">
          {!billOfLading && !loading && !error && (
            <Button onClick={fetchBillOfLading} className="gap-2">
              <QrCode className="h-4 w-4" />
              Buscar Conhecimento de Embarque
            </Button>
          )}

          {loading && (
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {progress || "Buscando conhecimento de embarque..."}
                </p>
                {retryCount > 0 && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Aguarde, conectando ao SAP...
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center space-y-4 w-full">
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-center w-full">
                <p className="text-sm text-destructive">{error}</p>
              </div>
              
              <div className="w-full space-y-3 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="manual-bol" className="text-sm font-medium">
                    Número do Conhecimento de Embarque (Bill of Lading)
                  </Label>
                  <Input
                    id="manual-bol"
                    type="text"
                    placeholder="Ex: 20253414"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualGenerate()}
                  />
                </div>
                <Button onClick={handleManualGenerate} className="w-full" variant="outline">
                  Gerar QR Code Manualmente
                </Button>
              </div>

              <div className="flex gap-2">
                <Button onClick={fetchBillOfLading} variant="outline">
                  Tentar Buscar Novamente
                </Button>
                <Button onClick={() => handleOpenChange(false)} variant="secondary">
                  Fechar
                </Button>
              </div>
            </div>
          )}

          {billOfLading && !loading && (
            <div className="flex flex-col items-center space-y-4">
              <div className="rounded-lg border bg-background p-4">
                <QRCodeSVG value={billOfLading} size={256} level="H" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Conhecimento de Embarque
                </p>
                <p className="text-lg font-mono font-semibold">{billOfLading}</p>
              </div>
              <Button onClick={() => handleOpenChange(false)} variant="secondary">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
