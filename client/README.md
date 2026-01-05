# SPAIDER - Automação Inteligente para SAP

Sistema de automação e testes para SAP S/4HANA SD desenvolvido pela Teia Connect.

## 🚀 Funcionalidades

- **Chat com IA**: Assistente inteligente para operações SAP
- **Testes Automatizados**: Criação e replicação de ordens de vendas
- **Fluxo Completo**: Ordem → Remessa → Picking → PGI → Faturamento → NF-e
- **Comparação de Dados**: Análise detalhada entre ordem original e replicada
- **Exportação PDF**: Relatórios de comparação em PDF
- **Multi-domínio**: Suporte a múltiplas instâncias SAP

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn
- Backend Express rodando (porta 3001)
- PostgreSQL configurado

## 🛠️ Instalação

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Iniciar servidor de desenvolvimento
npm run dev
```

## ⚙️ Variáveis de Ambiente

```env
VITE_API_URL=http://localhost:3001
```

## 🏗️ Estrutura do Projeto

```
src/
├── components/       # Componentes React reutilizáveis
│   ├── ui/          # Componentes base (shadcn/ui)
│   └── ...          # Componentes específicos
├── pages/           # Páginas da aplicação
│   ├── admin/       # Páginas administrativas
│   └── ...          # Outras páginas
├── hooks/           # Custom hooks
├── lib/             # Utilitários e configurações
└── main.tsx         # Entry point
```

## 🧪 Scripts Disponíveis

```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build de produção
npm run preview  # Preview do build
npm run lint     # Verificação de lint
```

## 🛡️ Tecnologias

- **React 18** - UI Library
- **TypeScript** - Type Safety
- **Vite** - Build Tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component Library
- **React Query** - Server State
- **React Router** - Routing

## 📄 Licença

Proprietário - Teia Connect © 2025
