# Paperclip MERN — Backend Core, Auth, Vault & Media Storage (Developer 1)

This repository contains the production-grade backend core for **Paperclip MERN — Autonomous AI Workforce Control Plane**.

All deliverables for **Developer 1 (Backend Core, Auth, Vault & Media Storage)** have been implemented and validated with 100% passing automated test suites.

---

## 1. System Overview & Technology Stack

- **Runtime**: Node.js 20+ / Express.js
- **Database**: MongoDB (Mongoose ODM) with TTL auto-cleanup indexes
- **Security**: AES-256-GCM encrypted Secrets Vault, bcryptjs password hashing, JWT authentication
- **Storage Strategy**: Hybrid architecture — text/metadata in MongoDB Atlas, media uploads signed for Cloudinary Free
- **Tenant Isolation**: Multi-tenant workspace security guaranteeing Company A data is completely invisible to Company B (403/404)
- **Accounting**: Strict integer microcent tracking (`1 cent = 10,000 microcents`) to eliminate floating-point rounding errors

---

## 2. Shared Mongoose Models (`server/src/models/`)

All 14 schemas are defined and exported via `server/src/models/index.js` for Developers 2, 3, and 4:

| Model | Key Fields & Responsibilities | Indexes / TTL |
| :--- | :--- | :--- |
| `User` | `name`, `email` (unique), `password` (bcrypt) | `email: 1` |
| `Company` | `name`, `issuePrefix`, `issueCounter`, `budgetMonthlyCents`, `spentMonthlyMicrocents`, `ownerUserId`, `members` | `ownerUserId: 1`, `issuePrefix: 1` |
| `Agent` | `companyId`, `name`, `role`, `reportsTo`, `adapter`, `model`, `status`, `instructionsMarkdown`, `budgetMonthlyCents`, `spentMonthlyMicrocents` | `{ companyId: 1, status: 1 }`, `{ companyId: 1, reportsTo: 1 }` |
| `AgentConfigRevision` | `agentId`, `companyId`, `revisionNumber`, `snapshot`, `reason` | `{ agentId: 1, revisionNumber: -1 }` |
| `Goal` | `companyId`, `title`, `description`, `status`, `targetDate` | `{ companyId: 1, status: 1 }` |
| `Issue` | `companyId`, `goalId`, `issueNumber`, `issueKey`, `status`, `priority`, `assigneeAgentId`, `acceptanceCriteria`, `deliverables`, `lockedByRunId`, `lockExpiresAt`, `lastHydratedCommentCount` | `{ companyId: 1, issueKey: 1 }` (unique), `{ companyId: 1, status: 1 }`, `{ lockedByRunId: 1, lockExpiresAt: 1 }` |
| `IssueComment` | `issueId`, `companyId`, `authorType`, `content`, `mentions` | `{ issueId: 1, createdAt: 1 }` (delta hydration) |
| `WakeupQueue` | `companyId`, `agentId`, `triggerType`, `targetIssueId`, `status`, `coalescedCount`, `payload` | **TTL Index**: `createdAt: 1` (7 days), `{ companyId: 1, agentId: 1, status: 1 }` |
| `HeartbeatRun` | `companyId`, `agentId`, `targetIssueId`, `status`, `lockExpiresAt`, `logs` (max 50), `inputTokens`, `outputTokens`, `costMicrocents` | `{ companyId: 1, status: 1 }`, `{ status: 1, lockExpiresAt: 1 }` (watchdog) |
| `Approval` | `companyId`, `agentId`, `type`, `payload`, `status`, `decisionNote` | `{ companyId: 1, status: 1 }` |
| `BudgetIncident` | `companyId`, `agentId`, `threshold`, `spentMonthlyMicrocents`, `budgetMonthlyCents`, `status` | `{ companyId: 1, status: 1 }`, `{ agentId: 1, status: 1 }` |
| `CostEvent` | `companyId`, `agentId`, `runId`, `adapter`, `model`, `inputTokens`, `outputTokens`, `costMicrocents` | `{ companyId: 1, createdAt: -1 }` |
| `CompanySecret` | `companyId`, `key`, `encryptedValue`, `iv`, `authTag`, `maskedPreview` | `{ companyId: 1, key: 1 }` (unique) |
| `ActivityLog` | `companyId`, `actorType`, `actorName`, `action`, `entityType`, `details`, `ip` | **TTL Index**: `createdAt: 1` (14 days), `{ companyId: 1, createdAt: -1 }` |

---

## 3. Endpoints Implemented (Developer 1 Domain)

### Authentication
- `POST /api/auth/register` — Register a new account (`{ name, email, password }` -> 201)
- `POST /api/auth/login` — Authenticate and receive JWT (`{ email, password }` -> 200)
- `GET /api/auth/me` — Retrieve active profile (Bearer JWT required)

### Companies & Workspaces
- `GET /api/companies` — List companies owned or joined by the user
- `POST /api/companies` — Create workspace (`{ name, description, issuePrefix, budgetMonthlyCents, requireHireApproval }` -> 201)
- `GET /api/companies/:cid` — Get company details (Tenant isolated)
- `PATCH /api/companies/:cid` — Update workspace settings (Tenant isolated)
- `DELETE /api/companies/:cid` — Delete workspace and cascade-delete child records (Owner only)
- `POST /api/companies/:cid/seed-demo` — **1-Click Demo Startup Seeder**:
  - Seeds 4 agents: Elena Vance (CEO), Marcus Brody (CTO), Kaelen Voss (Senior Engineer), Sarah Connor (Growth Marketer) with full hierarchical `reportsTo` tree
  - Seeds 2 strategic goals
  - Seeds 3 starter issues with atomic issue numbering (`PAP-1`, `PAP-2`, `PAP-3`) and acceptance criteria
- `GET /api/companies/:cid/export` — JSON company export with all secrets and passwords **strictly scrubbed**
- `POST /api/companies/import` — JSON company import mapping IDs and creating an isolated workspace
- `GET /api/companies/:cid/audit/export` — RFC 4180 CSV export of workspace activity logs

### AES-256-GCM Secrets Vault
- `GET /api/companies/:cid/secrets` — List secrets with masked preview (`gsk_••••9a2f`)
- `POST /api/companies/:cid/secrets` — Securely store API key (`{ key, value }` -> 201). Encrypts with AES-256-GCM; raw key is never stored or returned
- `DELETE /api/companies/:cid/secrets/:key` — Delete API key from vault

### Media Storage (Cloudinary Free Signed Uploads)
- `POST /api/uploads/sign` — Generates signed upload credentials (`{ timestamp, signature, apiKey, cloudName, folder }`) allowing direct-to-cloud file uploads without exposing Cloudinary secrets

---

## 4. Integration Guidelines for Developer 2, 3, and 4

1. **Developer 2 (Heartbeat Engine & AI Adapters)**:
   - Call `vaultService.getDecryptedSecret(companyId, 'GROQ_API_KEY')` inside `adapterExecutor.js` to retrieve in-memory API keys.
   - For atomic checkout locks: use `Issue.findOneAndUpdate` with `lockedByRunId` and `lockExpiresAt: now + 5 mins` as documented in TRD Section 2.2.
   - For delta hydration: query `IssueComment.find({ issueId }).skip(issue.lastHydratedCommentCount)`.
2. **Developer 3 (Frontend Dashboard & Kanban)**:
   - Store JWT in localStorage/cookie; attach `Authorization: Bearer <token>` to requests.
   - Pass `x-company-id` header or `:cid` URL param for tenant-scoped operations.
   - Use `POST /api/uploads/sign` to upload deliverables directly to Cloudinary and store the returned `secure_url` in `Issue.deliverables`.
3. **Developer 4 (Org Chart, Governance, Budgets)**:
   - Call `POST /api/companies/:cid/seed-demo` from the "Load Demo Company" button.
   - Call `GET /api/companies/:cid/export` and `POST /api/companies/import` for workspace portability.
   - Call `GET /api/companies/:cid/audit/export` for the CSV audit log download.

---

## 5. Running Tests Locally

```bash
cd server
npm test
# Run coverage:
npm run test:coverage
```
All 6 test suites and 30 tests run in under 10 seconds against an isolated in-memory MongoDB server.
