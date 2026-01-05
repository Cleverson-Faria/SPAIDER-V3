import React, { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { api } from "@/lib/api";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  ai_instructions: string | null;
}

interface UserProfile {
  id: string;
  organization_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface User {
  id: string;
  email: string;
}

interface Session {
  access_token: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  organization: Organization | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const profileData = await api.getProfile();
      setProfile(profileData);

      if (profileData?.organization_id) {
        try {
          const orgData = await api.get('organizations', profileData.organization_id);
          if (orgData) {
            setOrganization(orgData);
          }
        } catch (error) {
          console.error("Erro ao buscar organização:", error);
        }

        // Buscar role do usuário
        try {
          const roles = await api.query('user_roles', {
            where: { user_id: userId, organization_id: profileData.organization_id },
            single: true
          });
          
          const roleData = Array.isArray(roles) ? roles[0] : roles;
          setIsAdmin(roleData?.role === "admin" || roleData?.role === "super_admin");
          setIsSuperAdmin(roleData?.role === "super_admin");
        } catch (error) {
          console.error("Erro ao buscar role:", error);
          // Tentar sem organization_id
          try {
            const roles = await api.query('user_roles', {
              where: { user_id: userId },
              single: true
            });
            const roleData = Array.isArray(roles) ? roles[0] : roles;
            setIsAdmin(roleData?.role === "admin" || roleData?.role === "super_admin");
            setIsSuperAdmin(roleData?.role === "super_admin");
          } catch (err) {
            console.error("Erro ao buscar role (segunda tentativa):", err);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      // Tentar buscar perfil
      api.getProfile()
        .then((profileData) => {
          setUser({ id: profileData.id, email: profileData.email });
          setSession({ access_token: token });
          fetchProfile(profileData.id);
          setLoading(false);
        })
        .catch(() => {
          api.setToken(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const data = await api.signIn(email, password);
      setUser({ id: data.user.id, email: data.user.email });
      setSession({ access_token: data.token });
      await fetchProfile(data.user.id);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      await api.signUp(email, password, fullName);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    await api.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setOrganization(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    
    // Limpar localStorage
    localStorage.removeItem('auth_token');
    
    // Limpar caches do comparador
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('flow_') || key.startsWith('comparison_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Forçar redirecionamento
    window.location.href = '/auth';
  };

  const resendConfirmationEmail = async (email: string) => {
    // Implementar se necessário
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        organization,
        isAdmin,
        isSuperAdmin,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        resendConfirmationEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
