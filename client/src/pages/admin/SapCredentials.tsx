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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Plus, Server, Eye, EyeOff, 
  Loader2, CheckCircle2, XCircle, AlertCircle, 
  Pencil, Trash2, TestTube, RefreshCw
} from "lucide-react";

interface SapCredential {
  id: string;
  domain: string;
  display_name: string;
  base_url: string | null;
  sap_username: string | null;
  has_sales_order_api: boolean;
  has_delivery_api: boolean;
  has_billing_api: boolean;
  has_nfe_api: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  // Estados locais
  testing?: boolean;
}

const SapCredentials = () => {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [credentials, setCredentials] = useState<SapCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [form, setForm] = useState({
    domain: "",
    display_name: "",
    base_url: "",
    sap_username: "",
    sap_password: "",
    has_sales_order_api: true,
    has_delivery_api: true,
    has_billing_api: false,
    has_nfe_api: false,
  });

  useEffect(() => {
    if (isAdmin || isSuperAdmin) {
      fetchCredentials();
    }
  }, [isAdmin, isSuperAdmin]);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/sap-credentials`, {
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        }
      });
      
      if (!response.ok) {
        throw new Error('Erro ao buscar credenciais');
      }
      
      const data = await response.json();
      setCredentials(data);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar credenciais",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      domain: "",
      display_name: "",
      base_url: "",
      sap_username: "",
      sap_password: "",
      has_sales_order_api: true,
      has_delivery_api: true,
      has_billing_api: false,
      has_nfe_api: false,
    });
    setEditingId(null);
    setShowPassword(false);
  };

  const handleEdit = (credential: SapCredential) => {
    setForm({
      domain: credential.domain,
      display_name: credential.display_name,
      base_url: credential.base_url || "",
      sap_username: credential.sap_username || "",
      sap_password: "", // Nunca mostramos a senha existente
      has_sales_order_api: credential.has_sales_order_api,
      has_delivery_api: credential.has_delivery_api,
      has_billing_api: credential.has_billing_api,
      has_nfe_api: credential.has_nfe_api,
    });
    setEditingId(credential.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.domain || !form.display_name) {
      toast({
        title: "Campos obrigatórios",
        description: "Domínio e Nome são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const url = editingId 
        ? `${apiUrl}/api/sap-credentials/${editingId}`
        : `${apiUrl}/api/sap-credentials`;
      
      const method = editingId ? 'PATCH' : 'POST';
      
      const body: any = {
        domain: form.domain,
        display_name: form.display_name,
        base_url: form.base_url || null,
        sap_username: form.sap_username || null,
        has_sales_order_api: form.has_sales_order_api,
        has_delivery_api: form.has_delivery_api,
        has_billing_api: form.has_billing_api,
        has_nfe_api: form.has_nfe_api,
      };

      // Só incluir senha se foi preenchida
      if (form.sap_password) {
        body.sap_password = form.sap_password;
      }

      const response = await fetch(url, {
        method,
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
        title: editingId ? "Credencial atualizada" : "Credencial criada",
        description: `${form.display_name} foi ${editingId ? 'atualizada' : 'criada'} com sucesso`,
      });

      setShowForm(false);
      resetForm();
      fetchCredentials();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${name}"?`)) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/sap-credentials/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao excluir');
      }

      toast({
        title: "Credencial excluída",
        description: `${name} foi excluída com sucesso`,
      });

      fetchCredentials();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTest = async (credential: SapCredential) => {
    // Atualizar estado para "testando"
    setCredentials(prev => 
      prev.map(c => c.id === credential.id ? { ...c, testing: true } : c)
    );

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/sap-credentials/${credential.id}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "✅ Conexão bem sucedida!",
          description: data.message,
        });
      } else {
        toast({
          title: "❌ Falha na conexão",
          description: data.message,
          variant: "destructive",
        });
      }

      // Recarregar para atualizar status
      fetchCredentials();
    } catch (error: any) {
      toast({
        title: "Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
      
      setCredentials(prev => 
        prev.map(c => c.id === credential.id ? { ...c, testing: false } : c)
      );
    }
  };

  const getStatusBadge = (credential: SapCredential) => {
    if (credential.testing) {
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Testando...
        </Badge>
      );
    }
    
    if (credential.last_test_at === null) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Não testado
        </Badge>
      );
    }
    
    if (credential.last_test_ok) {
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Conectado
        </Badge>
      );
    }
    
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Erro
      </Badge>
    );
  };

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Esta página é restrita a administradores</CardDescription>
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="h-8 w-8" />
            Credenciais SAP
          </h1>
          <p className="text-muted-foreground">
            Gerencie conexões com servidores SAP
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchCredentials} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Credencial
          </Button>
        </div>
      </div>

      {/* Formulário */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Credencial SAP" : "Nova Credencial SAP"}
            </DialogTitle>
            <DialogDescription>
              Configure a conexão com o servidor SAP
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="display_name">Nome da Empresa *</Label>
                <Input
                  id="display_name"
                  placeholder="Ex: Teia Connect"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domínio *</Label>
                <Input
                  id="domain"
                  placeholder="Ex: teiaconnect"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  disabled={!!editingId}
                />
                <p className="text-xs text-muted-foreground">
                  Identificador único (não pode ser alterado depois)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_url">URL Base do SAP</Label>
              <Input
                id="base_url"
                placeholder="Ex: https://vm57.4hub.cloud:44357"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                URL base sem o path da API (será adicionado automaticamente)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sap_username">Usuário SAP</Label>
                <Input
                  id="sap_username"
                  placeholder="Ex: CFARIA"
                  value={form.sap_username}
                  onChange={(e) => setForm({ ...form, sap_username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sap_password">Senha SAP</Label>
                <div className="relative">
                  <Input
                    id="sap_password"
                    type={showPassword ? "text" : "password"}
                    placeholder={editingId ? "Deixe vazio para manter" : "Digite a senha"}
                    value={form.sap_password}
                    onChange={(e) => setForm({ ...form, sap_password: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                    checked={form.has_sales_order_api}
                    onCheckedChange={(checked) => setForm({ ...form, has_sales_order_api: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Remessas</p>
                    <p className="text-xs text-muted-foreground">API_OUTBOUND_DELIVERY_SRV</p>
                  </div>
                  <Switch
                    checked={form.has_delivery_api}
                    onCheckedChange={(checked) => setForm({ ...form, has_delivery_api: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Faturamento</p>
                    <p className="text-xs text-muted-foreground">Custom: createbilldoc</p>
                  </div>
                  <Switch
                    checked={form.has_billing_api}
                    onCheckedChange={(checked) => setForm({ ...form, has_billing_api: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">NF-e</p>
                    <p className="text-xs text-muted-foreground">Custom: NfeDocument</p>
                  </div>
                  <Switch
                    checked={form.has_nfe_api}
                    onCheckedChange={(checked) => setForm({ ...form, has_nfe_api: checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salvar Alterações" : "Criar Credencial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lista de Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle>Credenciais Cadastradas</CardTitle>
          <CardDescription>
            {credentials.length} credencial(is) configurada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma credencial cadastrada ainda</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => { resetForm(); setShowForm(true); }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar primeira credencial
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>URL Base</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>APIs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((cred) => (
                  <TableRow key={cred.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{cred.display_name}</p>
                        <p className="text-xs text-muted-foreground">{cred.domain}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {cred.base_url || "Não configurado"}
                      </code>
                    </TableCell>
                    <TableCell>{cred.sap_username || "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {cred.has_sales_order_api && <Badge variant="outline" className="text-xs">Vendas</Badge>}
                        {cred.has_delivery_api && <Badge variant="outline" className="text-xs">Remessa</Badge>}
                        {cred.has_billing_api && <Badge variant="outline" className="text-xs">Fatura</Badge>}
                        {cred.has_nfe_api && <Badge variant="outline" className="text-xs">NF-e</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(cred)}
                      {cred.last_test_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(cred.last_test_at).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cred.is_active ? "default" : "secondary"}>
                        {cred.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(cred)}
                          disabled={cred.testing || !cred.base_url}
                          title={!cred.base_url ? "Configure a URL primeiro" : "Testar conexão"}
                        >
                          {cred.testing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(cred)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(cred.id, cred.display_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SapCredentials;

