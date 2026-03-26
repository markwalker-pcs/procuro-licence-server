# Pro-curo Licence Server — Project Notes

> **Owner:** Pro-curo Software Limited
> **Repository:** https://github.com/markwalker-pcs/procuro-licence-server.git
> **Architecture Document:** `Pro-curo V5 - Licensing Server Technical Architecture.docx`
> **Last Updated:** 26 March 2026

---

## Current Status

**Phase:** Phase 1–3 complete, Phase 4 (Licence Client Package) in progress — core implementation done
**Current Build:** PLS-20260326-2230-04
**Build Status:** Docker build passing, server running locally on port 3100
**Deployed:** No — local Docker only (production target: Azure App Service B1, UK South)
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
| Phase 4 — Licence Client Package | March–April 2026 | **In Progress** — `@pro-curo/licence-client` package created, V5 backend + frontend integration done, per-user and concurrent licensing implemented |
| Phase 5 — Testing & Hardening | April–May 2026 | Not started — E2E tests, security review, pen testing, load testing |
| Phase 6 — Production Deployment | May 2026 | Not started — Azure deployment, DNS, SSL, monitoring |

---

## Next Steps

1. **Run seed script** — `docker exec -it procuro-licence-server npx prisma db seed`
2. **Test check-in flow end-to-end** — POST to `/api/v1/check-in` with test licence key
3. **Test amendment flow** — Issue licence with invoice ref, amend with new invoice ref, verify history
4. **Test offline file generation** — Generate .lic file, verify Ed25519 signature
5. **Push to GitHub** — https://github.com/markwalker-pcs/procuro-licence-server.git
6. **Begin Phase 4** — `@pro-curo/licence-client` npm package for V5 integration

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

---

## Known Issues / TODOs

- [ ] No unit or integration tests yet
- [ ] Azure AD SSO not implemented (using dev JWT login)
- [ ] Not pushed to GitHub yet
- [ ] Licence keys stored as plaintext in dev seed (bcrypt hashing in check-in flow works, but POST /licences stores plaintext — needs fixing before production)
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

---

## Deployment Notes

**Local development:** Docker Compose (`docker-compose up --build`)
**Production target:** Azure App Service B1 (UK South), Azure Database for PostgreSQL Burstable B1ms
**Estimated monthly cost:** £27–£52/month
**GitHub:** https://github.com/markwalker-pcs/procuro-licence-server.git

---

*Pro-curo Software Limited — Registered in England and Wales (Company No. 07510777)*
