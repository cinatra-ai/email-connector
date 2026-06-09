# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**Email Providers (via pluggable connector interface):**
- Gmail — outbound email and reply-finding via `@cinatra-ai/gmail-connector` (registered at runtime by host)
  - SDK/Client: provider package, not this package
  - Auth: resolved by host via `resolveConnectorId` + `authSession` port
- Resend — outbound email (mentioned in README as supported provider)
  - SDK/Client: provider package, not this package
  - Auth: resolved by host
- Additional providers — any `EmailConnector` implementation registered at boot via `registerEmailConnector()` (`src/registry.ts`)

This package is provider-neutral: it defines the `EmailConnector` interface and `sendEmailThroughSystem` facade (`src/facade.ts`). Actual SMTP/API calls happen inside provider packages that this package never imports.

**MCP (Model Context Protocol):**
- Exposes the `email_send` tool to Cinatra agents
- Two registration paths:
  1. SDK path (`src/register.ts`): `ctx.mcp.registerTool(...)` via `ExtensionHostContext` from `@cinatra-ai/sdk-extensions`
  2. Host-static path (`src/mcp/module.ts`): `createEmailModule()` factory passed a structural `EmailToolServer`

## Data Storage

**Databases:**
- None — this package has no direct DB access
- The host optionally injects `saveSentEmailObject` into `EmailSystemDeps` (`src/facade.ts`) to persist a `@cinatra-ai/email:sent-email` object after a successful send; the concrete implementation lives in the host

**File Storage:**
- Not applicable

**Caching:**
- Not applicable

## Authentication & Identity

**Auth Provider:**
- Host-provided via `authSession` port (one of the `requestedHostPorts` in `package.json`)
- In SDK registration path (`src/register.ts`): `ctx.authSession.getActor()` resolves `userId` and `organizationId` from the trusted request/run context
- In host-static path (`src/mcp/module.ts`): host injects an `EmailSendActorResolver` callback `() => Promise<{ userId?, orgId? }>`
- Actor resolution is NEVER derived from MCP input; always from trusted server context

**Sender Identity Routing:**
- Host injects `resolveConnectorId(opts)` into `EmailSystemDeps` (`src/facade.ts`)
- Routing precedence: explicit `connectorId` → `senderIdentityId` → `userId` primary → `orgId` default → first registered connector

## Monitoring & Observability

**Error Tracking:**
- Not detected — no error tracking SDK imported

**Logs:**
- `console.warn` used in `src/registry.ts` when a connector is replaced by id
- `console.warn` used in `src/facade.ts` for best-effort `saveSentEmailObject` failures (send is not failed)
- Error messages include connector id and list of registered connectors for debugging

## CI/CD & Deployment

**Hosting:**
- Deployed inside the Cinatra monorepo host (not standalone-installable due to `@cinatra-ai/*` optional peer deps)

**CI Pipeline:**
- GitHub Actions — `.github/workflows/ci.yml` and `.github/workflows/release.yml`
- CI jobs: `build` (classify repo, install, typecheck, test, `npm pack --dry-run`) and `kind-gates` (connector kind has no extra gate)
- Node.js 24 via `actions/setup-node@v4`, pnpm via corepack

## Environment Configuration

**Required env vars:**
- None read directly by this package
- Host is responsible for all secrets (email provider API keys, DB credentials)

**Secrets location:**
- All secrets managed by the Cinatra host; not present in this package

## Webhooks & Callbacks

**Incoming:**
- Not applicable — this package sends email only (outbound path)

**Outgoing:**
- Email sends via provider connectors registered at runtime (Gmail, Resend, etc.)
- Reply-finding via `findReplyThroughSystem` (`src/facade.ts`) delegates to the resolved `EmailConnector.findReply()`

## Dev-Mode Override

The facade (`src/facade.ts`) applies a host-injected `applyDevModeOverride(msg)` function to rewrite `to`/`cc`/`bcc` to a single safe address during testing. The host reads the `email-system-development` connector config key and injects the override at boot via `configureEmailSystem(deps)`. This prevents accidental sends to real recipients in non-production environments.

---

*Integration audit: 2026-06-09*
