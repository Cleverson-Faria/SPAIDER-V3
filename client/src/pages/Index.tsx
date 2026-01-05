import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ChatInterface } from "@/components/ChatInterface";
import { ComparatorView } from "@/components/ComparatorView";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { LogOut, Users, Globe, History, BarChart3, FileText, Settings, Crown, Key, Moon, Sun, Monitor, ScrollText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

const Index = () => {
  const { user, loading, signOut, profile, organization, isAdmin, isSuperAdmin } = useAuth();
  const { setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<"chat" | "comparator">("chat");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [comparatorMode, setComparatorMode] = useState<'single-order' | 'full-flow'>('single-order');
  const [cameFromHistory, setCameFromHistory] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Verificar se veio do histórico com state para abrir comparador
  useEffect(() => {
    if (location.state?.view === "comparator" && location.state?.runId) {
      setCurrentRunId(location.state.runId);
      
      // Determinar o modo baseado nos dados do localStorage
      const flowData = localStorage.getItem(`flow_${location.state.runId}`);
      if (flowData) {
        setComparatorMode('full-flow');
      } else {
        setComparatorMode('single-order');
      }
      
      setView("comparator");
      setCameFromHistory(true);
      
      // Limpar o state para não reabrir se o usuário recarregar
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Função de voltar que depende da origem
  const handleBackFromComparator = () => {
    if (cameFromHistory) {
      // Se veio do histórico, navegar de volta
      navigate("/test-history");
      setCameFromHistory(false);
    } else {
      // Se veio do chat, apenas trocar view
      setView("chat");
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header Global - Sempre Visível */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-chat-bg">
        <div className="flex items-center gap-3">
          {organization?.logo_url && (
            <img 
              src={organization.logo_url} 
              alt={organization.name}
              className="h-8 w-8 object-contain"
            />
          )}
          <div>
            <h2 className="font-semibold text-foreground">SPAIDER - {organization?.name}</h2>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile?.full_name
                    ? profile.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)
                    : profile?.email
                        ?.substring(0, 2)
                        .toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {/* Tema */}
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Tema</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" />
              Claro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" />
              Escuro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" />
              Sistema
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => navigate("/dashboard")}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/test-history")}>
              <History className="mr-2 h-4 w-4" />
              Histórico de Testes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isSuperAdmin && (
              <>
                <DropdownMenuItem onClick={() => navigate("/admin/super")}>
                  <Crown className="mr-2 h-4 w-4 text-yellow-500" />
                  <span className="font-semibold">Super Admin</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {isAdmin && (
              <>
                <DropdownMenuItem onClick={() => navigate("/admin/users")}>
                  <Users className="mr-2 h-4 w-4" />
                  Usuários
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/reference-orders")}>
                  <FileText className="mr-2 h-4 w-4" />
                  Referências de SD
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {isSuperAdmin && (
              <>
                <DropdownMenuItem onClick={() => navigate("/admin/domains")}>
                  <Globe className="mr-2 h-4 w-4" />
                  Domínios
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/sap-logs")}>
                  <ScrollText className="mr-2 h-4 w-4" />
                  Logs SAP
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      {/* Container dos Painéis */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div
          className={`${
            view === "chat" ? "flex" : "hidden"
          } w-full flex-col bg-chat-bg`}
        >
          <ChatInterface
            onOpenComparator={(runId) => {
              setCurrentRunId(runId);
              
              // Determinar o modo baseado nos dados do localStorage
              const flowData = localStorage.getItem(`flow_${runId}`);
              if (flowData) {
                setComparatorMode('full-flow');
              } else {
                setComparatorMode('single-order');
              }
              
              setView("comparator");
            }}
          />
        </div>

        {/* Comparator Panel */}
        <div
          className={`${
            view === "comparator" ? "flex" : "hidden"
          } w-full flex-col bg-background`}
        >
          <ComparatorView
            runId={currentRunId}
            onBackToChat={handleBackFromComparator}
            mode={comparatorMode}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
