import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Users, Globe, Plus, Trash2, Pencil, Loader2 } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  ai_instructions: string | null;
  created_at: string;
}

interface Domain {
  id: string;
  domain: string;
  organization_id: string;
  is_active: boolean;
  organization_name?: string;
}

const SuperAdmin = () => {
  const { isSuperAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  // Estados para o modal de organização
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: "",
    slug: "",
    logo_url: "",
    primary_color: "#6366f1",
    secondary_color: "#8b5cf6",
    ai_instructions: "",
  });

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      navigate("/");
    }
  }, [isSuperAdmin, loading, navigate]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchData();
    }
  }, [isSuperAdmin]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch organizations
      const orgsData = await api.query("organizations", {
        orderBy: "name.asc"
      });
      setOrganizations(orgsData || []);

      // Fetch domains
      const domainsData = await api.query("allowed_email_domains", {
        orderBy: "domain.asc"
      });

      // Buscar nomes das organizações para cada domínio
      const domainsWithOrgName = await Promise.all(
        (domainsData || []).map(async (d: any) => {
          try {
            const org = await api.get("organizations", d.organization_id);
            return {
              ...d,
              organization_name: org?.name
            };
          } catch {
            return {
              ...d,
              organization_name: "N/A"
            };
          }
        })
      );
      
      setDomains(domainsWithOrgName);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const resetOrgForm = () => {
    setOrgForm({
      name: "",
      slug: "",
      logo_url: "",
      primary_color: "#6366f1",
      secondary_color: "#8b5cf6",
      ai_instructions: "",
    });
    setEditingOrg(null);
  };

  const handleNewOrg = () => {
    resetOrgForm();
    setShowOrgDialog(true);
  };

  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setOrgForm({
      name: org.name,
      slug: org.slug,
      logo_url: org.logo_url || "",
      primary_color: org.primary_color || "#6366f1",
      secondary_color: org.secondary_color || "#8b5cf6",
      ai_instructions: org.ai_instructions || "",
    });
    setShowOrgDialog(true);
  };

  const handleSaveOrg = async () => {
    if (!orgForm.name || !orgForm.slug) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e Slug são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const url = editingOrg 
        ? `${apiUrl}/api/organizations/${editingOrg.id}`
        : `${apiUrl}/api/organizations`;
      
      const method = editingOrg ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getToken()}`,
        },
        body: JSON.stringify({
          name: orgForm.name,
          slug: orgForm.slug,
          logo_url: orgForm.logo_url || null,
          primary_color: orgForm.primary_color,
          secondary_color: orgForm.secondary_color,
          ai_instructions: orgForm.ai_instructions || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao salvar');
      }

      toast({
        title: editingOrg ? "Organização atualizada" : "Organização criada",
        description: `${orgForm.name} foi ${editingOrg ? 'atualizada' : 'criada'} com sucesso`,
      });

      setShowOrgDialog(false);
      resetOrgForm();
      fetchData();
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

  const handleDeleteOrg = async (org: Organization) => {
    if (!confirm(`Tem certeza que deseja excluir a organização "${org.name}"?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/organizations/${org.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${api.getToken()}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao excluir');
      }

      toast({
        title: "Organização excluída",
        description: `${org.name} foi excluída com sucesso`,
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="destructive" className="text-xs">SUPER ADMIN</Badge>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Gerenciamento do Sistema</h1>
          <p className="text-muted-foreground">Controle total de organizações, domínios e configurações</p>
        </div>

        {/* Dialog para criar/editar organização */}
        <Dialog open={showOrgDialog} onOpenChange={(open) => { setShowOrgDialog(open); if (!open) resetOrgForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingOrg ? "Editar Organização" : "Nova Organização"}
              </DialogTitle>
              <DialogDescription>
                {editingOrg ? "Atualize os dados da organização" : "Crie uma nova organização no sistema"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Nome *</Label>
                  <Input
                    id="org-name"
                    placeholder="Ex: Empresa LTDA"
                    value={orgForm.name}
                    onChange={(e) => {
                      setOrgForm({ 
                        ...orgForm, 
                        name: e.target.value,
                        slug: editingOrg ? orgForm.slug : generateSlug(e.target.value)
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-slug">Slug *</Label>
                  <Input
                    id="org-slug"
                    placeholder="empresa-ltda"
                    value={orgForm.slug}
                    onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value })}
                    disabled={!!editingOrg}
                  />
                  {editingOrg && (
                    <p className="text-xs text-muted-foreground">O slug não pode ser alterado</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-logo">URL do Logo</Label>
                <Input
                  id="org-logo"
                  placeholder="https://..."
                  value={orgForm.logo_url}
                  onChange={(e) => setOrgForm({ ...orgForm, logo_url: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org-primary">Cor Primária</Label>
                  <div className="flex gap-2">
                    <Input
                      id="org-primary"
                      type="color"
                      value={orgForm.primary_color}
                      onChange={(e) => setOrgForm({ ...orgForm, primary_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={orgForm.primary_color}
                      onChange={(e) => setOrgForm({ ...orgForm, primary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-secondary">Cor Secundária</Label>
                  <div className="flex gap-2">
                    <Input
                      id="org-secondary"
                      type="color"
                      value={orgForm.secondary_color}
                      onChange={(e) => setOrgForm({ ...orgForm, secondary_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={orgForm.secondary_color}
                      onChange={(e) => setOrgForm({ ...orgForm, secondary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-ai">Instruções para IA</Label>
                <Textarea
                  id="org-ai"
                  placeholder="Instruções personalizadas para o assistente de IA..."
                  value={orgForm.ai_instructions}
                  onChange={(e) => setOrgForm({ ...orgForm, ai_instructions: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowOrgDialog(false); resetOrgForm(); }}>
                Cancelar
              </Button>
              <Button onClick={handleSaveOrg} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingOrg ? "Salvar Alterações" : "Criar Organização"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="organizations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="organizations">
              <Building2 className="h-4 w-4 mr-2" />
              Organizações
            </TabsTrigger>
            <TabsTrigger value="domains">
              <Globe className="h-4 w-4 mr-2" />
              Domínios
            </TabsTrigger>
            <TabsTrigger value="stats">
              <Users className="h-4 w-4 mr-2" />
              Estatísticas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Organizações</CardTitle>
                    <CardDescription>Gerenciar todas as organizações do sistema</CardDescription>
                  </div>
                  <Button onClick={handleNewOrg}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Organização
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Cores</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {org.logo_url && (
                              <img src={org.logo_url} alt={org.name} className="h-6 w-6 object-contain" />
                            )}
                            {org.name}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{org.slug}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <div 
                              className="w-6 h-6 rounded border" 
                              style={{ backgroundColor: org.primary_color || "#6366f1" }}
                              title={`Primária: ${org.primary_color}`}
                            />
                            <div 
                              className="w-6 h-6 rounded border" 
                              style={{ backgroundColor: org.secondary_color || "#8b5cf6" }}
                              title={`Secundária: ${org.secondary_color}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell>{new Date(org.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditOrg(org)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteOrg(org)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="domains" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Domínios de Email Permitidos</CardTitle>
                    <CardDescription>Gerenciar domínios permitidos para todas as organizações</CardDescription>
                  </div>
                  <Button onClick={() => navigate('/admin/domains')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Gerenciar Domínios
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domínio</TableHead>
                      <TableHead>Organização</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((domain) => (
                      <TableRow key={domain.id}>
                        <TableCell className="font-mono font-medium">{domain.domain}</TableCell>
                        <TableCell>{domain.organization_name}</TableCell>
                        <TableCell>
                          {domain.is_active ? (
                            <Badge variant="default">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total de Organizações</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{organizations.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Domínios Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {domains.filter(d => d.is_active).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total de Domínios</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{domains.length}</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SuperAdmin;
