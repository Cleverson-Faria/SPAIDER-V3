import "dotenv/config";
import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  console.log("🌱 Iniciando seed do banco de dados...");

  try {
    // 1. Criar organização de teste
    console.log("📦 Criando organização...");
    
    const organization = await prisma.organizations.upsert({
      where: { slug: "empresa-teste" },
      update: {},
      create: {
        id: uuidv4(),
        name: "Empresa Teste",
        slug: "empresa-teste",
        ai_instructions: "Você é um assistente de testes SAP. Ajude o usuário a testar ordens de vendas."
      }
    });
    console.log(`✅ Organização criada: ${organization.name} (${organization.id})`);

    // 2. Criar auth_user e profile do admin
    const adminEmail = "admin@teste.com";
    const adminPassword = "123456";
    
    console.log("👤 Criando usuário admin...");
    
    // Verificar se já existe
    const existingAuth = await prisma.auth_users.findUnique({
      where: { email: adminEmail }
    });

    let userId: string;

    if (!existingAuth) {
      const passwordHash = await hashPassword(adminPassword);
      userId = uuidv4();

      await prisma.$transaction(async (tx) => {
        // Criar profile primeiro
        await tx.profiles.create({
          data: {
            id: userId,
            email: adminEmail,
            full_name: "Admin Teste",
            organization_id: organization.id
          }
        });

        // Criar auth_user com referência ao profile
        await tx.auth_users.create({
          data: {
            id: uuidv4(),
            email: adminEmail,
            password_hash: passwordHash,
            email_confirmed: true,
            profile_id: userId
          }
        });

        // Criar role super_admin
        await tx.user_roles.create({
          data: {
            id: uuidv4(),
            user_id: userId,
            organization_id: organization.id,
            role: "super_admin"
          }
        });
      });
      
      console.log(`✅ Usuário admin criado: ${adminEmail}`);
    } else {
      userId = existingAuth.id;
      console.log(`ℹ️ Usuário admin já existe: ${adminEmail}`);
      
      // Atualizar senha se necessário
      const passwordHash = await hashPassword(adminPassword);
      await prisma.auth_users.update({
        where: { id: userId },
        data: { password_hash: passwordHash }
      });
      console.log(`🔄 Senha do admin atualizada`);
    }

    // 3. Criar domínio de email permitido
    console.log("📧 Criando domínio de email permitido...");
    
    const existingDomain = await prisma.allowed_email_domains.findFirst({
      where: {
        organization_id: organization.id,
        domain: "teste.com"
      }
    });

    if (!existingDomain) {
      await prisma.allowed_email_domains.create({
        data: {
          id: uuidv4(),
          organization_id: organization.id,
          domain: "teste.com",
          is_active: true
        }
      });
      console.log("✅ Domínio teste.com criado");
    } else {
      console.log("ℹ️ Domínio teste.com já existe");
    }

    // 4. Criar características de exemplo
    console.log("🏷️ Criando características...");
    
    const char1 = await prisma.characteristic_level_1.upsert({
      where: {
        organization_id_code: {
          organization_id: organization.id,
          code: "TIPO_VENDA"
        }
      },
      update: {},
      create: {
        id: uuidv4(),
        organization_id: organization.id,
        code: "TIPO_VENDA",
        name: "Tipo de Venda",
        is_active: true
      }
    });
    console.log(`✅ Característica 1: ${char1.name}`);

    const char2 = await prisma.characteristic_level_2.upsert({
      where: {
        organization_id_code: {
          organization_id: organization.id,
          code: "CANAL"
        }
      },
      update: {},
      create: {
        id: uuidv4(),
        organization_id: organization.id,
        code: "CANAL",
        name: "Canal de Vendas",
        is_active: true
      }
    });
    console.log(`✅ Característica 2: ${char2.name}`);

    const char3 = await prisma.characteristic_level_3.upsert({
      where: {
        organization_id_code: {
          organization_id: organization.id,
          code: "REGIAO"
        }
      },
      update: {},
      create: {
        id: uuidv4(),
        organization_id: organization.id,
        code: "REGIAO",
        name: "Região",
        is_active: true
      }
    });
    console.log(`✅ Característica 3: ${char3.name}`);

    console.log("\n🎉 Seed concluído com sucesso!");
    console.log("\n📋 Dados de acesso:");
    console.log("   Email: admin@teste.com");
    console.log("   Senha: 123456");
    console.log(`   Organização: ${organization.name}`);

  } catch (error) {
    console.error("❌ Erro durante o seed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
