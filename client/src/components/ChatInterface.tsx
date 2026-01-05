import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Send, Paperclip, FileWarning, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SAPFlowProgress } from "./SAPFlowProgress";
import { localStorageManager } from "@/lib/localStorageManager";
import { Badge } from "@/components/ui/badge";

// Interface para dados de erro com log
interface ErrorLogData {
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  request?: any;
  response?: any;
  timestamp: Date;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  options?: Array<{
    id: string;
    text: string;
    action: string;
    orderId?: string;
    reference_order_id?: string;
  }>;
  progressData?: {
    test_execution_id?: string;
    currentStep?: string;
    completedSteps: number;
    totalSteps: number;
    stepData?: any;
    errors?: string[];
  };
  errorLog?: ErrorLogData; // Dados de erro para o botão "Ver log"
}

interface ChatInterfaceProps {
  onOpenComparator: (runId: string) => void;
}

export const ChatInterface = ({ onOpenComparator }: ChatInterfaceProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Olá, Me chamo SPAIDER, seu assistente virtual. Como posso lhe ajudar?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTestExecutionId, setActiveTestExecutionId] = useState<string | null>(null);
  const [errorLogDialogOpen, setErrorLogDialogOpen] = useState(false);
  const [selectedErrorLog, setSelectedErrorLog] = useState<ErrorLogData | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Função para copiar JSON para clipboard
  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Limpar localStorage antigo na inicialização
  useEffect(() => {
    localStorageManager.cleanOldComparisons();
    console.log(`📊 LocalStorage size: ${localStorageManager.getStorageSize()} KB`);
  }, []);

  // 🆕 Subscrever mudanças em tempo real quando um teste SAP for iniciado
  // TODO: Implementar WebSockets no backend para substituir Supabase Realtime
  useEffect(() => {
    if (!activeTestExecutionId) return;

    console.log('📡 [Realtime] Polling test execution:', activeTestExecutionId);

    // Polling como alternativa temporária ao Realtime
    const pollInterval = setInterval(async () => {
      try {
        const execution = await api.get('test_flow_executions', activeTestExecutionId);
        
        // Atualizar a última mensagem com o progressData atualizado
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.progressData) {
            const updatedProgress = {
              ...lastMessage.progressData,
              completedSteps: execution.completed_steps || 0,
              stepData: {
                order: { id: execution.order_id, status: execution.order_status },
                delivery: { id: execution.delivery_id, status: execution.delivery_status },
                picking: { status: execution.picking_status },
                pgi: { status: execution.pgi_status },
                billing: { id: execution.billing_id, status: execution.billing_status },
                nfe: { number: execution.nfe_number, status: execution.nfe_status }
              }
            };
            
            // 🆕 DETECTAR CONCLUSÃO E NAVEGAR AUTOMATICAMENTE
            const isCompleted = updatedProgress.completedSteps === lastMessage.progressData.totalSteps;
            const testFinished = execution.global_status === 'completed';
            
            if (isCompleted && testFinished) {
              console.log('✅ [Realtime] Test completed! Navigating to history in 2s...');
              
              // Toast de sucesso
              toast({
                title: "✅ Teste Concluído!",
                description: "Navegando para o histórico de testes...",
                variant: "default",
              });
              
              // Aguardar 2s para o usuário ver o confete e então navegar
              setTimeout(() => {
                navigate('/test-history');
              }, 2000);
              
              clearInterval(pollInterval);
            }
            
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                progressData: updatedProgress
              }
            ];
          }
          return prev;
        });
      } catch (error) {
        console.error('Error polling test execution:', error);
      }
    }, 2000); // Poll a cada 2 segundos

    return () => {
      console.log('📡 [Realtime] Stopping polling');
      clearInterval(pollInterval);
    };
  }, [activeTestExecutionId, navigate, toast]);

  const handleOptionClick = async (option: any) => {
    // Navegação para configuração de ordens de referência
    if (option.action === 'NAVIGATE_TO_CONFIG') {
      console.log('🔧 [CHAT] Navigating to Reference Orders configuration');
      navigate('/admin/reference-orders');
      return;
    }
    
    // Se é uma seleção de ordem de referência, chamar execute-test diretamente
    if (option.action === 'SELECT_REFERENCE_ORDER') {
      setIsLoading(true);
      
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: option.text,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      try {
        console.log(`🎯 [CHAT] Executando teste com ordem de referência: ${option.reference_order_id}`);
        
        // Chamar endpoint execute-test usando o api client (que usa a URL base correta)
        const responseData = await api.invoke('sap-execute-test', {
          reference_order_id: option.reference_order_id,
          intent: 'TEST_ORDER_ONLY'  // Default intent para seleção direta
        }) as any;

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: responseData.response || 'Teste iniciado.',
          timestamp: new Date(),
          progressData: responseData.ui?.progress?.show ? {
            test_execution_id: responseData.ui.progress.test_execution_id,
            completedSteps: 0,
            totalSteps: 6,
            currentStep: 'starting'
          } : undefined,
        };
        setMessages(prev => [...prev, aiMessage]);

        // Ativar subscrição para progresso
        if (responseData.ui?.progress?.test_execution_id) {
          setActiveTestExecutionId(responseData.ui.progress.test_execution_id);
        }

        // Salvar dados no localStorage se houver
        if (responseData.localStorage?.key && responseData.localStorage?.value) {
          localStorage.setItem(
            responseData.localStorage.key,
            responseData.localStorage.value
          );
        }

        if (responseData.ui) {
          if (responseData.ui.toast?.show) {
            toast({
              title: responseData.ui.toast.title,
              description: responseData.ui.toast.description,
              variant: responseData.ui.toast.variant || 'default',
            });
          }
          
          // Processar comparator
          if (responseData.ui.comparator?.open && responseData.ui.comparator?.run_id) {
            onOpenComparator(responseData.ui.comparator.run_id);
          }
          
          // Processar navegação automática
          if (responseData.ui.navigate?.path) {
            const delay = responseData.ui.navigate.delay || 0;
            const path = responseData.ui.navigate.path;
            const state = responseData.ui.navigate.state || {};
            
            console.log(`📍 [ChatInterface] Scheduling navigation to ${path} in ${delay}ms`);
            
            setTimeout(() => {
              console.log(`🚀 [ChatInterface] Navigating to ${path}`);
              navigate(path, { state });
            }, delay);
          }
        }
      } catch (error: unknown) {
        console.error('Error executing test with reference order:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        toast({
          title: 'Erro',
          description: `Falha ao iniciar teste: ${errorMessage}`,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Lógica existente para outras opções
    setIsLoading(true);
    const actionMessage = `${option.text}${option.orderId ? ` (OV: ${option.orderId})` : ''}`;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: actionMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const functionData = await api.invoke('spaider-chat', {
        messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
      });

      const aiResponseData = functionData as any;
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponseData.message || aiResponseData.response || 'Ação executada.',
        timestamp: new Date(),
        options: aiResponseData.options || [],
      };
      setMessages(prev => [...prev, aiMessage]);

      // Salvar dados no localStorage se houver run_id
      if (aiResponseData.data?.run_id) {
        localStorage.setItem(
          `comparison_${aiResponseData.data.run_id}`,
          JSON.stringify(aiResponseData.data)
        );
      }

      // Salvar dados de fluxo completo no localStorage se houver
      if (aiResponseData.localStorage?.key && aiResponseData.localStorage?.value) {
        localStorage.setItem(
          aiResponseData.localStorage.key,
          aiResponseData.localStorage.value
        );
      }

      if (aiResponseData.ui) {
        if (aiResponseData.ui.toast?.show) {
          toast({
            title: aiResponseData.ui.toast.title,
            description: aiResponseData.ui.toast.description,
            variant: aiResponseData.ui.toast.variant || 'default',
          });
        }
        if (aiResponseData.ui.comparator?.open && aiResponseData.ui.comparator?.run_id) {
          onOpenComparator(aiResponseData.ui.comparator.run_id);
        }
        
        // Processar navegação automática se especificado
        if (aiResponseData.ui.navigate?.path) {
          const delay = aiResponseData.ui.navigate.delay || 0;
          const path = aiResponseData.ui.navigate.path;
          const state = aiResponseData.ui.navigate.state || {};
          
          console.log(`📍 [ChatInterface] Scheduling navigation to ${path} in ${delay}ms`);
          
          setTimeout(() => {
            console.log(`🚀 [ChatInterface] Navigating to ${path}`);
            navigate(path, { state });
          }, delay);
        }
      }
    } catch (error: unknown) {
      console.error('Error calling option:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: `Falha ao executar ação: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Chamar função spaider-chat via API
      const aiResponse = await api.invoke('spaider-chat', {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content
        }))
      });
      
      // 🆕 Se a IA retornou um intent SAP, processar automaticamente
      if (aiResponse.intent && (aiResponse.intent === "TEST_ORDER_ONLY" || aiResponse.intent === "TEST_FULL_FLOW")) {
        console.log("🎯 [CHAT] Intent SAP detectado:", aiResponse.intent);
        console.log("📋 [CHAT] Scenario:", aiResponse.scenario);

        // Mostrar mensagem da IA primeiro
        const intentMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: aiResponse.response || "Processando sua solicitação...",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, intentMessage]);

        // Chamar endpoint para executar teste SAP
        try {
          const sapResult = await api.invoke('sap-execute-test', {
            intent: aiResponse.intent,
            scenario: aiResponse.scenario,
            continue_from_step: aiResponse.continue_from_step,
          });

          const resultMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: sapResult.response || "Teste executado.",
            timestamp: new Date(),
            options: sapResult.options || [],
            progressData: sapResult.progressData,
          };
          setMessages((prev) => [...prev, resultMessage]);

          // Processar UI da resposta SAP
          if (sapResult.ui?.toast?.show) {
            toast({
              title: sapResult.ui.toast.title,
              description: sapResult.ui.toast.description,
              variant: sapResult.ui.toast.variant || "default",
            });
          }

          if (sapResult.progressData?.test_execution_id) {
            setActiveTestExecutionId(sapResult.progressData.test_execution_id);
          }

          if (sapResult.data?.run_id) {
            localStorageManager.setItem(`comparison_${sapResult.data.run_id}`, sapResult.data);
          }

          // Processar navegação automática (para TEST_ORDER_ONLY)
          if (sapResult.ui?.navigate?.path) {
            const delay = sapResult.ui.navigate.delay || 2000;
            const path = sapResult.ui.navigate.path;
            const state = sapResult.ui.navigate.state || {};
            
            console.log(`📍 [ChatInterface] Navegando para ${path} em ${delay}ms`);
            
            setTimeout(() => {
              console.log(`🚀 [ChatInterface] Navegando para ${path}`);
              navigate(path, { state });
            }, delay);
          }
        } catch (sapError: any) {
          console.error("❌ [CHAT] Erro ao executar SAP:", sapError);
          
          // Tentar extrair informações do erro para o log
          let errorLogData: ErrorLogData | undefined;
          const errorText = sapError.message || "";
          
          // Verificar se o backend retornou errorLog estruturado com o payload real
          if (sapError.errorLog) {
            errorLogData = {
              endpoint: sapError.errorLog.endpoint || "/api/sap/execute-test",
              method: (sapError.errorLog.method || "POST") as "GET" | "POST" | "PATCH" | "DELETE",
              request: sapError.errorLog.request, // Payload real enviado ao SAP
              response: sapError.errorLog.sapError || { raw: sapError.errorLog.rawError } || { error: errorText },
              timestamp: new Date(sapError.errorLog.timestamp || Date.now()),
            };
          } else {
            // Fallback: Tentar parsear JSON do erro (formato: "Failed to create order: 400 - {...}")
            const jsonMatch = errorText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const errorJson = JSON.parse(jsonMatch[0]);
                errorLogData = {
                  endpoint: "/api/sap/execute-test",
                  method: "POST",
                  request: aiResponse?.scenario, // Fallback para cenário se não tiver payload real
                  response: errorJson,
                  timestamp: new Date(),
                };
              } catch (e) {
                errorLogData = {
                  endpoint: "/api/sap/execute-test",
                  method: "POST",
                  request: aiResponse?.scenario,
                  response: { raw: errorText },
                  timestamp: new Date(),
                };
              }
            } else if (errorText.includes("Failed to") || errorText.includes("Erro")) {
              errorLogData = {
                endpoint: "/api/sap/execute-test",
                method: "POST",
                request: aiResponse?.scenario,
                response: { error: errorText },
                timestamp: new Date(),
              };
            }
          }

          const errorMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: "❌ Erro na criação do documento",
            timestamp: new Date(),
            errorLog: errorLogData,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }

        return; // Sair do handleSend, já processamos
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponse.message || aiResponse.response || "Desculpe, não consegui processar sua mensagem.",
        timestamp: new Date(),
        options: aiResponse.options || [],
        progressData: aiResponse.progressData // 🆕 Incluir progressData se existir
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // 🆕 Se houver progressData, ativar subscrição realtime
      if (aiResponse.progressData && aiResponse.data?.testExecutionId) {
        setActiveTestExecutionId(aiResponse.data.testExecutionId);
      }

      // Salvar dados no localStorage de forma segura (não bloqueia navegação)
      if (aiResponse.data?.run_id) {
        const saved = localStorageManager.setItem(
          `comparison_${aiResponse.data.run_id}`,
          aiResponse.data
        );
        if (!saved) {
          console.warn('⚠️ LocalStorage full, data saved only in database');
        }
      }

      // Salvar dados de fluxo completo no localStorage de forma segura
      if (aiResponse.localStorage?.key && aiResponse.localStorage?.value) {
        try {
          const parsedValue = JSON.parse(aiResponse.localStorage.value);
          const saved = localStorageManager.setItem(
            aiResponse.localStorage.key,
            parsedValue
          );
          if (!saved) {
            console.warn('⚠️ LocalStorage full, data saved only in database');
          }
        } catch (e) {
          console.error('Error parsing localStorage value:', e);
        }
      }

      // Processar instruções de UI
      if (aiResponse.ui) {
        // Mostrar toast se solicitado
        if (aiResponse.ui.toast?.show) {
          toast({
            title: aiResponse.ui.toast.title,
            description: aiResponse.ui.toast.description,
            variant: aiResponse.ui.toast.variant || "default",
          });
        }

        // Abrir comparador se solicitado
        if (aiResponse.ui.comparator?.open && aiResponse.data?.run_id) {
          setTimeout(() => {
            onOpenComparator(aiResponse.data.run_id);
          }, 500);
        }

        // Navegação automática
        if (aiResponse.ui.navigate) {
          // 🆕 Limpar subscrição quando navegar
          setActiveTestExecutionId(null);
          
          setTimeout(() => {
            navigate(aiResponse.ui.navigate.path, {
              state: aiResponse.ui.navigate.state || {}
            });
          }, aiResponse.ui.navigate.delay || 1000);
        }
      }

    } catch (error: any) {
      console.error('Error in handleSend:', error);
      
      // Mensagem de erro amigável
      let errorMessage = "Erro ao processar sua mensagem. Tente novamente.";
      
      if (error.name === 'QuotaExceededError') {
        // Este erro não deveria mais acontecer aqui, mas caso aconteça:
        errorMessage = "Teste concluído! (Armazenamento local cheio, dados salvos no servidor)";
        // Limpar localStorage em background
        setTimeout(() => {
          localStorageManager.cleanOldComparisons();
        }, 1000);
      } else if (error.message?.includes('Rate limit')) {
        errorMessage = "Muitas requisições. Aguarde alguns segundos.";
      } else if (error.message?.includes('Payment required')) {
        errorMessage = "Créditos esgotados. Adicione créditos ao workspace.";
      }

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: errorMessage,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMsg]);

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
               <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-chat-user text-white"
                    : "bg-chat-assistant text-foreground border border-border"
                }`}
              >
                {/* Renderizar componente de progresso SAP se houver progressData e steps completados */}
                {message.progressData && message.progressData.completedSteps > 0 ? (
                  <SAPFlowProgress
                    currentStep={message.progressData.currentStep}
                    completedSteps={message.progressData.completedSteps}
                    totalSteps={message.progressData.totalSteps}
                    stepData={message.progressData.stepData}
                    errors={message.progressData.errors}
                    onViewHistory={() => navigate('/test-history')}
                  />
                ) : (
                  <>
                    <p className="text-sm">{message.content}</p>
                    <p className="mt-1 text-xs opacity-60">
                      {message.timestamp.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    
                    {/* Botão Ver Log para mensagens de erro */}
                    {message.errorLog && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-2 text-xs"
                        onClick={() => {
                          setSelectedErrorLog(message.errorLog!);
                          setErrorLogDialogOpen(true);
                        }}
                      >
                        <FileWarning className="h-3 w-3" />
                        Ver log
                      </Button>
                    )}
                  </>
                )}
                
                {/* Render option buttons */}
                {message.options && message.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {message.options.map((option) => (
                      <Button
                        key={option.id}
                        onClick={() => handleOptionClick(option)}
                        disabled={isLoading}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                      >
                        {option.text}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-border bg-chat-assistant px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-background p-4">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Digite sua mensagem..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="shrink-0 bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dialog para exibir detalhes do log de erro */}
      <Dialog open={errorLogDialogOpen} onOpenChange={setErrorLogDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-destructive" />
              Log de Erro
            </DialogTitle>
            <DialogDescription>
              Detalhes da requisição que causou o erro
            </DialogDescription>
          </DialogHeader>

          {selectedErrorLog && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* Informações do Endpoint */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={selectedErrorLog.method === "GET" ? "secondary" : "default"}>
                    {selectedErrorLog.method}
                  </Badge>
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                    {selectedErrorLog.endpoint}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedErrorLog.timestamp.toLocaleString("pt-BR")}
                </p>
              </div>

              {/* Request Payload */}
              {selectedErrorLog.request && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Payload Enviado (Request)</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => copyToClipboard(JSON.stringify(selectedErrorLog.request, null, 2), 'request')}
                    >
                      {copiedSection === 'request' ? (
                        <><Check className="h-3 w-3" /> Copiado</>
                      ) : (
                        <><Copy className="h-3 w-3" /> Copiar</>
                      )}
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-[200px] overflow-y-auto">
                    {JSON.stringify(selectedErrorLog.request, null, 2)}
                  </pre>
                </div>
              )}

              {/* Response/Error */}
              {selectedErrorLog.response && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-destructive">Resposta de Erro</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => copyToClipboard(JSON.stringify(selectedErrorLog.response, null, 2), 'response')}
                    >
                      {copiedSection === 'response' ? (
                        <><Check className="h-3 w-3" /> Copiado</>
                      ) : (
                        <><Copy className="h-3 w-3" /> Copiar</>
                      )}
                    </Button>
                  </div>
                  <pre className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
                    {JSON.stringify(selectedErrorLog.response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
