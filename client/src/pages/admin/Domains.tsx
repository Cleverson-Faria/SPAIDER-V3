import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, ArrowLeft, Power, Loader2, CheckCircle2, XCircle, AlertCircle, Info, Upload, X, Pencil, Eye, EyeOff, Server } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

interface AllowedDomain {
  id: string;
  domain: string;
  is_active: boolean;
  created_at: string;
  organization_id: string;
  organization_name?: string;
}

interface SapDomainCredential {
  id: string;
  domain: string;
  display_name: string;
  secret_suffix: string;
  organization_id: string;
  organization_name?: string;
  is_active: boolean;
  logo_url?: string;
  base_url?: string;
  sap_username?: string;
  has_sales_order_api?: boolean;
  has_delivery_api?: boolean;
  has_billing_api?: boolean;
  has_nfe_api?: boolean;
  last_test_at?: string;
  last_test_ok?: boolean;
  status?: 'idle' | 'testing' | 'success' | 'error';
  details?: any;
  error?: string;
}

const Domains = () => {
  const { user, organization, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [organizations, setOrganizations] = useState<Array<{id: string, name: string, slug?: string}>>([]);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const { toast } = useToast();

  // Estados para Credenciais SAP
  const [sapDomains, setSapDomains] = useState<SapDomainCredential[]>([]);
  const [showSapForm, setShowSapForm] = useState(false);
  const [newSapDomain, setNewSapDomain] = useState({
    displayName: "",
    domain: "",
    organizationId: "",
    base_url: "",
    sap_username: "",
    sap_password: "",
    has_sales_order_api: true,
    has_delivery_api: true,
    has_billing_api: false,
    has_nfe_api: false,
  });
  const [loadingSapDomains, setLoadingSapDomains] = useState(false);
  const [showNewSapPassword, setShowNewSapPassword] = useState(false);
  const [savingNewSapCredential, setSavingNewSapCredential] = useState(false);
  
  // Estados para upload de logos
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [selectedDomainForLogo, setSelectedDomainForLogo] = useState<string | null>(null);
  const [spaiderLogoUrl, setSpaiderLogoUrl] = useState<string | null>(null);
  const [uploadingSpaiderLogo, setUploadingSpaiderLogo] = useState(false);
  
  // Estados para edição de credenciais SAP
  const [showEditSapDialog, setShowEditSapDialog] = useState(false);
  const [editingSapCredential, setEditingSapCredential] = useState<SapDomainCredential | null>(null);
  const [savingSapCredential, setSavingSapCredential] = useState(false);
  const [showSapPassword, setShowSapPassword] = useState(false);
  const [sapCredentialForm, setSapCredentialForm] = useState({
    display_name: "",
    base_url: "",
    sap_username: "",
    sap_password: "",
    has_sales_order_api: true,
    has_delivery_api: true,
    has_billing_api: false,
    has_nfe_api: false,
  });

  // Debug: Monitorar estado de autenticação
  useEffect(() => {
    console.log('🔍 Estado Auth atualizado:', { 
      hasUser: !!user, 
      userId: user?.id,
      userEmail: user?.email,
      isSuperAdmin,
      isAdmin,
      organizationId: organization?.id,
      organizationName: organization?.name
    });
  }, [user, isSuperAdmin, isAdmin, organization]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchDomains();
      fetchOrganizations();
      fetchSapDomains();
      fetchSpaiderLogo();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (newOrgName) {
      setNewOrgSlug(generateSlug(newOrgName));
    }
  }, [newOrgName]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const fetchOrganizations = async () => {
    if (!isSuperAdmin) return;
    
    try {
      const data = await api.query("organizations", { orderBy: "name.asc" });
      if (data) {
        setOrganizations(data);
      }
    } catch (error) {
      console.error("Erro ao buscar organizações:", error);
    }
  };

  const fetchSpaiderLogo = async () => {
    if (!isSuperAdmin) return;
    
    try {
      const data = await api.query("organizations", { limit: 1, single: true });
      if (data?.spaider_logo_url) {
        setSpaiderLogoUrl(data.spaider_logo_url);
      }
    } catch (error) {
      console.error("Erro ao buscar logo:", error);
    }
  };

  const fetchDomains = async () => {
    if (!isSuperAdmin) return;

    try {
      const data = await api.query("allowed_email_domains", { orderBy: "created_at.desc" });
      
      // Buscar nomes das organizações
      const domainsWithOrg = await Promise.all(
        (data || []).map(async (d: any) => {
          try {
            const org = await api.get("organizations", d.organization_id);
            return { ...d, organization_name: org?.name || "Sem organização" };
          } catch {
            return { ...d, organization_name: "Sem organização" };
          }
        })
      );
      setDomains(domainsWithOrg);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar domínios",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchSapDomains = async () => {
    if (!isSuperAdmin) return;
    
    setLoadingSapDomains(true);
    try {
      // Usar endpoint específico que retorna todos os campos
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/sap-credentials`, {
        headers: { 'Authorization': `Bearer ${api.getToken()}` }
      });
      
      if (!response.ok) {
        throw new Error('Erro ao buscar credenciais');
      }
      
      const data = await response.json();
      
      // Buscar nomes das organizações e mapear status
      const sapWithOrg = await Promise.all(
        (data || []).map(async (sap: any) => {
          // Determinar status baseado em last_test_ok
          // true = sucesso, false = erro, null/undefined = não testado
          let status: 'success' | 'error' | 'idle' = 'idle';
          if (sap.last_test_ok === true) {
            status = 'success';
          } else if (sap.last_test_ok === false) {
            status = 'error';
          }
          
          try {
            const org = await api.get("organizations", sap.organization_id);
            return {
              ...sap,
              organization_name: org?.name || "Sem organização",
              status
            };
          } catch {
            return {
              ...sap,
              organization_name: "Sem organização",
              status
            };
          }
        })
      );
      
      setSapDomains(sapWithOrg);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar credenciais SAP",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoadingSapDomains(false);
    }
  };

  const generateSapSuffix = (displayName: string) => {
    return displayName
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "");
  };

  const handleAddSapDomain = async () => {
    if (!newSapDomain.displayName || !newSapDomain.domain || !newSapDomain.organizationId) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha Organização, Nome da Empresa e Domínio",
        variant: "destructive"
      });
      return;
    }

    setSavingNewSapCredential(true);
    const suffix = generateSapSuffix(newSapDomain.displayName);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      // Criar credencial com todos os campos via API
      const body: any = {
        domain: newSapDomain.domain,
        display_name: newSapDomain.displayName,
        organization_id: newSapDomain.organizationId,
        base_url: newSapDomain.base_url || null,
        sap_username: newSapDomain.sap_username || null,
        has_sales_order_api: newSapDomain.has_sales_order_api,
        has_delivery_api: newSapDomain.has_delivery_api,
        has_billing_api: newSapDomain.has_billing_api,
        has_nfe_api: newSapDomain.has_nfe_api,
      };

      // Incluir senha se preenchida
      if (newSapDomain.sap_password) {
        body.sap_password = newSapDomain.sap_password;
      }

      const response = await fetch(`${apiUrl}/api/sap-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar credencial');
      }

      toast({
        title: "✅ Credencial SAP criada!",
        description: `${newSapDomain.displayName} foi configurada com sucesso`,
      });

      setShowSapForm(false);
      setNewSapDomain({ 
        displayName: "", 
        domain: "", 
        organizationId: "",
        base_url: "",
        sap_username: "",
        sap_password: "",
        has_sales_order_api: true,
        has_delivery_api: true,
        has_billing_api: false,
        has_nfe_api: false,
      });
      setShowNewSapPassword(false);
      fetchSapDomains();
    } catch (error: any) {
      toast({
        title: "Erro ao criar credencial SAP",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSavingNewSapCredential(false);
    }
  };

  const handleToggleSapDomain = async (id: string, currentStatus: boolean) => {
    try {
      await api.update('sap_domain_credentials', id, { is_active: !currentStatus });
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive"
      });
      return;
    }
    toast({
      title: "Status atualizado",
      description: `Credencial ${!currentStatus ? 'ativada' : 'desativada'}`,
    });
    fetchSapDomains();
  };

  // Abrir dialog de edição de credencial SAP
  const handleEditSapCredential = (credential: SapDomainCredential) => {
    setEditingSapCredential(credential);
    setSapCredentialForm({
      display_name: credential.display_name || "",
      base_url: credential.base_url || "",
      sap_username: credential.sap_username || "",
      sap_password: "", // Nunca mostramos a senha existente
      has_sales_order_api: credential.has_sales_order_api ?? true,
      has_delivery_api: credential.has_delivery_api ?? true,
      has_billing_api: credential.has_billing_api ?? false,
      has_nfe_api: credential.has_nfe_api ?? false,
    });
    setShowSapPassword(false);
    setShowEditSapDialog(true);
  };

  // Salvar credencial SAP editada
  const handleSaveSapCredential = async () => {
    if (!editingSapCredential) return;
    
    setSavingSapCredential(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      const body: any = {
        display_name: sapCredentialForm.display_name,
        base_url: sapCredentialForm.base_url || null,
        sap_username: sapCredentialForm.sap_username || null,
        has_sales_order_api: sapCredentialForm.has_sales_order_api,
        has_delivery_api: sapCredentialForm.has_delivery_api,
        has_billing_api: sapCredentialForm.has_billing_api,
        has_nfe_api: sapCredentialForm.has_nfe_api,
      };

      // Só incluir senha se foi preenchida
      if (sapCredentialForm.sap_password) {
        body.sap_password = sapCredentialForm.sap_password;
      }

      const response = await fetch(`${apiUrl}/api/sap-credentials/${editingSapCredential.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao salvar');
      }

      toast({
        title: "Credencial atualizada",
        description: `${sapCredentialForm.display_name} foi atualizada com sucesso`,
      });

      setShowEditSapDialog(false);
      setEditingSapCredential(null);
      fetchSapDomains();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingSapCredential(false);
    }
  };

  // Testar conexão SAP usando o novo endpoint
  const handleTestSapConnection = async (credential: SapDomainCredential) => {
    setSapDomains(prev => 
      prev.map(c => c.id === credential.id ? { ...c, status: 'testing' as const } : c)
    );

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/sap-credentials/${credential.id}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${api.getToken()}` },
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "✅ Conexão bem sucedida!",
          description: data.message,
        });
        // Atualizar estado local com status de sucesso e timestamp
        setSapDomains(prev => 
          prev.map(c => c.id === credential.id ? { 
            ...c, 
            status: 'success' as const,
            last_test_ok: true,
            last_test_at: new Date().toISOString()
          } : c)
        );
      } else {
        toast({
          title: "❌ Falha na conexão",
          description: data.message,
          variant: "destructive",
        });
        // Atualizar estado local com status de erro
        setSapDomains(prev => 
          prev.map(c => c.id === credential.id ? { 
            ...c, 
            status: 'error' as const, 
            error: data.message,
            last_test_ok: false,
            last_test_at: new Date().toISOString()
          } : c)
        );
      }
      // Não chamar fetchSapDomains() aqui para evitar sobrescrever o estado local
    } catch (error: any) {
      toast({
        title: "Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
      setSapDomains(prev => 
        prev.map(c => c.id === credential.id ? { 
          ...c, 
          status: 'error' as const,
          last_test_ok: false,
          last_test_at: new Date().toISOString()
        } : c)
      );
    }
  };

  // Deletar credencial SAP
  const handleDeleteSapCredential = async (credential: SapDomainCredential) => {
    if (!confirm(`Tem certeza que deseja excluir "${credential.display_name}"?`)) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/sap-credentials/${credential.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${api.getToken()}` },
      });

      if (!response.ok) {
        throw new Error('Erro ao excluir');
      }

      toast({
        title: "Credencial excluída",
        description: `${credential.display_name} foi excluída`,
      });

      fetchSapDomains();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar formato
    const validFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!validFormats.includes(file.type)) {
      toast({
        title: "Formato inválido",
        description: "Use PNG, JPG, JPEG ou SVG",
        variant: "destructive",
      });
      return;
    }

    // Validar tamanho (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "Tamanho máximo: 2MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedLogoFile(file);
    
    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async (domainId: string) => {
    console.log('🚀 handleUploadLogo chamado', { 
      hasFile: !!selectedLogoFile, 
      hasUser: !!user,
      fileName: selectedLogoFile?.name,
      domainId,
      isSuperAdmin,
      isAdmin,
      userId: user?.id
    });

    if (!selectedLogoFile) {
      toast({
        title: "Erro",
        description: "Nenhum arquivo selecionado",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Erro de autenticação",
        description: "Usuário não autenticado. Faça login novamente.",
        variant: "destructive",
      });
      return;
    }

    if (!isSuperAdmin && !isAdmin) {
      toast({
        title: "Permissão negada",
        description: "Apenas administradores podem alterar logos de domínios",
        variant: "destructive",
      });
      return;
    }

    console.log('✅ Todas as validações passaram, iniciando upload...');

    setUploadingLogo(true);
    try {
      const domain = sapDomains.find(d => d.id === domainId);
      if (!domain) throw new Error("Domínio não encontrado");

      console.log('🔍 Domínio encontrado:', {
        id: domain.id,
        domain: domain.domain,
        organization_id: domain.organization_id
      });

      // Upload para storage
      const fileExt = selectedLogoFile.name.split('.').pop();
      const fileName = `${domain.organization_id}_${domain.domain.replace(/\./g, '_')}_${Date.now()}.${fileExt}`;
      
      console.log('📤 Iniciando upload para storage...', { fileName });

      // TODO: Implementar upload de arquivos no backend
      // Por enquanto, simular URL (você precisará criar endpoint /api/upload)
      const publicUrl = `/uploads/${fileName}`;
      console.log('⚠️ Upload de arquivos ainda não implementado no backend. URL simulada:', publicUrl);

      toast({
        title: "Atenção",
        description: "Upload de logos ainda não implementado. Configure o endpoint /api/upload no backend.",
        variant: "default",
      });

      // Atualizar banco de dados com URL placeholder
      await api.update('sap_domain_credentials', domainId, { logo_url: publicUrl });

      console.log('✅ Logo atualizada no banco de dados', {
        domainId,
        logo_url: publicUrl
      });

      toast({
        title: "Logo atualizada",
        description: "Logo do domínio SAP salva com sucesso",
      });

      setShowLogoDialog(false);
      setSelectedLogoFile(null);
      setLogoPreview(null);
      setSelectedDomainForLogo(null);
      fetchSapDomains();
    } catch (error: any) {
      console.error('❌ Erro completo no upload da logo:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        domainId,
        fileName: selectedLogoFile?.name
      });
      
      toast({
        title: "Erro ao fazer upload da logo",
        description: error.message || "Erro desconhecido. Verifique o console para mais detalhes.",
        variant: "destructive",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async (domainId: string) => {
    try {
      const domain = sapDomains.find(d => d.id === domainId);
      if (!domain?.logo_url) return;

      // TODO: Implementar remoção de arquivos no backend
      // Por enquanto, apenas remover referência no banco

      // Atualizar banco de dados
      await api.update('sap_domain_credentials', domainId, { logo_url: null });

      toast({
        title: "Logo removida",
        description: "Logo do domínio removida com sucesso",
      });

      fetchSapDomains();
    } catch (error: any) {
      toast({
        title: "Erro ao remover logo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUploadSpaiderLogo = async (file?: File) => {
    const logoFile = file || selectedLogoFile;
    
    console.log('🚀 handleUploadSpaiderLogo chamado', { 
      hasFile: !!logoFile, 
      hasUser: !!user,
      fileName: logoFile?.name,
      isSuperAdmin,
      userId: user?.id
    });

    // Validação: arquivo selecionado
    if (!logoFile) {
      console.error('❌ Validação falhou: arquivo não selecionado');
      toast({
        title: "Erro",
        description: "Nenhum arquivo selecionado",
        variant: "destructive",
      });
      return;
    }

    // Validação: usuário autenticado
    if (!user) {
      console.error('❌ Validação falhou: usuário não autenticado');
      toast({
        title: "Erro de autenticação",
        description: "Usuário não autenticado. Faça login novamente.",
        variant: "destructive",
      });
      return;
    }

    // Validação: permissão de super admin
    if (!isSuperAdmin) {
      console.error('❌ Validação falhou: usuário não é super admin');
      toast({
        title: "Permissão negada",
        description: "Apenas super administradores podem alterar a logo do Spaider",
        variant: "destructive",
      });
      return;
    }

    console.log('✅ Todas as validações passaram, iniciando upload...');

    setUploadingSpaiderLogo(true);
    try {
      console.log('🔄 Iniciando upload da logo do Spaider...');
      
      // Upload para storage
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `spaider_logo_${Date.now()}.${fileExt}`;
      
      console.log('📤 Fazendo upload do arquivo para storage:', { 
        fileName, 
        fileSize: logoFile.size,
        fileType: logoFile.type 
      });
      
      // TODO: Implementar upload de arquivos no backend
      // Por enquanto, simular URL (você precisará criar endpoint /api/upload)
      const publicUrl = `/uploads/${fileName}`;
      console.log('⚠️ Upload de arquivos ainda não implementado no backend. URL simulada:', publicUrl);

      toast({
        title: "Atenção",
        description: "Upload de logos ainda não implementado. Configure o endpoint /api/upload no backend.",
        variant: "default",
      });

      // Buscar organização do usuário atual
      console.log('👤 Buscando perfil do usuário...');
      const profile = await api.getProfile();

      if (!profile?.organization_id) {
        console.error('❌ Organização não encontrada no perfil');
        throw new Error('Organização não encontrada no perfil do usuário');
      }

      console.log('✅ Perfil encontrado, organization_id:', profile.organization_id);

      // Buscar todas as organizações
      console.log('🔍 Buscando todas as organizações...');
      const allOrgs = await api.query('organizations', {});

      if (!allOrgs || allOrgs.length === 0) {
        console.error('❌ Nenhuma organização encontrada no banco de dados');
        throw new Error('Nenhuma organização encontrada no banco de dados');
      }

      console.log(`✅ ${allOrgs.length} organização(ões) encontrada(s):`, allOrgs);
      console.log(`🔄 Iniciando atualização de ${allOrgs.length} organização(ões)...`);

      // Atualizar cada organização individualmente
      const updatePromises = allOrgs.map((org: any, index: number) => {
        console.log(`📝 Preparando atualização ${index + 1}/${allOrgs.length} para org:`, org);
        return api.update('organizations', org.id, { spaider_logo_url: publicUrl });
      });

      await Promise.all(updatePromises);

      console.log('✅ Todas as organizações foram atualizadas com sucesso!');

      toast({
        title: "Logo do Spaider atualizada",
        description: `Logo global salva com sucesso em ${allOrgs.length} organização(ões)`,
      });

      setSpaiderLogoUrl(publicUrl);
      setSelectedLogoFile(null);
      setLogoPreview(null);
      
      // Recarregar organizações para atualizar a UI
      console.log('🔄 Recarregando lista de organizações...');
      await fetchOrganizations();
      console.log('✅ Lista de organizações recarregada');
    } catch (error: any) {
      console.error('❌ Erro completo durante o processo:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        error
      });
      toast({
        title: "Erro ao fazer upload",
        description: error.message || "Erro desconhecido ao salvar logo. Verifique o console para mais detalhes.",
        variant: "destructive",
      });
    } finally {
      setUploadingSpaiderLogo(false);
      console.log('🏁 Processo de upload finalizado');
    }
  };

  const testSapConnection = async (credential: SapDomainCredential) => {
    console.group('🧪 SAP Connection Test');
    console.log('📋 Credential Info:', {
      id: credential.id,
      display_name: credential.display_name,
      domain: credential.domain,
      is_active: credential.is_active
    });
    
    // Verificar sessão ativa
    console.log('🔐 Verificando sessão...');
    const token = api.getToken();
    
    if (!token) {
      console.error('❌ Sessão não encontrada');
      console.groupEnd();
      toast({
        title: "Sessão expirada",
        description: "Por favor, faça login novamente",
        variant: "destructive"
      });
      navigate('/auth');
      return;
    }

    console.log('✅ Token encontrado');
    // Token JWT gerenciado pelo backend - não precisa de refresh manual

    setSapDomains(prev => 
      prev.map(c => 
        c.id === credential.id 
          ? { ...c, status: 'testing', details: undefined, error: undefined }
          : c
      )
    );

    try {
      console.log('📡 Enviando requisição para edge function...');
      console.log('📤 Payload:', {
        action: 'test-credentials',
        userId: user?.id,
        testDomain: credential.domain
      });
      
      const startTime = Date.now();
      
      // Adicionar timeout de 30 segundos
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          console.error('⏱️ Timeout: Requisição excedeu 30 segundos');
          reject(new Error('Timeout: A requisição demorou muito. Verifique as credenciais e a conexão com o SAP.'));
        }, 30000)
      );

      const invokePromise = api.invoke('sap-integration', {
        action: 'test-credentials',
        userId: user?.id,
        testDomain: credential.domain
      });

      const data = await Promise.race([invokePromise, timeoutPromise]) as any;
      
      const duration = Date.now() - startTime;
      console.log(`⏱️ Requisição completada em ${duration}ms`);
      
      console.log('📥 Resposta recebida:', data);

      setSapDomains(prev => 
        prev.map(c => 
          c.id === credential.id 
            ? { 
                ...c, 
                status: data.success ? 'success' : 'error',
                details: data.details,
                error: data.success ? undefined : data.message
              }
            : c
        )
      );

      if (data.success) {
        console.log('✅ Teste bem-sucedido:', data.details);
        console.groupEnd();
        toast({
          title: "Teste bem-sucedido",
          description: `Credenciais ${credential.display_name} validadas com sucesso`,
        });
      } else {
        console.warn('⚠️ Teste falhou:', data.message);
        console.groupEnd();
        toast({
          title: "Teste falhou",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('❌ Exceção capturada:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Mensagens de erro mais específicas
      let errorMessage = error.message || 'Erro desconhecido';
      let errorType = 'unknown';
      
      if (error.message?.includes('Failed to send')) {
        errorType = 'connection_failed';
        errorMessage = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
      } else if (error.message?.includes('Timeout')) {
        errorType = 'timeout';
        errorMessage = error.message;
      } else if (error.message?.includes('fetch')) {
        errorType = 'network_error';
        errorMessage = 'Erro de rede. Verifique sua conexão com a internet.';
      } else if (error.message?.includes('CORS')) {
        errorType = 'cors_error';
        errorMessage = 'Erro de CORS. O servidor não permite requisições desta origem.';
      }

      console.log('🔍 Diagnóstico:', {
        errorType,
        errorMessage,
        credential: credential.domain,
        timestamp: new Date().toISOString()
      });
      
      console.groupEnd();

      setSapDomains(prev => 
        prev.map(c => 
          c.id === credential.id 
            ? { ...c, status: 'error', error: errorMessage }
            : c
        )
      );
      toast({
        title: "Erro ao testar credenciais",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'testing':
        return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Testando...</Badge>;
      case 'success':
        return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Erro</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />Não testado</Badge>;
    }
  };

  const addDomain = async () => {
    const orgId = selectedOrgId;
    
    if (!orgId || !newDomain.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione uma organização e digite o domínio",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await api.create("allowed_email_domains", {
        organization_id: orgId,
        domain: newDomain.trim().toLowerCase(),
        is_active: true,
      });

      toast({
        title: "Domínio adicionado",
        description: "O domínio foi adicionado com sucesso",
      });
      setNewDomain("");
      setSelectedOrgId("");
      fetchDomains();
    } catch (error: any) {
      if (error.message.includes("duplicate")) {
        toast({
          title: "Domínio já existe",
          description: "Este domínio já foi cadastrado",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao adicionar domínio",
          description: error.message,
          variant: "destructive",
        });
      }
    }
    setLoading(false);
  };

  const toggleDomain = async (domainId: string, currentStatus: boolean) => {
    try {
      await api.update("allowed_email_domains", domainId, { is_active: !currentStatus });

      toast({
        title: "Domínio atualizado",
        description: `Domínio ${!currentStatus ? "ativado" : "desativado"} com sucesso`,
      });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar domínio",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteDomain = async (domainId: string) => {
    if (!confirm("Tem certeza que deseja excluir este domínio?")) return;

    try {
      await api.delete("allowed_email_domains", domainId);

      toast({
        title: "Domínio excluído",
        description: "O domínio foi excluído com sucesso",
      });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir domínio",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const createOrganization = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e slug são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      const data = await api.create("organizations", {
        name: newOrgName.trim(),
        slug: newOrgSlug.trim(),
      });

      toast({
        title: "Organização criada",
        description: `Organização "${newOrgName}" foi criada com sucesso`,
      });

      await fetchOrganizations();
      setSelectedOrgId(data.id);
      setIsCreatingOrg(false);
      setNewOrgName("");
      setNewOrgSlug("");
    } catch (error: any) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        toast({
          title: "Slug já existe",
          description: "Já existe uma organização com esse slug. Tente outro nome.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao criar organização",
          description: error.message,
          variant: "destructive",
        });
      }
    }
    setLoading(false);
  };

  const deleteOrganization = async (orgId: string, orgName: string) => {
    if (!confirm(`Tem certeza que deseja excluir a organização "${orgName}"?\n\nIsso irá excluir também todos os domínios, credenciais SAP e outras configurações associadas.\n\nATENÇÃO: Se houver usuários associados, a exclusão será bloqueada.`)) {
      return;
    }

    setLoading(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/organizations/${orgId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir organização');
      }

      toast({
        title: "Organização excluída",
        description: `A organização "${orgName}" foi excluída com sucesso`,
      });

      await fetchOrganizations();
      await fetchDomains();
      await fetchSapDomains();
      
      // Limpar seleção se a org deletada estava selecionada
      if (selectedOrgId === orgId) {
        setSelectedOrgId("");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir organização",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Esta página é restrita a super administradores</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Button 
        variant="ghost" 
        onClick={() => navigate("/")}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Voltar
      </Button>

      <Dialog open={isCreatingOrg} onOpenChange={setIsCreatingOrg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Organização</DialogTitle>
            <DialogDescription>
              Crie uma nova organização para adicionar domínios de email permitidos
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nome da Organização</Label>
              <Input
                id="org-name"
                placeholder="Ex: Empresa LTDA"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                disabled={loading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="org-slug">
                Slug <span className="text-muted-foreground text-sm">(identificador único)</span>
              </Label>
              <Input
                id="org-slug"
                placeholder="empresa-ltda"
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Gerado automaticamente baseado no nome. Pode ser editado.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreatingOrg(false);
                setNewOrgName("");
                setNewOrgSlug("");
              }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={createOrganization}
              disabled={loading || !newOrgName.trim() || !newOrgSlug.trim()}
            >
              {loading ? "Criando..." : "Criar Organização"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <div>
        <h1 className="text-3xl font-bold">Gerenciar Domínios e Credenciais SAP</h1>
        <p className="text-muted-foreground">
          Controle domínios de email e credenciais SAP de todas as organizações
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar Novo Domínio</CardTitle>
          <CardDescription>
            {isSuperAdmin 
              ? "Selecione a organização e digite o domínio (ex: empresa.com.br)"
              : "Digite apenas o domínio (ex: empresa.com.br)"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {isSuperAdmin && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="organization">Organização</Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a organização" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreatingOrg(true)}
                    disabled={loading}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Organização
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="domain">Domínio</Label>
                <Input
                  id="domain"
                  placeholder="empresa.com.br"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={addDomain} 
                  disabled={loading || !newDomain.trim() || (isSuperAdmin && !selectedOrgId)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Domínio
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Organizações - Apenas para Super Admin */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Organizações do Sistema</CardTitle>
            <CardDescription>
              {organizations.length} organização(ões) cadastrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {organizations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma organização cadastrada ainda
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground">{org.slug || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteOrganization(org.id, org.name)}
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {isSuperAdmin ? "Todos os Domínios do Sistema" : "Domínios Permitidos"}
          </CardTitle>
          <CardDescription>
            {domains.length} domínio(s) cadastrado(s)
            {isSuperAdmin && " em todas as organizações"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum domínio cadastrado ainda
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domínio</TableHead>
                  {isSuperAdmin && <TableHead>Organização</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-medium">{domain.domain}</TableCell>
                    {isSuperAdmin && (
                      <TableCell>{domain.organization_name}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant={domain.is_active ? "default" : "secondary"}>
                        {domain.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(domain.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleDomain(domain.id, domain.is_active)}
                      >
                        {domain.is_active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteDomain(domain.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {/* Logo do Spaider */}
        <Card>
          <CardHeader>
            <CardTitle>Logo do Spaider (Global)</CardTitle>
            <CardDescription>
              Esta logo aparecerá em todos os PDFs gerados pelo sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {spaiderLogoUrl ? (
                <div className="flex items-center gap-4">
                  <img 
                    src={spaiderLogoUrl} 
                    alt="Logo Spaider" 
                    className="h-16 w-auto object-contain border rounded p-2"
                  />
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="spaider-logo-upload" className="cursor-pointer">
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Alterar Logo
                        </span>
                      </Button>
                    </Label>
                    <Input
                      id="spaider-logo-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        handleLogoFileSelect(e);
                        if (e.target.files?.[0]) {
                          handleUploadSpaiderLogo(e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="spaider-logo-initial" className="cursor-pointer">
                    <Button variant="outline" size="sm" asChild disabled={uploadingSpaiderLogo}>
                      <span>
                        {uploadingSpaiderLogo ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Fazer Upload da Logo
                      </span>
                    </Button>
                  </Label>
                  <Input
                    id="spaider-logo-initial"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      handleLogoFileSelect(e);
                      if (e.target.files?.[0]) {
                        handleUploadSpaiderLogo(e.target.files[0]);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Formatos: PNG, JPG, SVG | Máx: 2MB
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Seção de Credenciais SAP */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Credenciais SAP</CardTitle>
              <CardDescription>
                Gerencie credenciais SAP por domínio/empresa
              </CardDescription>
            </div>
            <Button onClick={() => setShowSapForm(!showSapForm)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Credenciais SAP
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>URL Base</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSapDomains ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : sapDomains.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma credencial SAP cadastrada
                    </TableCell>
                  </TableRow>
                ) : (
                  sapDomains.map(sap => (
                    <TableRow key={sap.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sap.display_name}</p>
                          <p className="text-xs text-muted-foreground">{sap.domain}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sap.organization_name}</Badge>
                      </TableCell>
                      <TableCell>
                        {sap.base_url ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded block max-w-[200px] truncate" title={sap.base_url}>
                            {sap.base_url}
                          </code>
                        ) : (
                          <span className="text-muted-foreground text-sm">Não configurado</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sap.sap_username || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(sap.status)}
                        {sap.last_test_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(sap.last_test_at).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sap.is_active ? "default" : "secondary"}>
                          {sap.is_active ? "🟢 Ativo" : "⚫ Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleTestSapConnection(sap)}
                            disabled={sap.status === 'testing' || !sap.base_url}
                            title={!sap.base_url ? "Configure a URL primeiro" : "Testar conexão"}
                          >
                            {sap.status === 'testing' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Testar'
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditSapCredential(sap)}
                            title="Editar credenciais"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleToggleSapDomain(sap.id, sap.is_active)}
                            title={sap.is_active ? "Desativar" : "Ativar"}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteSapCredential(sap)}
                            className="text-destructive hover:text-destructive"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {sapDomains.some(s => s.status === 'error' && s.error) && (
            <div className="space-y-2">
              {sapDomains
                .filter(s => s.status === 'error' && s.error)
                .map(sap => (
                  <Alert key={sap.id} variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{sap.display_name}:</strong> {sap.error}
                    </AlertDescription>
                  </Alert>
                ))}
            </div>
          )}

          {sapDomains.some(s => s.status === 'success' && s.details) && (
            <div className="space-y-2">
              {sapDomains
                .filter(s => s.status === 'success' && s.details)
                .map(sap => (
                  <Alert key={sap.id}>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      <strong>{sap.display_name}:</strong> Conectado com sucesso
                      {sap.details?.responseTime && ` (${sap.details.responseTime}ms)`}
                    </AlertDescription>
                  </Alert>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Dialog para Criar Nova Credencial SAP */}
      <Dialog open={showSapForm} onOpenChange={(open) => { 
        setShowSapForm(open); 
        if (!open) {
          setNewSapDomain({ 
            displayName: "", 
            domain: "", 
            organizationId: "",
            base_url: "",
            sap_username: "",
            sap_password: "",
            has_sales_order_api: true,
            has_delivery_api: true,
            has_billing_api: false,
            has_nfe_api: false,
          });
          setShowNewSapPassword(false);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Nova Credencial SAP
            </DialogTitle>
            <DialogDescription>
              Configure todos os dados da conexão SAP de uma vez
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Seção 1: Identificação */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium text-sm text-muted-foreground">Identificação</h4>
              
              <div className="space-y-2">
                <Label htmlFor="new-org">Organização *</Label>
                <Select 
                  value={newSapDomain.organizationId}
                  onValueChange={(val) => setNewSapDomain({...newSapDomain, organizationId: val})}
                >
                  <SelectTrigger id="new-org">
                    <SelectValue placeholder="Selecione a organização" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-display-name">Nome da Empresa *</Label>
                  <Input
                    id="new-display-name"
                    placeholder="Ex: Teia Connect"
                    value={newSapDomain.displayName}
                    onChange={(e) => setNewSapDomain({...newSapDomain, displayName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-domain">Domínio *</Label>
                  <Input
                    id="new-domain"
                    placeholder="Ex: teiaconnect.com"
                    value={newSapDomain.domain}
                    onChange={(e) => setNewSapDomain({...newSapDomain, domain: e.target.value})}
                  />
                </div>
              </div>

              {newSapDomain.displayName && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Identificador gerado: <code className="text-xs bg-background px-2 py-1 rounded border">{generateSapSuffix(newSapDomain.displayName)}</code>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Seção 2: Conexão SAP */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium text-sm text-muted-foreground">Conexão SAP</h4>
              
              <div className="space-y-2">
                <Label htmlFor="new-base-url">URL Base do SAP</Label>
                <Input
                  id="new-base-url"
                  placeholder="Ex: https://vm57.4hub.cloud:44357"
                  value={newSapDomain.base_url}
                  onChange={(e) => setNewSapDomain({...newSapDomain, base_url: e.target.value})}
                />
                <p className="text-xs text-muted-foreground">
                  URL base sem o path da API (ex: sem "/sap/opu/odata/...")
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-sap-username">Usuário SAP</Label>
                  <Input
                    id="new-sap-username"
                    placeholder="Ex: CFARIA"
                    value={newSapDomain.sap_username}
                    onChange={(e) => setNewSapDomain({...newSapDomain, sap_username: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-sap-password">Senha SAP</Label>
                  <div className="relative">
                    <Input
                      id="new-sap-password"
                      type={showNewSapPassword ? "text" : "password"}
                      placeholder="Digite a senha"
                      value={newSapDomain.sap_password}
                      onChange={(e) => setNewSapDomain({...newSapDomain, sap_password: e.target.value})}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowNewSapPassword(!showNewSapPassword)}
                    >
                      {showNewSapPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    🔐 A senha será criptografada antes de ser salva
                  </p>
                </div>
              </div>
            </div>

            {/* Seção 3: APIs Disponíveis */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium text-sm text-muted-foreground">APIs Disponíveis</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div>
                    <p className="font-medium text-sm">Ordens de Venda</p>
                    <p className="text-xs text-muted-foreground">API_SALES_ORDER_SRV</p>
                  </div>
                  <Switch
                    checked={newSapDomain.has_sales_order_api}
                    onCheckedChange={(checked) => setNewSapDomain({...newSapDomain, has_sales_order_api: checked})}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div>
                    <p className="font-medium text-sm">Remessas</p>
                    <p className="text-xs text-muted-foreground">API_OUTBOUND_DELIVERY_SRV</p>
                  </div>
                  <Switch
                    checked={newSapDomain.has_delivery_api}
                    onCheckedChange={(checked) => setNewSapDomain({...newSapDomain, has_delivery_api: checked})}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div>
                    <p className="font-medium text-sm">Faturamento</p>
                    <p className="text-xs text-muted-foreground">Custom: createbilldoc</p>
                  </div>
                  <Switch
                    checked={newSapDomain.has_billing_api}
                    onCheckedChange={(checked) => setNewSapDomain({...newSapDomain, has_billing_api: checked})}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div>
                    <p className="font-medium text-sm">NF-e</p>
                    <p className="text-xs text-muted-foreground">Custom: NfeDocument</p>
                  </div>
                  <Switch
                    checked={newSapDomain.has_nfe_api}
                    onCheckedChange={(checked) => setNewSapDomain({...newSapDomain, has_nfe_api: checked})}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowSapForm(false);
                setNewSapDomain({ 
                  displayName: "", 
                  domain: "", 
                  organizationId: "",
                  base_url: "",
                  sap_username: "",
                  sap_password: "",
                  has_sales_order_api: true,
                  has_delivery_api: true,
                  has_billing_api: false,
                  has_nfe_api: false,
                });
                setShowNewSapPassword(false);
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleAddSapDomain} 
              disabled={savingNewSapCredential || !newSapDomain.displayName || !newSapDomain.domain || !newSapDomain.organizationId}
            >
              {savingNewSapCredential && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Credencial SAP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Edição de Credenciais SAP */}
      <Dialog open={showEditSapDialog} onOpenChange={(open) => { setShowEditSapDialog(open); if (!open) setEditingSapCredential(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Editar Credenciais SAP
            </DialogTitle>
            <DialogDescription>
              Configure a conexão com o servidor SAP para "{editingSapCredential?.display_name}"
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sap-display-name">Nome da Empresa</Label>
              <Input
                id="sap-display-name"
                value={sapCredentialForm.display_name}
                onChange={(e) => setSapCredentialForm({ ...sapCredentialForm, display_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sap-base-url">URL Base do SAP</Label>
              <Input
                id="sap-base-url"
                placeholder="Ex: https://vm57.4hub.cloud:44357"
                value={sapCredentialForm.base_url}
                onChange={(e) => setSapCredentialForm({ ...sapCredentialForm, base_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                URL base sem o path da API (ex: sem "/sap/opu/odata/...")
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sap-username">Usuário SAP</Label>
                <Input
                  id="sap-username"
                  placeholder="Ex: CFARIA"
                  value={sapCredentialForm.sap_username}
                  onChange={(e) => setSapCredentialForm({ ...sapCredentialForm, sap_username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sap-password">Senha SAP</Label>
                <div className="relative">
                  <Input
                    id="sap-password"
                    type={showSapPassword ? "text" : "password"}
                    placeholder="Deixe vazio para manter a atual"
                    value={sapCredentialForm.sap_password}
                    onChange={(e) => setSapCredentialForm({ ...sapCredentialForm, sap_password: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSapPassword(!showSapPassword)}
                  >
                    {showSapPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  🔐 A senha será criptografada antes de ser salva
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Label>APIs Disponíveis</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Ordens de Venda</p>
                    <p className="text-xs text-muted-foreground">API_SALES_ORDER_SRV</p>
                  </div>
                  <Switch
                    checked={sapCredentialForm.has_sales_order_api}
                    onCheckedChange={(checked) => setSapCredentialForm({ ...sapCredentialForm, has_sales_order_api: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Remessas</p>
                    <p className="text-xs text-muted-foreground">API_OUTBOUND_DELIVERY_SRV</p>
                  </div>
                  <Switch
                    checked={sapCredentialForm.has_delivery_api}
                    onCheckedChange={(checked) => setSapCredentialForm({ ...sapCredentialForm, has_delivery_api: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Faturamento</p>
                    <p className="text-xs text-muted-foreground">Custom: createbilldoc</p>
                  </div>
                  <Switch
                    checked={sapCredentialForm.has_billing_api}
                    onCheckedChange={(checked) => setSapCredentialForm({ ...sapCredentialForm, has_billing_api: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">NF-e</p>
                    <p className="text-xs text-muted-foreground">Custom: NfeDocument</p>
                  </div>
                  <Switch
                    checked={sapCredentialForm.has_nfe_api}
                    onCheckedChange={(checked) => setSapCredentialForm({ ...sapCredentialForm, has_nfe_api: checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditSapDialog(false); setEditingSapCredential(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSapCredential} disabled={savingSapCredential}>
              {savingSapCredential && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Upload de Logo do Domínio */}
      <Dialog open={showLogoDialog} onOpenChange={setShowLogoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Logo do Domínio</DialogTitle>
            <DialogDescription>
              Faça upload da logo para este domínio SAP. Formatos aceitos: PNG, JPG, SVG (máx. 2MB)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedDomainForLogo && sapDomains.find(d => d.id === selectedDomainForLogo)?.logo_url && (
              <div className="flex items-center justify-between p-4 border rounded">
                <div className="flex items-center gap-3">
                  <img 
                    src={sapDomains.find(d => d.id === selectedDomainForLogo)?.logo_url} 
                    alt="Logo atual" 
                    className="h-12 w-auto object-contain"
                  />
                  <span className="text-sm text-muted-foreground">Logo atual</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (selectedDomainForLogo) {
                      handleRemoveLogo(selectedDomainForLogo);
                      setShowLogoDialog(false);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover
                </Button>
              </div>
            )}

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              {logoPreview ? (
                <div className="space-y-4">
                  <img 
                    src={logoPreview} 
                    alt="Preview" 
                    className="h-24 w-auto mx-auto object-contain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedLogoFile(null);
                      setLogoPreview(null);
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Label htmlFor="logo-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Clique para selecionar</span>
                    <span className="text-xs text-muted-foreground">
                      PNG, JPG, SVG (máx. 2MB)
                    </span>
                  </div>
                </Label>
              )}
              <Input
                id="logo-upload"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                className="hidden"
                onChange={handleLogoFileSelect}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowLogoDialog(false);
                setSelectedLogoFile(null);
                setLogoPreview(null);
                setSelectedDomainForLogo(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedDomainForLogo) {
                  handleUploadLogo(selectedDomainForLogo);
                }
              }}
              disabled={!selectedLogoFile || uploadingLogo}
            >
              {uploadingLogo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Logo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Domains;
