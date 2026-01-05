import { Router } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { generateToken, hashPassword, comparePassword, authenticate } from "../auth";

const router = Router();

/**
 * POST /api/auth/signin - Login
 */
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    // Buscar auth_user pelo email
    const authUser = await prisma.auth_users.findUnique({
      where: { email },
      include: {
        profile: {
          include: { organizations: true }
        }
      }
    });

    if (!authUser) {
      return res.status(401).json({ error: "Email ou senha inválidos" });
    }

    // Verificar senha
    const isValidPassword = await comparePassword(password, authUser.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Email ou senha inválidos" });
    }

    if (!authUser.profile) {
      return res.status(401).json({ error: "Perfil não encontrado para este usuário" });
    }

    // Atualizar último login
    await prisma.auth_users.update({
      where: { id: authUser.id },
      data: { last_login_at: new Date() }
    });

    // Gerar token usando o ID do profile
    const token = generateToken({
      id: authUser.profile.id,
      email: authUser.email,
      organization_id: authUser.profile.organization_id
    });

    res.json({
      user: {
        id: authUser.profile.id,
        email: authUser.email,
      },
      session: { access_token: token },
      token
    });
  } catch (error: any) {
    console.error("Erro no signin:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/signup - Registro
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    // Verificar se email já existe
    const existing = await prisma.auth_users.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    // Verificar domínio do email
    const emailDomain = email.split('@')[1];
    const allowedDomain = await prisma.allowed_email_domains.findFirst({
      where: { 
        domain: emailDomain,
        is_active: true
      },
      include: { organizations: true }
    });

    if (!allowedDomain) {
      return res.status(400).json({ 
        error: "Domínio de email não autorizado. Contate o administrador." 
      });
    }

    // Hash da senha
    const passwordHash = await hashPassword(password);
    
    // Criar usuário e perfil em transação
    const profileId = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      // Criar profile primeiro
      const profile = await tx.profiles.create({
        data: {
          id: profileId,
          email,
          full_name: fullName || null,
          organization_id: allowedDomain.organization_id
        }
      });

      // Criar auth_user com referência ao profile
      const authUser = await tx.auth_users.create({
        data: {
          email,
          password_hash: passwordHash,
          email_confirmed: false,
          profile_id: profile.id
        }
      });

      // Criar role padrão (user)
      await tx.user_roles.create({
        data: {
          user_id: profile.id,
          organization_id: allowedDomain.organization_id,
          role: "user"
        }
      });

      return { authUser, profile };
    });

    // Gerar token usando o ID do profile
    const token = generateToken({
      id: result.profile.id,
      email: result.authUser.email,
      organization_id: result.profile.organization_id
    });

    res.json({
      user: {
        id: result.profile.id,
        email: result.authUser.email,
      },
      session: { access_token: token },
      token,
      message: "Usuário criado com sucesso"
    });
  } catch (error: any) {
    console.error("Erro no signup:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/profile - Obter perfil do usuário autenticado
 */
router.get("/profile", authenticate, async (req: any, res) => {
  try {
    const profile = await prisma.profiles.findUnique({
      where: { id: req.user.id },
      include: { organizations: true }
    });

    if (!profile) {
      return res.status(404).json({ error: "Perfil não encontrado" });
    }

    res.json(profile);
  } catch (error: any) {
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

