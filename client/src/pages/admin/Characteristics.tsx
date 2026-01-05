import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Characteristic {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

export default function Characteristics() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // States for each level
  const [level1, setLevel1] = useState<Characteristic[]>([]);
  const [level2, setLevel2] = useState<Characteristic[]>([]);
  const [level3, setLevel3] = useState<Characteristic[]>([]);

  // Form states
  const [newChar, setNewChar] = useState({ name: "", code: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<"level_1" | "level_2" | "level_3">("level_1");

  useEffect(() => {
    if (!authLoading) {
      checkAccess();
    }
  }, [authLoading]);

  const checkAccess = async () => {
    try {
      // Só continua se não estiver carregando E se for super admin
      if (authLoading || !isSuperAdmin) {
        return; // Silenciosamente retorna, deixa o render condicional tratar
      }

      const profile = await api.getProfile();
      if (!profile) {
        navigate("/auth");
        return;
      }

      setOrganizationId(profile.organization_id);
      await fetchAllCharacteristics();
    } catch (error) {
      console.error("Error checking access:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllCharacteristics = async () => {
    const [l1, l2, l3] = await Promise.all([
      fetchCharacteristics("characteristic_level_1"),
      fetchCharacteristics("characteristic_level_2"),
      fetchCharacteristics("characteristic_level_3"),
    ]);
    setLevel1(l1);
    setLevel2(l2);
    setLevel3(l3);
  };

  const fetchCharacteristics = async (table: string): Promise<Characteristic[]> => {
    try {
      const data = await api.query(table, { orderBy: "name.asc" });
      return (data as Characteristic[]) || [];
    } catch (error) {
      console.error(`Error fetching ${table}:`, error);
      return [];
    }
  };

  const getTableName = (level: string) => `characteristic_${level}`;

  const addCharacteristic = async () => {
    if (!newChar.name.trim() || !newChar.code.trim() || !organizationId) return;

    const table = getTableName(currentLevel);

    try {
      const profile = await api.getProfile();
      await api.create(table, {
        organization_id: organizationId,
        name: newChar.name,
        code: newChar.code,
        created_by: profile?.id,
      });

      toast({
        title: "Característica adicionada",
        description: `${newChar.name} foi adicionada com sucesso`,
      });

      setNewChar({ name: "", code: "" });
      await fetchAllCharacteristics();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar característica",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const startEdit = (char: Characteristic) => {
    setEditingId(char.id);
    setEditForm({ name: char.name, code: char.code });
  };

  const updateCharacteristic = async () => {
    if (!editForm.name.trim() || !editForm.code.trim() || !editingId) return;

    const table = getTableName(currentLevel);
    
    try {
      await api.update(table, editingId, { name: editForm.name, code: editForm.code });

      toast({ title: "Característica atualizada com sucesso" });
      setEditingId(null);
      await fetchAllCharacteristics();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteCharacteristic = async () => {
    if (!deleteId) return;

    const table = getTableName(currentLevel);
    
    try {
      await api.delete(table, deleteId);

      toast({ title: "Característica excluída com sucesso" });
      setDeleteId(null);
      await fetchAllCharacteristics();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const table = getTableName(currentLevel);
    
    try {
      await api.update(table, id, { is_active: !currentStatus });
      await fetchAllCharacteristics();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderTable = (data: Characteristic[]) => (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Nome da característica"
          value={newChar.name}
          onChange={(e) => setNewChar({ ...newChar, name: e.target.value })}
        />
        <Input
          placeholder="Código (ex: venda_b2b)"
          value={newChar.code}
          onChange={(e) => setNewChar({ ...newChar, code: e.target.value.toLowerCase().replace(/\s/g, '_') })}
        />
        <Button onClick={addCharacteristic}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhuma característica cadastrada
                </TableCell>
              </TableRow>
            ) : (
              data.map((char) => (
                <TableRow key={char.id}>
                  <TableCell>
                    {editingId === char.id ? (
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    ) : (
                      char.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === char.id ? (
                      <Input
                        value={editForm.code}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                      />
                    ) : (
                      <code className="text-xs bg-muted px-2 py-1 rounded">{char.code}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={char.is_active ? "default" : "secondary"}
                      size="sm"
                      onClick={() => toggleActive(char.id, char.is_active)}
                    >
                      {char.is_active ? "Ativo" : "Inativo"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {editingId === char.id ? (
                        <>
                          <Button size="sm" onClick={updateCharacteristic}>Salvar</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(char)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteId(char.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Acesso negado. Esta página é restrita a Super Administradores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Voltar
      </Button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gerenciar Características</h1>
        <p className="text-muted-foreground">
          Configure os 3 níveis hierárquicos para classificação de ordens (Apenas Super Admin)
        </p>
      </div>

      <Tabs defaultValue="level_1" onValueChange={(v) => setCurrentLevel(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="level_1">Nível 1 (Obrigatório)</TabsTrigger>
          <TabsTrigger value="level_2">Nível 2 (Opcional)</TabsTrigger>
          <TabsTrigger value="level_3">Nível 3 (Opcional)</TabsTrigger>
        </TabsList>

        <TabsContent value="level_1" className="mt-6">
          <div className="mb-4">
            <h3 className="font-semibold mb-1">Nível 1 - Tipo Principal</h3>
            <p className="text-sm text-muted-foreground">
              Ex: Venda B2B, Venda Exportação, Venda Normal
            </p>
          </div>
          {renderTable(level1)}
        </TabsContent>

        <TabsContent value="level_2" className="mt-6">
          <div className="mb-4">
            <h3 className="font-semibold mb-1">Nível 2 - Característica Secundária</h3>
            <p className="text-sm text-muted-foreground">
              Ex: Pessoa Física, Pessoa Jurídica, Industrialização
            </p>
          </div>
          {renderTable(level2)}
        </TabsContent>

        <TabsContent value="level_3" className="mt-6">
          <div className="mb-4">
            <h3 className="font-semibold mb-1">Nível 3 - Característica Terciária</h3>
            <p className="text-sm text-muted-foreground">
              Ex: Consumidor, Revenda, Zona Franca
            </p>
          </div>
          {renderTable(level3)}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A característica será permanentemente excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCharacteristic}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
