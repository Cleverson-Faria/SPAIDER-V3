import * as dotenv from "dotenv";
import * as path from "path";

// Carregar .env do diretório server
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
console.log('🔗 DATABASE_URL:', connectionString ? 'Definido' : 'NÃO DEFINIDO');

if (!connectionString) {
  throw new Error('DATABASE_URL não definido no .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔧 Configurando super admin...\n');

  // 1. Adicionar coluna is_super_admin se não existir
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false
    `);
    console.log('✅ Coluna is_super_admin adicionada/verificada');
  } catch (e: any) {
    console.log('⚠️ Erro ao adicionar coluna:', e.message);
  }

  // 2. Atualizar usuário para ser super admin
  const email = 'cleverson.faria@teiaconnect.com';
  
  const result = await prisma.$executeRawUnsafe(`
    UPDATE profiles 
    SET is_super_admin = true 
    WHERE email = $1
  `, email);
  
  console.log(`✅ Usuário ${email} atualizado para super admin:`, result);

  // 3. Verificar
  const user = await prisma.$queryRawUnsafe(`
    SELECT id, email, is_super_admin, organization_id 
    FROM profiles 
    WHERE email = $1
  `, email) as any[];
  
  console.log('\n👤 Usuário atualizado:', user[0]);
  
  // 4. Listar todos os super admins
  const superAdmins = await prisma.$queryRawUnsafe(`
    SELECT id, email, is_super_admin 
    FROM profiles 
    WHERE is_super_admin = true
  `) as any[];
  
  console.log('\n👑 Super admins cadastrados:', superAdmins);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

