import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./prisma";
import { setPrismaInstance } from "./services/sapLogger";

// Importar rotas
import authRoutes from "./routes/auth.routes";
import queryRoutes from "./routes/query.routes";
import sapRoutes from "./routes/sap.routes";
import adminRoutes from "./routes/admin.routes";

// Inicializar o logger com a instância do Prisma
setPrismaInstance(prisma as any);

const app = express();
app.use(cors());
app.use(express.json());

// ===== HEALTH CHECK =====
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`select 1`;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Database connection failed" });
  }
});

// ===== ROTAS =====

// Autenticação
app.use("/api/auth", authRoutes);

// Queries genéricas (substitui supabase.from())
app.use("/api/query", queryRoutes);

// SAP Integration e Chat
app.use("/api/sap", sapRoutes);
app.use("/api", sapRoutes); // Para /api/functions/spaider-chat

// Admin (organizações, credenciais SAP, logs)
app.use("/api", adminRoutes);
app.use("/api/admin", adminRoutes);

// ===== INICIAR SERVIDOR =====
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`
🚀 SPAIDER API Server
═══════════════════════════════════════
📍 URL: http://localhost:${port}
📚 Endpoints disponíveis:
   • /api/health - Health check
   • /api/auth/* - Autenticação
   • /api/query/* - Queries genéricas
   • /api/sap/* - Integração SAP
   • /api/functions/spaider-chat - Chat IA
   • /api/organizations - Organizações
   • /api/sap-credentials - Credenciais SAP
   • /api/admin/sap-logs - Logs SAP
═══════════════════════════════════════
  `);
});

export { app };
