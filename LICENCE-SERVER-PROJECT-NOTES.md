# Pro-curo Licence Server — Project Notes

> **Owner:** Pro-curo Software Limited
> **Repository:** https://github.com/markwalker-pcs/procuro-licence-server.git
> **Architecture Document:** `Pro-curo V5 - Licensing Server Technical Architecture.docx`
> **Last Updated:** 30 March 2026

---

## Current Status

**Phase:** Phases 1–6 complete, deployed to Azure
**Current Build:** PLS-20260330-1545-11
**Build Status:** Docker build passing, server running on Azure Container Apps
**Deployed:** Build 10 — Azure Container Apps (UK South), deployed 30 March 2026. Build 11 pending deployment.
**First Successful Build:** 26 March 2026 — health endpoint confirmed at http://localhost:3100/health

---

## Build Numbering

Build IDs follow the same convention as Pro-curo V5 but with a different prefix:

- **Format:** `PLS-YYYYMMDD-HHMM-NN` (Pro-curo Licence Server — date, time, serial)
- **File:** `src/buildInfo.ts` — must be updated with every new build
- **Displayed in:** `/health` endpoint, `/api/v1/status` endpoint, server startup log

V5 uses prefix `PCSv5-`, licence server uses prefix `PLS-`.

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Express | 4.x |
| Language | TypeScript | 5.6+ |
| Database | PostgreSQL | 16 |
| ORM | Prisma | 5.22+ |
| Admin Portal | React 18 + Vite + Ant Design 5.21 | Scaffolded |
| Containerisation | Docker + Docker Compose | Latest |
| Production Hosting | Azure App Service (UK South) | B1 tier |

---

## Project Structure

```
pro-curo-licence-server/
├── src/
│   ├── buildInfo.ts          # Build ID (PLS-YYYYMMDD-HHMM-NN)
│   ├── index.ts              # Express app entry point
│   ├── config/
│   │   ├── index.ts          # Centralised env config
│   │   ├── logger.ts         # Winston logger
│   │   └── prisma.ts         # PrismaClient singleton
│   ├── routes/
│   │   ├── checkIn.ts        # POST /api/v1/check-in, GET /api/v1/status
│   │   └── admin/
│   │       ├── customers.ts  # GET/POST /api/admin/customers
│   │       ├── licences.ts   # GET/POST/PATCH/DELETE /api/admin/licences
│   │       ├── instances.ts  # GET /api/admin/instances
│   │       └── dashboard.ts  # GET /api/admin/dashboard, alerts, audit-log
│   ├── middleware/
│   │   ├── adminAuth.ts      # JWT auth + dev login endpoint
│   │   ├── errorHandler.ts   # AppError class + Zod error handling
│   │   └── rateLimiter.ts    # Rate limiting (check-in + auth)
│   └── services/
│       ├── hmacService.ts    # HMAC-SHA256 check-in validation
│       ├── cryptoService.ts  # Ed25519 signing + offline licence files
│       ├── licenceService.ts # Key generation, bcrypt hashing, status logic
│       └── auditService.ts   # Non-blocking audit event logging
├── prisma/
│   ├── schema.prisma         # Database schema (7 tables)
│   ├── seed.ts               # Dev seed data (admin user, test customers/licences)
│   └── migrations/
│       └── 20260326134000_init/
│           └── migration.sql # Full schema creation SQL
├── admin-portal/
│   ├── src/
│   │   ├── main.tsx          # React DOM entry point
│   │   ├── App.tsx           # Router setup (all routes)
│   │   ├── context/
│   │   │   └── AuthContext.tsx  # JWT auth context
│   │   ├── components/
│   │   │   └── AppLayout.tsx    # Ant Design layout with sidebar nav
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx      # Dev login (email only)
│   │   │   ├── DashboardPage.tsx  # Stats cards + alert tables
│   │   │   ├── CustomersPage.tsx  # Customer list + create modal
│   │   │   ├── LicencesPage.tsx   # Licence table + issue/revoke
│   │   │   ├── InstancesPage.tsx  # Instance list + status indicators
│   │   │   └── AuditLogPage.tsx   # Paginated audit log
│   │   ├── services/
│   │   │   └── api.ts           # Axios instance with JWT interceptor
│   │   └── types/
│   │       └── index.ts         # TypeScript interfaces (matches Prisma)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts          # Port 5174, proxies /api to :3100
│   └── index.html
├── packages/
│   └── licence-client/          # @pro-curo/licence-client npm package
│       ├── src/
│       │   ├── index.ts         # Public exports
│       │   ├── client.ts        # LicenceClient class (check-in, caching, login enforcement)
│       │   ├── cache.ts         # Disc-based licence state cache
│       │   ├── hmac.ts          # HMAC-SHA256 computation for check-in signing
│       │   └── types.ts         # Type definitions (shared contract)
│       ├── package.json
│       └── tsconfig.json
├── Dockerfile                # Multi-stage build (Alpine + OpenSSL)
├── docker-compose.yml        # Local dev (API :3100 + PostgreSQL :5433)
└── package.json
```

---

## Database Schema

All 8 tables defined in `prisma/schema.prisma` and deployed via 4 migrations:

| Table | Purpose |
|-------|---------|
| `customers` | Customer organisation records |
| `licences` | Licence entitlements (keys as bcrypt hashes, PER_USER/CONCURRENT type, configurable grace period) |
| `licence_amendments` | Tracks user count changes, renewals, extensions — each with FreeAgent invoice ref |
| `instances` | Registered Pro-curo V5 instances |
| `check_ins` | Check-in audit log |
| `offline_files` | Generated offline licence files |
| `audit_log` | All admin actions |
| `admin_users` | Admin portal users (Pro-curo engineers) |

**Seed data:** `prisma/seed.ts` creates a dev admin user (dev@pro-curo.com), 2 test customers, and 2 test licences (`PCV5-TEST-AAAA-BBBB-CCCC` active, `PCV5-TEST-DDDD-EEEE-FFFF` expiring in 14 days).

---

## API Endpoints

### Instance-Facing API (v1) — used by Pro-curo V5 instances

| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/v1/check-in` | **Implemented** — Zod validation, HMAC verify, bcrypt licence lookup, status determination, instance upsert, signed response |
| GET | `/api/v1/status` | **Implemented** — returns build ID and service info |

### Admin API — used by Admin Portal (all protected by JWT auth)

| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/auth/login` | **Implemented** — dev login (email only) |
| GET | `/api/admin/customers` | **Implemented** — list with licence summaries |
| POST | `/api/admin/customers` | **Implemented** — create with Zod validation |
| GET | `/api/admin/licences` | **Implemented** — list with customer includes |
| POST | `/api/admin/licences` | **Implemented** — issue with key generation |
| PATCH | `/api/admin/licences/:id` | **Implemented** — modify licence |
| DELETE | `/api/admin/licences/:id` | **Implemented** — revoke licence |
| POST | `/api/admin/licences/:id/amend` | **Implemented** — amend licence (user increase/decrease, renewal, extension) with invoice ref |
| GET | `/api/admin/licences/:id/amendments` | **Implemented** — amendment history for a licence |
| POST | `/api/admin/licences/:id/offline-file` | **Implemented** — generate Ed25519-signed offline licence file |
| GET | `/api/admin/licences/:id/offline-files` | **Implemented** — list offline files for a licence |
| GET | `/api/admin/instances` | **Implemented** — list with licence/customer includes |
| GET | `/api/admin/instances/:id/history` | **Implemented** — check-in history |
| GET | `/api/admin/dashboard` | **Implemented** — aggregated stats |
| GET | `/api/admin/dashboard/alerts` | **Implemented** — offline instances + expiring licences |
| GET | `/api/admin/dashboard/audit-log` | **Implemented** — paginated |

---

## Docker Configuration

- **Database port:** 5433 (avoids conflict with V5's PostgreSQL on 5432)
- **API port:** 3100
- **Admin portal port:** 5174 (Vite dev server)
- **OpenSSL:** Installed in Alpine image (required by Prisma schema engine)

### Running locally

```bash
cd pro-curo-licence-server
docker-compose up --build
```

---

## Development Phases

Timeline accelerated — development started March 2026 (originally planned May 2026).

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1 — Core API | March 2026 | **Complete** — check-in endpoint, HMAC validation, bcrypt licence lookup, Ed25519 signing, all admin routes, JWT auth |
| Phase 2 — Admin Portal | March 2026 | **Functional** — all pages working in Docker, login, dashboard, customers, licences (with amend/offline), instances, audit log with detail view |
| Phase 3 — Offline Files | March 2026 | **Complete** — Ed25519 signed offline licence file generation, download as .lic, history, regeneration prompt after amendments |
| Invoice Tracking | March 2026 | **Complete** — FreeAgent invoice references on licences and amendments, amendment history timeline |
| Phase 4 — Licence Client Package | March 2026 | **Complete** — `@pro-curo/licence-client` package, V5 backend + frontend integration, per-user and concurrent licensing, deployed to Azure |
| Phase 5 — Testing & Hardening | April–May 2026 | Not started — E2E tests, security review, pen testing, load testing, production auth (replace dev login) |
| Phase 6 — Production Readiness | May 2026 | Not started — Custom domain, proper auth (Azure AD SSO), monitoring, IP restrictions |

---

## Next Steps

1. **Deploy V5 Build 25** with licence integration — pointed at the live licence server
2. **Test check-in flow end-to-end** — V5 instance checking in against the Azure licence server
3. **Test login enforcement** — verify per-user and concurrent licence limits work in production
4. **Add production authentication** — replace dev JWT login with password-based or Azure AD SSO
5. **Set NODE_ENV=production** — currently set to `development` for dev login access
6. **Custom domain** — e.g. `licence.pro-curo.com`
7. **Phase 5 — Testing & Hardening** — E2E tests, security review, pen testing

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate repository from V5 | Security isolation, independent release cycle |
| Same tech stack as V5 | Shared expertise, reduced learning curve |
| Port 5433 for local DB | Avoids conflict with V5's PostgreSQL on 5432 |
| Port 3100 for API | Avoids conflict with V5 backend on 3000 |
| Build prefix PLS- (not PCSv5-) | Distinct identification from main application |
| Licence keys as bcrypt hashes | Cannot be recovered from database breach |
| Ed25519 for signing | Modern, fast, small signatures |
| 30-day grace period | Non-disruptive; handles transient connectivity issues |
| Daily check-in (not real-time) | Minimal network dependency |
| Dev login (email-only JWT) | Temporary until Azure AD SSO in production |
| Accelerated timeline | Start March 2026 to be production-ready sooner |
| Dual licence types (PER_USER + CONCURRENT) | Per-user for new customers; concurrent for V4 upgrade customers who had unregulated .lic files |
| Configurable grace period | Server-side setting returned in check-in response; tunable per customer without redeploying V5 |
| Active sessions = valid refresh tokens | Concurrent licence counting uses non-expired refresh tokens grouped by user ID |
| Immediate enforcement on type change | When switching CONCURRENT → PER_USER, excess users are locked out immediately on next login |
| Licence client as separate package | `@pro-curo/licence-client` in packages/ — clean separation, importable by V5 via file: reference |

---

## Environment Variables

See `.env.example` for full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (see .env.example) | PostgreSQL connection string |
| `PORT` | 3100 | Server port |
| `JWT_SECRET` | — | Admin portal token signing |
| `HMAC_SECRET` | — | Check-in payload validation |
| `ED25519_PRIVATE_KEY_PATH` | `./keys/private.pem` | Offline licence signing key |

---

## Build History

| Build ID | Date | Notes |
|----------|------|-------|
| PLS-20260326-1340-01 | 26 March 2026 | Initial scaffold — project structure, Prisma schema, route stubs, Docker config |
| PLS-20260326-1800-02 | 26 March 2026 | Phase 1 complete + Phase 2 scaffolded — full check-in flow, all services (HMAC, crypto, licence, audit), admin routes with JWT auth, admin portal React app with all pages |
| PLS-20260326-2100-03 | 26 March 2026 | Phase 3 complete + invoice tracking — offline file generation with Ed25519, licence amendments with FreeAgent invoice refs, audit log detail view, favicon, build number in sidebar |
| PLS-20260326-2230-04 | 26 March 2026 | Phase 4 — dual licensing (PER_USER + CONCURRENT), configurable grace period, @pro-curo/licence-client package, V5 backend + frontend integration, login enforcement, licence status UI |
| PLS-20260327-build05 | 27 March 2026 | Phase 5 — Password auth (bcrypt) for admin portal, customer editing (PATCH + edit modal), deployment model change audit logging, NODE_ENV set to production |
| PLS-20260327-build06 | 27 March 2026 | Phase 6 — Deployments page (provisioning workflow, 4-step wizard), Tenant Configuration store (per-deployment key-value config, env vars, feature flags, quick-add templates, secret masking), custom domain + SSL cert tracking. TS fixes: adminUser guard, Tag color prop, form value casts, Typography.Title. |
| PLS-20260327-1000-07 | 27 March 2026 | Smart provisioning wizard — auto-populate from customer deployment model (SaaS/Hybrid), acronym-based naming (database, domain, container app), latest image tag default, custom domain in table + edit modal, seed passwordHash fix for existing users. |
| PLS-20260327-1457-08 | 30 March 2026 | Pre-provisioning brief — "Prepare Azure Setup" feature generates resource summary and Azure CLI script (database, container app, env vars, custom domain, migration) per customer. Copy-to-clipboard and print support. SaaS and Hybrid script variants. |
| PLS-20260330-0700-09 | 30 March 2026 | Fix provisioning — added express-async-errors (Express 4 async handler bug), wizard form values now preserved across steps (display:none instead of unmount), per-step field validation, Container App URL made optional, better error messages on POST failures. |
| PLS-20260330-1200-10 | 30 March 2026 | V5 build tracking — v5BuildId field on deployments, Prepare Azure Setup scripts with SaaS/Hybrid variants, Provision Upgrade modal, Actions dropdown menu, status column with build tags, GitHub link to V5 repo, uniqueness constraints on containerAppName/customDomain/databaseName+host, correct V5 image names (procurov5-backend/procurov5-frontend). |
| PLS-20260330-1545-11 | 30 March 2026 | Frontend container support — frontendAppName + frontendAppUrl fields on deployments (schema, API, UI), auto-generated UUID/JWT in all setup scripts, provisioning defaults V5 Build ID + image tag to latest, tenant config blank screen fix (grouped API response flattening), resource summary shows both backend and frontend containers with URLs in all scripts, custom domain CNAME points to frontend container, upgrade script uses stored frontend container name. |

---

## Known Issues / TODOs

- [ ] No unit or integration tests yet
- [ ] Azure AD SSO not implemented (password auth implemented as interim solution)
- [x] Pushed to GitHub — https://github.com/markwalker-pcs/procuro-licence-server.git
- [ ] Licence keys stored as plaintext in dev seed (bcrypt hashing in check-in flow works, but POST /licences stores plaintext — needs fixing before production)
- [x] Deployed to Azure Container Apps (26 March 2026, Build 05 on 27 March)
- [x] OpenSSL added to Alpine Dockerfile (Prisma requirement)
- [x] Build numbering implemented (PLS- prefix)
- [x] Initial Prisma migration created and applies successfully
- [x] Invoice tracking migration (licence_amendments table, invoiceReference on licences)
- [x] HMAC-SHA256 check-in validation implemented
- [x] Licence key generation with bcrypt hashing implemented
- [x] Ed25519 response signing implemented
- [x] Seed script created (dev admin, test customers, test licences)
- [x] Admin JWT authentication middleware implemented
- [x] All admin API routes implemented (including amendments + offline files)
- [x] Full check-in endpoint implemented
- [x] Admin portal fully functional in Docker (all 6 pages + amendment/offline modals)
- [x] Offline licence file generation with Ed25519 signing
- [x] Licence amendment flow with FreeAgent invoice tracking
- [x] Audit log detail view (double-click to expand)
- [x] Build number displayed in sidebar
- [x] Offline file regeneration prompt after licence amendments
- [x] Password-based authentication (bcrypt) for admin portal in production
- [x] Customer editing (PATCH endpoint + edit modal with deployment model change warning)
- [x] NODE_ENV set to production on Azure
- [x] Deployments page with provisioning workflow (deployed Build 06, 27 March 2026)
- [x] Tenant Configuration store with per-deployment key-value config (deployed Build 06, 27 March 2026)
- [x] Prisma migrations for deployments + tenant_configs tables (deployed Build 06, 27 March 2026)

### Build 06 Changes (Deployed 27 March 2026)

**New Prisma Models:**
- `Deployment` — tracks customer deployments (container app name/URL, image tag, database config, connectivity type, custom domain, SSL cert expiry, status)
- `TenantConfig` — per-deployment key-value configuration store (env vars, feature flags, domain settings, notifications)

**New Backend Routes:**
- `GET/POST/PATCH /api/admin/deployments` — deployment CRUD with audit logging
- `PATCH /api/admin/deployments/:id/status` — deployment status changes
- `GET/POST /api/admin/tenant-config/:deploymentId` — tenant config CRUD
- `PATCH/DELETE /api/admin/tenant-config/:deploymentId/:configId` — individual config management
- `POST /api/admin/tenant-config/:deploymentId/bulk` — bulk upsert for quick-add templates

**New Frontend Pages:**
- `DeploymentsPage.tsx` — Deployments management with 4-step provisioning wizard, edit modal, status management, and tenant configuration drawer
- Tenant config drawer with: custom domain/SSL, config entries grouped by category, quick-add templates (Standard V5 Env Vars, Feature Flags), secret masking

**TS Build Fixes:**
- `deployments.ts` — added `req.adminUser` guard in POST handler (TS18048)
- `DeploymentsPage.tsx` — `colour` → `color` on Ant Design Tag, `as DatabaseType`/`as ConnectivityType` casts on form values, `Typography.Subtitle` → `Typography.Title`

---

## Deployment Notes

### Azure Deployment (Live)

**Deployed:** 26 March 2026

| Resource | Name | URL |
|----------|------|-----|
| Licence Server API | `procuro-licence-server` | https://procuro-licence-server.grayriver-3c973afe.uksouth.azurecontainerapps.io/ |
| Admin Portal | `procuro-licence-admin` | https://procuro-licence-admin.grayriver-3c973afe.uksouth.azurecontainerapps.io/ |
| Database | `procuro_licence` on `procuro-db` | Same Azure PostgreSQL server as V5 |
| Container Registry | `procuroacr` | Image tags: `pls-build10` |
| Health Check | — | https://procuro-licence-server.grayriver-3c973afe.uksouth.azurecontainerapps.io/health |

**Container App Resources:**
- API: 0.5 vCPU, 1 GiB memory, 1 replica
- Admin Portal: 0.25 vCPU, 0.5 GiB memory, 1 replica

**Environment Variables (API):**
- `DATABASE_URL` — PostgreSQL connection to `procuro_licence` database on `procuro-db`
- `NODE_ENV=production`
- `JWT_SECRET` — generated via `openssl rand -hex 32`
- `HMAC_SECRET` — generated via `openssl rand -hex 32` (V5 instances need the same secret)
- `CORS_ORIGIN` — locked to admin portal URL
- `PORT=3100`, `LOG_LEVEL=info`

**Environment Variables (Admin Portal):**
- `API_URL` — points to the licence server API Container App URL

### Rebuild & Redeploy Commands

```bash
# From Azure Cloud Shell
cd ~/procuro-licence-server
git pull

# Build API image (use unique tag each time)
az acr build --registry procuroacr --image procuro-licence-server:pls-buildXX --file Dockerfile .

# Build Admin Portal image
az acr build --registry procuroacr --image procuro-licence-admin:pls-buildXX --file admin-portal/Dockerfile.production ./admin-portal

# Deploy API
az containerapp update -n procuro-licence-server -g procuro-production --image procuroacr-eshnbwa0fvfshzg0.azurecr.io/procuro-licence-server:pls-buildXX

# Deploy Admin Portal
az containerapp update -n procuro-licence-admin -g procuro-production --image procuroacr-eshnbwa0fvfshzg0.azurecr.io/procuro-licence-admin:pls-buildXX
```

**Important:** Always use a unique image tag (e.g. `pls-build05`, `pls-build06`) — Azure caches images by tag.

### Deployment History

| Build | Date | API Tag | Admin Tag | Notes |
|-------|------|---------|-----------|-------|
| 04 | 26 March 2026 | pls-build04 | pls-build04 | First Azure deployment. API + admin portal + database seeded. |
| 05 | 27 March 2026 | pls-build05 | pls-build05 | Password auth for admin portal (bcrypt), customer editing (PATCH endpoint + edit modal), deployment model change audit logging, NODE_ENV set to production. |
| 06 | 27 March 2026 | pls-build06 | pls-build06 | Deployments page (4-step provisioning wizard), Tenant Configuration store (key-value config, secret masking, quick-add templates), custom domain/SSL tracking, TS build fixes. |
| 07 | 27 March 2026 | pls-build07 | pls-build07 | Smart provisioning wizard (auto-populate from customer deployment model), acronym naming, latest image tag default, seed passwordHash fix. Admin login now works. |
| 08 | 30 March 2026 | pls-build08 | pls-build08 | Pre-provisioning brief — "Prepare Azure Setup" generates resource summary + Azure CLI script per customer (SaaS/Hybrid). Copy-to-clipboard and print. |
| 09 | 30 March 2026 | pls-build09 | pls-build09 | Fix provisioning — express-async-errors, wizard form preservation (display:none), per-step validation, Container App URL optional, better POST error messages. |
| 10 | 30 March 2026 | pls-build10 | pls-build10 | Deployment lifecycle — V5 build ID tracking (v5BuildId field), setup scripts drawer, provision upgrade modal (backend+frontend), status column shows build number, Actions dropdown menu, GitHub link, correct V5 image names (procurov5-backend/frontend), uniqueness constraints on containerAppName/customDomain/databaseName+host. DB migration: 20260330_add_v5_build_id. |

### Local Development

**Docker Compose:** `docker-compose up --build`
**Database port:** 5433 (avoids conflict with V5's PostgreSQL on 5432)
**API port:** 3100
**Admin portal port:** 5174 (Vite dev server)
**GitHub:** https://github.com/markwalker-pcs/procuro-licence-server.git

---

*Pro-curo Software Limited — Registered in England and Wales (Company No. 07510777)*
