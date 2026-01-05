# SPAIDER V3

Sistema de automação e testes para SAP S/4HANA SD desenvolvido pela Teia Connect.

## 📂 Estrutura do Projeto

```
SPAIDER-V3/
├── server/      # Backend Express.js + Prisma + PostgreSQL
├── client/      # Frontend React + Vite + Tailwind
└── schema.sql   # Schema SQL de referência
```

## 🚀 Quick Start

### 1. Backend (Server)

```bash
cd server
npm install
npm run db:push      # Criar tabelas no PostgreSQL
npm run seed         # Popular dados iniciais
npm run dev          # Iniciar servidor (porta 3001)
```

### 2. Frontend (Client)

```bash
cd client
npm install
npm run dev          # Iniciar servidor (porta 8080)
```

## 🔑 Credenciais de Teste

```
Email: admin@teste.com
Senha: 123456
```

## 🛠️ Tecnologias

### Backend
- Express.js
- Prisma ORM
- PostgreSQL
- JWT Authentication
- OpenAI API

### Frontend
- React 18
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui

## 📄 Licença

Proprietário - Teia Connect © 2025

