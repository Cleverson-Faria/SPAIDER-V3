# SPAIDER V3 - AI Coding Agent Instructions

## Project Overview
**SPAIDER V3** is a fullstack SAP S/4HANA automation & testing platform for sales orders (SD module). It enables users to create test orders, execute full business flows (Order → Delivery → Billing → Fiscal Notes), and compare results with AI assistance.

**Architecture:** React 18 frontend (Vite) + Express.js backend (Prisma ORM + PostgreSQL), multi-tenant with domain-based access control.

## Critical Data Model & Architecture

### Multi-Tenancy & Authentication
- **Organization-scoped data:** All entities have `organization_id` FK (enforced in routes). Users belong to one org via `profiles.organization_id`
- **Auth model:** `auth_users` (login) → `profiles` (1:1) → `organizations`. Super admins have `is_super_admin=true` in profiles
- **Domain-based signup:** Email domains must exist in `allowed_email_domains` table before user registration. Routes check domain validity before creation
- **Token pattern:** JWT includes `{ id, email, organization_id }` (profile id, NOT auth_user id). Generate via `generateToken()` in `server/src/auth.ts`

### SAP Integration Architecture
The system executes complete SAP business flows via `sapFlowExecutor.ts`:

1. **Credentials Resolver** (`sapCredentialsResolver.ts`): Maps domain → SAP credentials from `sap_domain_credentials` table. Decrypts password at runtime
2. **SAP API Layer** (`sapApi.ts`): OData/REST calls to SAP S/4HANA APIs. Key functions:
   - `fetchSalesOrder()` - Fetch existing order for reference
   - `createSalesOrder()` - Create test order with modified fields
   - `createOutboundDelivery()`, `pickAllItems()`, `executePostGoodsIssue()` - Delivery flow
   - `createBillingDocument()`, `fetchFiscalNote()` - Billing & fiscal integration
3. **Comparison Engine** (`server/src/services/comparison/`): Compares original vs test order:
   - `compareHeaderFields()` / `compareItemFields()` - Field-level diffs
   - `compareItemTaxes()` - Tax calculation validation
   - Results stored in `test_flow_executions` & related comparison tables
4. **Logging & Error Tracking:** `sapLogger.ts` persists all SAP API calls (method, endpoint, payload, response) to `sap_api_logs` table. Use `setSapLogContext()` before operations for audit trail

### Test Execution Lifecycle
- User selects reference order + characteristics → POST `/api/sap/execute-test`
- `sapFlowExecutor.executeFullFlowInBackground()` runs async: Order → Delivery → Billing → NFe
- Each step stores status + response data in `test_flow_executions` columns (`order_status`, `order_data`, `delivery_status`, etc)
- Polling endpoint `/api/sap/test-executions/:id` returns current state
- Comparison results stored in `order_field_comparisons`, `item_comparisons`, `tax_comparisons` tables

### Data Persistence
- **Transactional writes:** Comparison results use `saveComparisonToTables()` (batch Prisma creates)
- **Soft deletes:** `is_active` boolean pattern (not hard deletes). Always filter active records in queries
- **Organization isolation:** All SELECT queries must include `organization_id` WHERE clause. Routes enforce via middleware

## Developer Workflows & Build Patterns

### Quick Start
```bash
# Backend
cd server && npm install && npm run db:push && npm run seed && npm run dev

# Frontend  
cd client && npm install && npm run dev
```

### Database Management
- **Schema location:** `server/prisma/schema.prisma`
- **Push changes:** `npm run db:push` (creates tables, NOT a migration system)
- **Seed data:** `npm run seed` (runs `server/src/seed.ts`, creates test users + reference orders)
- **Generate Prisma client:** Auto-runs on `db:push`, manual: `npm run db:generate`

### API Patterns
- **Frontend client:** `lib/api.ts` - Singleton `api` instance with `setToken()`, `.post()`, `.get()`, `.put()` methods. Throws `ApiError` with nested `errorLog` from backend
- **Backend routes:** All in `server/src/routes/` (auth, query, sap, admin). Use `authenticate` middleware to extract `req.user`
- **Error responses:** Include `{ error: string, errorLog?: object }` structure (see `sap.routes.ts` for patterns)

### Component Patterns (React)
- **State management:** `useAuth()` hook (context-based, persists token to localStorage)
- **Theme:** `next-themes` + Tailwind dark mode. Components read `useTheme()` for light/dark
- **UI library:** shadcn/ui components in `src/components/ui/` (radix-ui based, auto-generated)
- **Data fetching:** Direct `api.get()` calls with `useEffect()` + state, not React Query (no `useQuery`/`useMutation`)
- **Charts:** Recharts for visualization (see `Dashboard.tsx` for patterns)

## Project-Specific Conventions

### File Organization
- **Services:** `server/src/services/` - Pure business logic (SAP calls, comparisons, auth)
- **Routes:** `server/src/routes/` - HTTP handlers, call services, enforce org isolation
- **Middleware:** `server/src/middleware/` - Auth, admin checks
- **Pages:** `client/src/pages/` - Full-page components (Dashboard, admin sections)
- **Hooks:** `client/src/hooks/` - `useAuth`, `useToast` (custom hooks only, no React Query)

### Naming Conventions
- **Database tables:** snake_case (e.g., `test_flow_executions`, `sap_domain_credentials`)
- **API endpoints:** kebab-case (e.g., `/api/sap/execute-test`, `/api/sap-logs`)
- **React components:** PascalCase (e.g., `ComparatorView.tsx`, `SAPFlowProgress.tsx`)
- **Typescript types:** Suffixes like `Props`, `State`, `Response` (e.g., `interface DashboardState`)

### Common Pitfalls to Avoid
1. **Missing org isolation:** Add `organization_id` WHERE clause in all Prisma queries. Enforce in routes via middleware
2. **Token ID confusion:** JWT contains profile.id (NOT auth_user.id). Always use `req.user.id` = profile id
3. **Credential decryption:** Use `resolveSapCredentials()` helper, not direct DB access. Passwords are AES-256 encrypted
4. **Async flows:** SAP tests run background → require polling, not await. Return `{ testExecutionId }` immediately
5. **Comparison queries:** Always load related data (e.g., `include: { characteristic_level_1: true }` for display)

## Integration Points & Dependencies

### External APIs
- **SAP OData:** Requires basic auth + CSRF tokens. See `sapAuth.ts` for token fetching pattern
- **OpenAI:** `/api/functions/spaider-chat` endpoint uses `callOpenAI()` with custom system prompts. Org instructions stored in `organizations.ai_instructions`

### Key Libraries
- **Backend:** Express, Prisma (ORM), bcryptjs (password hashing), jsonwebtoken (JWT), postgres adapter
- **Frontend:** React, Vite (bundler), Tailwind CSS, Recharts, shadcn/ui, date-fns (localized dates)
- **Testing:** No test framework configured (aspirational feature)

### Environment Variables
**Server (.env):**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Token signing key
- `PORT` - Server port (default 3001)
- `OPENAI_API_KEY` - For chat features
- `.env.example` not provided; reference `server/src/index.ts` for required vars

**Client (.env.vite):**
- `VITE_API_URL` - Backend API URL (default http://localhost:3001)

## Code Examples from Codebase

### Fetching Data with Org Isolation
```typescript
// server/src/routes/sap.routes.ts pattern
const tests = await prisma.test_flow_executions.findMany({
  where: { organization_id: req.user.organization_id },
  include: { reference_orders: true }
});
```

### SAP Credential Resolution
```typescript
// Before SAP API calls
const creds = await resolveSapCredentials(organizationId, domain);
const auth = buildBasicAuth(creds.username, creds.password);
const baseUrl = buildSapBaseUrl(creds.baseUrl);
```

### Frontend API Calls
```typescript
// client/src/pages/Dashboard.tsx pattern
const response = await api.get('/api/sap/test-executions', { period: 30 });
setTests(response.data);
```

### Async Background Execution
```typescript
// server/src/routes/sap.routes.ts
executeFullFlowInBackground(testExecutionId, /* params */); // Fire and forget
res.json({ testExecutionId, status: 'running' }); // Return immediately
```
