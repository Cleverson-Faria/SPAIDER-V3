import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldOff, ArrowLeft, Crown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface UserWithRole {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  created_at: string;
  organization_id: string;
  organization_name?: string;
}

const getRoleLabel = (role: string) => {
  switch(role) {
    case 'super_admin': return 'Super Admin';
    case 'admin': return 'Administrador';
    default: return 'Usuário';
  }
};

const getRoleVariant = (role: string): "default" | "secondary" | "destructive" => {
  if (role === 'super_admin') return 'destructive';
  if (role === 'admin') return 'default';
  return 'secondary';
};

const Users = () => {
  const { organization, isAdmin, isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isSuperAdmin || organization) {
      fetchUsers();
    }
  }, [organization, isSuperAdmin]);

  const fetchUsers = async () => {
    if (!isSuperAdmin && !organization) return;

    try {
      // Buscar perfis
      const profilesQuery = !isSuperAdmin && organization
        ? { where: { organization_id: organization.id } }
        : {};
      
      const profilesData = await api.query("profiles", profilesQuery);

      // Buscar roles
      const rolesQuery = !isSuperAdmin && organization
        ? { where: { organization_id: organization.id } }
        : {};
      
      const rolesData = await api.query("user_roles", rolesQuery);

      // Buscar organizações para cada perfil
      const usersWithRoles = await Promise.all(
        (profilesData || []).map(async (profile: any) => {
          const userRole = (rolesData || []).find((role: any) => role.user_id === profile.id);
          let orgName = "Sem organização";
          try {
            const org = await api.get("organizations", profile.organization_id);
            orgName = org?.name || "Sem organização";
          } catch {
            // Ignore organization fetch error
          }
          return {
            ...profile,
            role: userRole?.role || "user",
            organization_name: orgName
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar usuários",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleAdminRole = async (userId: string, currentRole: string, userOrganizationId?: string) => {
    if (!isSuperAdmin && !organization) return;

    if (currentRole === 'super_admin') {
      toast({
        title: "Ação não permitida",
        description: "Super administradores não podem ter suas permissões alteradas pela interface",
        variant: "destructive",
      });
      return;
    }

    const newRole = currentRole === "admin" ? "user" : "admin";
    setLoading(true);

    const targetOrgId = isSuperAdmin && userOrganizationId 
      ? userOrganizationId 
      : organization?.id;

    try {
      // Buscar o role existente
      const existingRoles = await api.query("user_roles", {
        where: { user_id: userId, organization_id: targetOrgId },
        single: true
      });
      
      const existingRole = Array.isArray(existingRoles) ? existingRoles[0] : existingRoles;
      
      if (existingRole) {
        await api.update("user_roles", existingRole.id, { role: newRole });
      }

      toast({
        title: "Role atualizada",
        description: `Usuário ${newRole === "admin" ? "promovido a" : "removido de"} administrador`,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar role",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você não tem permissão para acessar esta página</CardDescription>
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
      
      <div>
        <h1 className="text-3xl font-bold">Gerenciar Usuários</h1>
        <p className="text-muted-foreground">
          {isSuperAdmin 
            ? "Visualize e gerencie as permissões de todos os usuários do sistema"
            : "Visualize e gerencie as permissões dos usuários da sua organização"
          }
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {isSuperAdmin ? "Todos os Usuários do Sistema" : "Usuários da Organização"}
          </CardTitle>
          <CardDescription>
            {users.length} usuário(s) cadastrado(s)
            {isSuperAdmin && " em todas as organizações"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum usuário encontrado
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  {isSuperAdmin && <TableHead>Organização</TableHead>}
                  <TableHead>Role</TableHead>
                  <TableHead>Data de Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((userData) => (
                  <TableRow key={userData.id}>
                    <TableCell className="font-medium">
                      {userData.full_name || "Sem nome"}
                      {userData.id === user?.id && (
                        <Badge variant="outline" className="ml-2">Você</Badge>
                      )}
                    </TableCell>
                    <TableCell>{userData.email}</TableCell>
                    {isSuperAdmin && (
                      <TableCell>{userData.organization_name}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant={getRoleVariant(userData.role)} className="gap-1">
                        {userData.role === 'super_admin' && <Crown className="w-3 h-3" />}
                        {getRoleLabel(userData.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(userData.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleAdminRole(userData.id, userData.role, userData.organization_id)}
                                disabled={loading || userData.id === user?.id || userData.role === 'super_admin'}
                              >
                                {userData.role === "admin" ? (
                                  <>
                                    <ShieldOff className="w-4 h-4 mr-2" />
                                    Remover Admin
                                  </>
                                ) : (
                                  <>
                                    <Shield className="w-4 h-4 mr-2" />
                                    Tornar Admin
                                  </>
                                )}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {(userData.role === 'super_admin' || userData.id === user?.id) && (
                            <TooltipContent>
                              <p>
                                {userData.role === 'super_admin' 
                                  ? 'Super administradores não podem ter suas permissões alteradas pela interface'
                                  : 'Você não pode alterar sua própria role'}
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
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

export default Users;
