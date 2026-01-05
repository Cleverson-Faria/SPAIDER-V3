import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Power, PowerOff, ArrowLeft, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Characteristic {
  id: string;
  name: string;
  code: string;
}

interface ReferenceOrder {
  id: string;
  order_number: string;
  domain: string | null;
  sap_doc_type: string | null;
  warehouse_code: string | null;
  order_type: string;
  is_active: boolean;
  created_at: string;
  characteristic_1_id: string;
  characteristic_2_id: string | null;
  characteristic_3_id: string | null;
  supports_contract: boolean;
  supports_quotation: boolean;
  supports_sales_order: boolean;
  supports_delivery: boolean;
  supports_invoice: boolean;
  supports_fiscal_note: boolean;
  contract_reference?: string | null;
  quotation_reference?: string | null;
  delivery_reference?: string | null;
  invoice_reference?: string | null;
  docnum_reference?: string | null;
  characteristic_1?: Characteristic;
  characteristic_2?: Characteristic;
  characteristic_3?: Characteristic;
}

export default function ReferenceOrders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<ReferenceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userDomain, setUserDomain] = useState<string>("");

  // Characteristics data
  const [level1Options, setLevel1Options] = useState<Characteristic[]>([]);
  const [level2Options, setLevel2Options] = useState<Characteristic[]>([]);
  const [level3Options, setLevel3Options] = useState<Characteristic[]>([]);

  const [newOrder, setNewOrder] = useState({
    order_number: "",
    sap_doc_type: "",
    warehouse_code: "",
    order_type: "venda_normal",
    characteristic_1_id: "",
    characteristic_2_id: "",
    characteristic_3_id: "",
    supports_contract: false,
    supports_quotation: false,
    supports_sales_order: true,
    supports_delivery: false,
    supports_invoice: false,
    supports_fiscal_note: false,
    contract_reference: "",
    quotation_reference: "",
    delivery_reference: "",
    invoice_reference: "",
    docnum_reference: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    order_number: "",
    sap_doc_type: "",
    warehouse_code: "",
    order_type: "venda_normal",
    characteristic_1_id: "",
    characteristic_2_id: "",
    characteristic_3_id: "",
    supports_contract: false,
    supports_quotation: false,
    supports_sales_order: true,
    supports_delivery: false,
    supports_invoice: false,
    supports_fiscal_note: false,
    contract_reference: "",
    quotation_reference: "",
    delivery_reference: "",
    invoice_reference: "",
    docnum_reference: "",
  });

  const validateReferenceFields = (form: typeof newOrder): string | null => {
    if (form.supports_sales_order && !form.order_number.trim()) {
      return "Ordem Referência é obrigatória quando Ordem de Vendas está habilitada";
    }
    if (form.supports_contract && !form.contract_reference?.trim()) {
      return "Contrato Referência é obrigatório quando Contrato está habilitado";
    }
    if (form.supports_quotation && !form.quotation_reference?.trim()) {
      return "Cotação Referência é obrigatória quando Cotação está habilitada";
    }
    if (form.supports_delivery && !form.delivery_reference?.trim()) {
      return "Remessa Referência é obrigatória quando Remessa está habilitada";
    }
    if (form.supports_invoice && !form.invoice_reference?.trim()) {
      return "Fatura Referência é obrigatória quando Fatura está habilitada";
    }
    if (form.supports_fiscal_note && !form.docnum_reference?.trim()) {
      return "DOCNUM Referência é obrigatório quando Nota Fiscal está habilitada";
    }
    return null;
  };

  useEffect(() => {
    if (!authLoading) {
      checkAccess();
    }
  }, [authLoading]);

  const checkAccess = async () => {
    try {
      // Só continua se não estiver carregando E se for admin
      if (authLoading || !isAdmin) {
        return; // Silenciosamente retorna, deixa o render condicional tratar
      }

      const profile = await api.getProfile();
      if (!profile) {
        navigate("/auth");
        return;
      }

      setOrganizationId(profile.organization_id);
      const domain = profile.email.split('@')[1];
      setUserDomain(domain);

      await Promise.all([
        fetchOrders(profile.organization_id),
        fetchCharacteristics(),
      ]);
    } catch (error) {
      console.error("Error checking access:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const fetchCharacteristics = async () => {
    const [l1, l2, l3] = await Promise.all([
      api.query("characteristic_level_1", { where: { is_active: true }, orderBy: "name.asc" }),
      api.query("characteristic_level_2", { where: { is_active: true }, orderBy: "name.asc" }),
      api.query("characteristic_level_3", { where: { is_active: true }, orderBy: "name.asc" }),
    ]);

    if (l1) setLevel1Options(l1);
    if (l2) setLevel2Options(l2);
    if (l3) setLevel3Options(l3);
  };

  const fetchOrders = async (orgId: string) => {
    try {
      const data = await api.query("reference_orders", {
        where: { organization_id: orgId },
        orderBy: "created_at.desc"
      });

      // Buscar características para cada ordem
      const ordersWithChars = await Promise.all(
        (data || []).map(async (order: any) => {
          const [char1, char2, char3] = await Promise.all([
            order.characteristic_1_id ? api.get("characteristic_level_1", order.characteristic_1_id).catch(() => null) : null,
            order.characteristic_2_id ? api.get("characteristic_level_2", order.characteristic_2_id).catch(() => null) : null,
            order.characteristic_3_id ? api.get("characteristic_level_3", order.characteristic_3_id).catch(() => null) : null,
          ]);
          return {
            ...order,
            characteristic_1: char1,
            characteristic_2: char2,
            characteristic_3: char3,
          };
        })
      );

      setOrders(ordersWithChars);
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      toast({
        title: "Erro ao carregar ordens",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addOrder = async () => {
    if (!newOrder.characteristic_1_id || !organizationId) {
      toast({
        title: "Erro",
        description: "Característica 1 é obrigatória",
        variant: "destructive",
      });
      return;
    }

    const validationError = validateReferenceFields(newOrder);
    if (validationError) {
      toast({
        title: "Erro de Validação",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    const profile = await api.getProfile();

    await api.create("reference_orders", {
      order_number: newOrder.order_number,
      domain: userDomain,
      sap_doc_type: newOrder.sap_doc_type || null,
      warehouse_code: newOrder.warehouse_code || null,
      order_type: newOrder.order_type,
      characteristic_1_id: newOrder.characteristic_1_id,
      characteristic_2_id: newOrder.characteristic_2_id === "none" ? null : (newOrder.characteristic_2_id || null),
      characteristic_3_id: newOrder.characteristic_3_id === "none" ? null : (newOrder.characteristic_3_id || null),
      supports_contract: newOrder.supports_contract,
      supports_quotation: newOrder.supports_quotation,
      supports_sales_order: newOrder.supports_sales_order,
      supports_delivery: newOrder.supports_delivery,
      supports_invoice: newOrder.supports_invoice,
      supports_fiscal_note: newOrder.supports_fiscal_note,
      contract_reference: newOrder.contract_reference || null,
      quotation_reference: newOrder.quotation_reference || null,
      delivery_reference: newOrder.delivery_reference || null,
      invoice_reference: newOrder.invoice_reference || null,
      docnum_reference: newOrder.docnum_reference || null,
      organization_id: organizationId,
      created_by: profile?.id,
    });
    const error = null; // Para manter compatibilidade com o código existente

    if (error) {
      toast({
        title: "Erro ao adicionar ordem",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Ordem adicionada",
      description: `Ordem ${newOrder.order_number} foi adicionada com sucesso`,
    });

    setNewOrder({
      order_number: "",
      sap_doc_type: "",
      warehouse_code: "",
      order_type: "venda_normal",
      characteristic_1_id: "",
      characteristic_2_id: "",
      characteristic_3_id: "",
      supports_contract: false,
      supports_quotation: false,
      supports_sales_order: true,
      supports_delivery: false,
      supports_invoice: false,
      supports_fiscal_note: false,
      contract_reference: "",
      quotation_reference: "",
      delivery_reference: "",
      invoice_reference: "",
      docnum_reference: "",
    });
    if (organizationId) await fetchOrders(organizationId);
  };

  const toggleOrder = async (id: string, currentStatus: boolean) => {
    try {
      await api.update("reference_orders", id, { is_active: !currentStatus });

      toast({
        title: "Status atualizado",
        description: `Ordem ${!currentStatus ? "ativada" : "desativada"} com sucesso`,
      });

      if (organizationId) await fetchOrders(organizationId);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteOrder = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta ordem de referência?")) return;

    let error = null;
    try {
      await api.delete("reference_orders", id);
    } catch (e: any) {
      error = e;
    }

    if (error) {
      toast({
        title: "Erro ao excluir ordem",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Ordem excluída",
      description: "Ordem de referência excluída com sucesso",
    });

    if (organizationId) await fetchOrders(organizationId);
  };

  const startEdit = (order: ReferenceOrder) => {
    setEditingId(order.id);
    setEditForm({
      order_number: order.order_number,
      sap_doc_type: order.sap_doc_type || "",
      warehouse_code: order.warehouse_code || "",
      order_type: order.order_type || "venda_normal",
      characteristic_1_id: order.characteristic_1_id,
      characteristic_2_id: order.characteristic_2_id || "none",
      characteristic_3_id: order.characteristic_3_id || "none",
      supports_contract: order.supports_contract,
      supports_quotation: order.supports_quotation,
      supports_sales_order: order.supports_sales_order,
      supports_delivery: order.supports_delivery,
      supports_invoice: order.supports_invoice,
      supports_fiscal_note: order.supports_fiscal_note,
      contract_reference: order.contract_reference || "",
      quotation_reference: order.quotation_reference || "",
      delivery_reference: order.delivery_reference || "",
      invoice_reference: order.invoice_reference || "",
      docnum_reference: order.docnum_reference || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      order_number: "",
      sap_doc_type: "",
      warehouse_code: "",
      order_type: "venda_normal",
      characteristic_1_id: "",
      characteristic_2_id: "",
      characteristic_3_id: "",
      supports_contract: false,
      supports_quotation: false,
      supports_sales_order: true,
      supports_delivery: false,
      supports_invoice: false,
      supports_fiscal_note: false,
      contract_reference: "",
      quotation_reference: "",
      delivery_reference: "",
      invoice_reference: "",
      docnum_reference: "",
    });
  };

  const updateOrder = async () => {
    if (!editForm.order_number.trim() || !editForm.characteristic_1_id || !editingId) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.update("reference_orders", editingId, {
        order_number: editForm.order_number,
        sap_doc_type: editForm.sap_doc_type || null,
        warehouse_code: editForm.warehouse_code || null,
        order_type: editForm.order_type,
        characteristic_1_id: editForm.characteristic_1_id,
        characteristic_2_id: editForm.characteristic_2_id === "none" ? null : (editForm.characteristic_2_id || null),
        characteristic_3_id: editForm.characteristic_3_id === "none" ? null : (editForm.characteristic_3_id || null),
        supports_contract: editForm.supports_contract,
        supports_quotation: editForm.supports_quotation,
        supports_sales_order: editForm.supports_sales_order,
        supports_delivery: editForm.supports_delivery,
        supports_invoice: editForm.supports_invoice,
        supports_fiscal_note: editForm.supports_fiscal_note,
        contract_reference: editForm.contract_reference || null,
        quotation_reference: editForm.quotation_reference || null,
        delivery_reference: editForm.delivery_reference || null,
        invoice_reference: editForm.invoice_reference || null,
        docnum_reference: editForm.docnum_reference || null,
      });

      toast({
        title: "Ordem atualizada",
        description: "Alterações salvas com sucesso",
      });

      setEditingId(null);
      if (organizationId) await fetchOrders(organizationId);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Acesso negado. Esta página é restrita a administradores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/characteristics")}>
          Gerenciar Características
        </Button>
      </div>
      
      <div>
        <h1 className="text-3xl font-bold mb-2">Ordens de Referência</h1>
        <p className="text-muted-foreground">
          Configure ordens de referência com até 3 níveis de características
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar Nova Ordem</CardTitle>
          <CardDescription>
            Domínio: {userDomain} (detectado automaticamente)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="sap_doc_type">Tipo doc. vendas</Label>
              <Input
                id="sap_doc_type"
                placeholder="Ex: ZBV2"
                value={newOrder.sap_doc_type}
                onChange={(e) => setNewOrder({ ...newOrder, sap_doc_type: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="char_1">Característica 1 *</Label>
              <Select value={newOrder.characteristic_1_id} onValueChange={(v) => setNewOrder({ ...newOrder, characteristic_1_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {level1Options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="char_2">Característica 2</Label>
              <Select value={newOrder.characteristic_2_id} onValueChange={(v) => setNewOrder({ ...newOrder, characteristic_2_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {level2Options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="char_3">Característica 3</Label>
              <Select value={newOrder.characteristic_3_id} onValueChange={(v) => setNewOrder({ ...newOrder, characteristic_3_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {level3Options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="order_number">
                Ordem Referência {newOrder.supports_sales_order && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="order_number"
                placeholder="Ex: 8437"
                value={newOrder.order_number}
                onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })}
                disabled={!newOrder.supports_sales_order}
                className={!newOrder.supports_sales_order ? "bg-muted" : ""}
              />
            </div>

            {newOrder.supports_contract && (
              <div>
                <Label htmlFor="contract_reference">
                  Contrato Referência <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contract_reference"
                  placeholder="Ex: CONT-001"
                  value={newOrder.contract_reference}
                  onChange={(e) => setNewOrder({ ...newOrder, contract_reference: e.target.value })}
                />
              </div>
            )}

            {newOrder.supports_quotation && (
              <div>
                <Label htmlFor="quotation_reference">
                  Cotação Referência <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="quotation_reference"
                  placeholder="Ex: COT-001"
                  value={newOrder.quotation_reference}
                  onChange={(e) => setNewOrder({ ...newOrder, quotation_reference: e.target.value })}
                />
              </div>
            )}

            {newOrder.supports_delivery && (
              <div>
                <Label htmlFor="delivery_reference">
                  Remessa Referência <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="delivery_reference"
                  placeholder="Ex: REM-001"
                  value={newOrder.delivery_reference}
                  onChange={(e) => setNewOrder({ ...newOrder, delivery_reference: e.target.value })}
                />
              </div>
            )}

            {newOrder.supports_invoice && (
              <div>
                <Label htmlFor="invoice_reference">
                  Fatura Referência <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="invoice_reference"
                  placeholder="Ex: FAT-001"
                  value={newOrder.invoice_reference}
                  onChange={(e) => setNewOrder({ ...newOrder, invoice_reference: e.target.value })}
                />
              </div>
            )}

            {newOrder.supports_fiscal_note && (
              <div>
                <Label htmlFor="docnum_reference">
                  DOCNUM Referência <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="docnum_reference"
                  placeholder="Ex: 000123456"
                  value={newOrder.docnum_reference}
                  onChange={(e) => setNewOrder({ ...newOrder, docnum_reference: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label htmlFor="warehouse">Depósito</Label>
              <Input
                id="warehouse"
                placeholder="Ex: 141A"
                value={newOrder.warehouse_code}
                onChange={(e) => setNewOrder({ ...newOrder, warehouse_code: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="order_type">Tipo de Venda *</Label>
              <Select 
                value={newOrder.order_type} 
                onValueChange={(v) => setNewOrder({ ...newOrder, order_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="venda_normal">Venda Normal</SelectItem>
                  <SelectItem value="venda_futura">Venda Entrega Futura</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Tipos de documento suportados</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="contract" checked={newOrder.supports_contract} onCheckedChange={(c) => setNewOrder({ ...newOrder, supports_contract: !!c })} />
                <label htmlFor="contract" className="text-sm cursor-pointer">Contrato</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="quotation" checked={newOrder.supports_quotation} onCheckedChange={(c) => setNewOrder({ ...newOrder, supports_quotation: !!c })} />
                <label htmlFor="quotation" className="text-sm cursor-pointer">Cotação</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="sales" checked={newOrder.supports_sales_order} onCheckedChange={(c) => setNewOrder({ ...newOrder, supports_sales_order: !!c })} />
                <label htmlFor="sales" className="text-sm cursor-pointer">Ordem de Vendas</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="delivery" checked={newOrder.supports_delivery} onCheckedChange={(c) => setNewOrder({ ...newOrder, supports_delivery: !!c })} />
                <label htmlFor="delivery" className="text-sm cursor-pointer">Remessa</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="invoice" checked={newOrder.supports_invoice} onCheckedChange={(c) => setNewOrder({ ...newOrder, supports_invoice: !!c })} />
                <label htmlFor="invoice" className="text-sm cursor-pointer">Fatura</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="fiscal" checked={newOrder.supports_fiscal_note} onCheckedChange={(c) => setNewOrder({ ...newOrder, supports_fiscal_note: !!c })} />
                <label htmlFor="fiscal" className="text-sm cursor-pointer">Nota Fiscal</label>
              </div>
            </div>
          </div>

          <Button onClick={addOrder}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Ordem
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ordens Cadastradas</CardTitle>
          <CardDescription>{orders.length} ordem(ns) cadastrada(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma ordem cadastrada. Configure as características primeiro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SAP Doc</TableHead>
                    <TableHead>Característica 1</TableHead>
                    <TableHead>Característica 2</TableHead>
                    <TableHead>Característica 3</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Referências</TableHead>
                    <TableHead>Depósito</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.sap_doc_type || "-"}</TableCell>
                      <TableCell className="font-medium">{order.characteristic_1?.name}</TableCell>
                      <TableCell className="text-muted-foreground">{order.characteristic_2?.name || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{order.characteristic_3?.name || "-"}</TableCell>
                      <TableCell className="font-mono">{order.order_number}</TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          {order.supports_sales_order && order.order_number && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">OV:</span>
                              <span className="text-muted-foreground">{order.order_number}</span>
                            </div>
                          )}
                          {order.supports_contract && order.contract_reference && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Contrato:</span>
                              <span className="text-muted-foreground">{order.contract_reference}</span>
                            </div>
                          )}
                          {order.supports_quotation && order.quotation_reference && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Cotação:</span>
                              <span className="text-muted-foreground">{order.quotation_reference}</span>
                            </div>
                          )}
                          {order.supports_delivery && order.delivery_reference && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Remessa:</span>
                              <span className="text-muted-foreground">{order.delivery_reference}</span>
                            </div>
                          )}
                          {order.supports_invoice && order.invoice_reference && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Fatura:</span>
                              <span className="text-muted-foreground">{order.invoice_reference}</span>
                            </div>
                          )}
                          {order.supports_fiscal_note && order.docnum_reference && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">DOCNUM:</span>
                              <span className="text-muted-foreground">{order.docnum_reference}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{order.warehouse_code || "-"}</TableCell>
                      <TableCell>
                        {order.is_active ? (
                          <span className="text-green-600 font-medium">Ativa</span>
                        ) : (
                          <span className="text-muted-foreground">Inativa</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(order)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleOrder(order.id, order.is_active)}>
                            {order.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteOrder(order.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          💡 <strong>Dica:</strong> Configure nomes intuitivos nas características para facilitar a identificação pela IA. Ex: "Venda B2B" ao invés de códigos técnicos.
        </AlertDescription>
      </Alert>

      {/* Modal de Edição */}
      <Dialog open={editingId !== null} onOpenChange={(open) => !open && cancelEdit()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Ordem de Referência</DialogTitle>
            <DialogDescription>
              Modifique os campos abaixo e clique em "Salvar Alterações"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="edit_sap_doc_type">Tipo doc. vendas</Label>
                <Input
                  id="edit_sap_doc_type"
                  placeholder="Ex: ZBV2"
                  value={editForm.sap_doc_type}
                  onChange={(e) => setEditForm({ ...editForm, sap_doc_type: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="edit_char_1">Característica 1 *</Label>
                <Select value={editForm.characteristic_1_id} onValueChange={(v) => setEditForm({ ...editForm, characteristic_1_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {level1Options.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit_char_2">Característica 2</Label>
                <Select value={editForm.characteristic_2_id} onValueChange={(v) => setEditForm({ ...editForm, characteristic_2_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {level2Options.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit_char_3">Característica 3</Label>
                <Select value={editForm.characteristic_3_id} onValueChange={(v) => setEditForm({ ...editForm, characteristic_3_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {level3Options.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_order_number">
                  Ordem Referência {editForm.supports_sales_order && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="edit_order_number"
                  placeholder="Ex: 8437"
                  value={editForm.order_number}
                  onChange={(e) => setEditForm({ ...editForm, order_number: e.target.value })}
                  disabled={!editForm.supports_sales_order}
                  className={!editForm.supports_sales_order ? "bg-muted" : ""}
                />
              </div>

              {editForm.supports_contract && (
                <div>
                  <Label htmlFor="edit_contract_reference">
                    Contrato Referência <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_contract_reference"
                    placeholder="Ex: CONT-001"
                    value={editForm.contract_reference}
                    onChange={(e) => setEditForm({ ...editForm, contract_reference: e.target.value })}
                  />
                </div>
              )}

              {editForm.supports_quotation && (
                <div>
                  <Label htmlFor="edit_quotation_reference">
                    Cotação Referência <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_quotation_reference"
                    placeholder="Ex: COT-001"
                    value={editForm.quotation_reference}
                    onChange={(e) => setEditForm({ ...editForm, quotation_reference: e.target.value })}
                  />
                </div>
              )}

              {editForm.supports_delivery && (
                <div>
                  <Label htmlFor="edit_delivery_reference">
                    Remessa Referência <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_delivery_reference"
                    placeholder="Ex: REM-001"
                    value={editForm.delivery_reference}
                    onChange={(e) => setEditForm({ ...editForm, delivery_reference: e.target.value })}
                  />
                </div>
              )}

              {editForm.supports_invoice && (
                <div>
                  <Label htmlFor="edit_invoice_reference">
                    Fatura Referência <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_invoice_reference"
                    placeholder="Ex: FAT-001"
                    value={editForm.invoice_reference}
                    onChange={(e) => setEditForm({ ...editForm, invoice_reference: e.target.value })}
                  />
                </div>
              )}

              {editForm.supports_fiscal_note && (
                <div>
                  <Label htmlFor="edit_docnum_reference">
                    DOCNUM Referência <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit_docnum_reference"
                    placeholder="Ex: 000123456"
                    value={editForm.docnum_reference}
                    onChange={(e) => setEditForm({ ...editForm, docnum_reference: e.target.value })}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="edit_warehouse">Depósito</Label>
                <Input
                  id="edit_warehouse"
                  placeholder="Ex: 141A"
                  value={editForm.warehouse_code}
                  onChange={(e) => setEditForm({ ...editForm, warehouse_code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_order_type">Tipo de Venda *</Label>
                <Select 
                  value={editForm.order_type} 
                  onValueChange={(v) => setEditForm({ ...editForm, order_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venda_normal">Venda Normal</SelectItem>
                    <SelectItem value="venda_futura">Venda Entrega Futura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Tipos de documento suportados</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit_contract" 
                    checked={editForm.supports_contract} 
                    onCheckedChange={(c) => setEditForm({ ...editForm, supports_contract: !!c })} 
                  />
                  <label htmlFor="edit_contract" className="text-sm cursor-pointer">Contrato</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit_quotation" 
                    checked={editForm.supports_quotation} 
                    onCheckedChange={(c) => setEditForm({ ...editForm, supports_quotation: !!c })} 
                  />
                  <label htmlFor="edit_quotation" className="text-sm cursor-pointer">Cotação</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit_sales" 
                    checked={editForm.supports_sales_order} 
                    onCheckedChange={(c) => setEditForm({ ...editForm, supports_sales_order: !!c })} 
                  />
                  <label htmlFor="edit_sales" className="text-sm cursor-pointer">Ordem de Vendas</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit_delivery" 
                    checked={editForm.supports_delivery} 
                    onCheckedChange={(c) => setEditForm({ ...editForm, supports_delivery: !!c })} 
                  />
                  <label htmlFor="edit_delivery" className="text-sm cursor-pointer">Remessa</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit_invoice" 
                    checked={editForm.supports_invoice} 
                    onCheckedChange={(c) => setEditForm({ ...editForm, supports_invoice: !!c })} 
                  />
                  <label htmlFor="edit_invoice" className="text-sm cursor-pointer">Fatura</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit_fiscal" 
                    checked={editForm.supports_fiscal_note} 
                    onCheckedChange={(c) => setEditForm({ ...editForm, supports_fiscal_note: !!c })} 
                  />
                  <label htmlFor="edit_fiscal" className="text-sm cursor-pointer">Nota Fiscal</label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelEdit}>
              Cancelar
            </Button>
            <Button onClick={updateOrder}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
