<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Host Application                           │
│   (Next.js / Node process — wires deps at boot)                 │
├───────────────────┬─────────────────────────────────────────────┤
│  register.ts      │  mcp/module.ts                              │
│  (SDK ctx path)   │  (legacy static MCP path)                   │
│  `src/register.ts`│  `src/mcp/module.ts`                        │
└────────┬──────────┴────────────────┬────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Facade                                  │
│  `src/facade.ts`                                                │
│  sendEmailThroughSystem / findReplyThroughSystem                │
│  - resolves connectorId via host-injected EmailSystemDeps       │
│  - applies dev-mode override (recipient rewrite)                │
│  - delegates to concrete provider                               │
│  - best-effort: calls saveSentEmailObject after send            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Registry                                 │
│  `src/registry.ts`  (globalThis singleton)                      │
│  EmailConnectorRegistryImpl — keyed by connectorId              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Concrete Provider Package(s)                       │
│  e.g. @cinatra-ai/gmail-connector (external repo)              │
│  Registered via registerEmailConnector() at host boot           │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `index.ts` | Public surface — re-exports contract types and runtime facade | `src/index.ts` |
| `contract.ts` | Re-exports provider-neutral transport types from SDK | `src/contract.ts` |
| `registry.ts` | globalThis-anchored singleton; stores registered EmailConnector impls | `src/registry.ts` |
| `facade.ts` | Single chokepoint for all outbound sends; owns routing, dev-mode override, and optional post-send persistence hook | `src/facade.ts` |
| `register.ts` | SDK `ExtensionHostContext` server entry; registers `email_send` MCP tool via `ctx.mcp.registerTool` | `src/register.ts` |
| `mcp/module.ts` | Legacy static MCP path; `createEmailModule()` factory + `registerEmailPrimitives()` for host wiring in `src/lib/mcp-server.ts` | `src/mcp/module.ts` |

## Pattern Overview

**Overall:** Provider-neutral facade + registry with dependency-injection for host-side routing and persistence.

**Key Characteristics:**
- Contract types live in `@cinatra-ai/sdk-extensions/email-contract` (not in this package) so concrete providers depend only on the SDK — never on this facade package.
- The registry and facade deps are anchored on `globalThis` via `Symbol.for()` keys to survive Next.js 16's per-compilation module cache splits.
- Host wires concrete routing, dev-mode override, and persistence hooks at boot via `configureEmailSystem(deps)`.
- Two parallel MCP registration paths coexist: the new SDK `ctx`-based `register(ctx)` entry (`src/register.ts`) and the legacy static `createEmailModule()` factory (`src/mcp/module.ts`). The host dedupes by tool name.

## Layers

**Contract Layer:**
- Purpose: Provider-neutral TypeScript types for the email transport protocol
- Location: `src/contract.ts` (re-exports from `@cinatra-ai/sdk-extensions/email-contract`)
- Contains: `EmailConnector`, `EmailConnectorId`, `EmailSystemMessage`, `EmailSendReceipt`, `EmailReplyMatch`, `EmailConnectorStatusResult`, `EmailConnectorDefinition`
- Depends on: `@cinatra-ai/sdk-extensions`
- Used by: facade, registry, MCP modules, and (as `import type` only) all concrete provider packages

**Registry Layer:**
- Purpose: In-memory, globalThis-anchored store of registered EmailConnector instances
- Location: `src/registry.ts`
- Contains: `EmailConnectorRegistryImpl` (Map keyed by connectorId), `registerEmailConnector()`, `listInstalledEmailConnectors()`, `emailConnectorRegistry` singleton
- Depends on: `src/contract.ts`
- Used by: `src/facade.ts`

**Facade Layer:**
- Purpose: Provider-agnostic send/findReply orchestration; single chokepoint for all email operations
- Location: `src/facade.ts`
- Contains: `configureEmailSystem()`, `sendEmailThroughSystem()`, `findReplyThroughSystem()`, `EmailSystemDeps` interface, globalThis deps slot
- Depends on: `src/registry.ts`, `src/contract.ts`
- Used by: `src/register.ts`, `src/mcp/module.ts`, host application

**MCP Tool Layer:**
- Purpose: Expose `email_send` as an MCP tool in two complementary paths
- Location: `src/register.ts` (SDK ctx path), `src/mcp/module.ts` (legacy static path)
- Contains: Zod input schema, actor resolution, tool handler
- Depends on: `src/facade.ts`, `@cinatra-ai/sdk-extensions` (register.ts only), `zod`
- Used by: host MCP server wiring

## Data Flow

### Send Email (SDK ctx path — `register.ts`)

1. Host MCP server receives `email_send` tool call
2. `register(ctx)` handler fires (`src/register.ts:46`)
3. Actor resolved from trusted context: `ctx.authSession.getActor()` (`src/register.ts:52`)
4. `sendEmailThroughSystem(msg, opts)` called (`src/facade.ts:151`)
5. `deps.resolveConnectorId(opts)` called — host impl picks provider (`src/facade.ts:161`)
6. `emailConnectorRegistry.get(connectorId)` returns provider (`src/facade.ts:121`)
7. `deps.applyDevModeOverride(msg)` rewrites recipients in dev mode (`src/facade.ts:168`)
8. `connector.send(msgWithOverride, { userId })` delegates to concrete provider (`src/facade.ts:169`)
9. Best-effort: `deps.saveSentEmailObject(...)` persists a sent-email semantic object (`src/facade.ts:173`)
10. `EmailSendReceipt` returned to caller

### Send Email (Legacy static path — `mcp/module.ts`)

1. Host calls `createEmailModule({ resolveActor })` and wires result into `McpRuntimeToolServer` (`src/mcp/module.ts:120`)
2. MCP tool invocation triggers handler (`src/mcp/module.ts:70`)
3. `resolveActor()` (host-injected) returns `{ userId, orgId }` (`src/mcp/module.ts:74`)
4. `sendEmailThroughSystem(msg, opts)` called — same facade path as above
5. Result wrapped in MCP content envelope and returned

### Find Reply

1. Caller invokes `findReplyThroughSystem(opts)` (`src/facade.ts:197`)
2. Same routing chain: `deps.resolveConnectorId` → registry lookup
3. `connector.findReply(opts)` called on concrete provider
4. Returns `EmailReplyMatch | null`

**State Management:**
- Registry state: globalThis-anchored via `Symbol.for("@cinatra-ai/email-connector:registry/v1")` — persists for Node process lifetime, survives Next.js compilation splits
- Facade deps state: globalThis-anchored via `Symbol.for("@cinatra-ai/email-connector:facade-deps/v1")` — set once at boot by host via `configureEmailSystem()`

## Key Abstractions

**EmailConnector Interface:**
- Purpose: The contract every transport provider must implement (`send`, `findReply`, `definition`)
- Examples: Implemented by `@cinatra-ai/gmail-connector` (external)
- Pattern: Structural interface defined in `@cinatra-ai/sdk-extensions/email-contract`; imported as `import type` by providers

**EmailSystemDeps Interface:**
- Purpose: Host-side DI contract for routing policy and persistence hooks
- Examples: `src/facade.ts:43`
- Pattern: Host injects concrete impl once at boot via `configureEmailSystem(deps)`; facade reads from globalThis slot

**EmailConnectorRegistryImpl:**
- Purpose: Replace-by-id in-memory Map with `_clearForTests()` escape hatch
- Examples: `src/registry.ts:32`
- Pattern: globalThis singleton; populated at host boot, read by facade on every send

## Entry Points

**Public Package Entry (`.`):**
- Location: `src/index.ts`
- Triggers: Any consumer importing `@cinatra-ai/email-connector`
- Responsibilities: Re-exports all contract types and runtime facade functions

**SDK Server Entry (`./register`):**
- Location: `src/register.ts`
- Triggers: Cinatra runtime loader activates server entries at boot
- Responsibilities: Registers `email_send` MCP tool via `ctx.mcp.registerTool`

**Legacy MCP Module Entry (`./mcp-module`):**
- Location: `src/mcp/module.ts`
- Triggers: Host calls `createEmailModule()` and wires result into `McpRuntimeToolServer`
- Responsibilities: Provides `registerCapabilities(server)` and `registerEmailPrimitives(server, resolveActor)`

## Architectural Constraints

- **Server-only:** `src/registry.ts`, `src/facade.ts`, and `src/register.ts` all begin with `import "server-only"` — these modules must never be bundled into a client/edge context.
- **Global state:** Registry and facade deps are stored on `globalThis` using `Symbol.for` keys. Files: `src/registry.ts:69-76`, `src/facade.ts:89-99`.
- **Circular imports:** None detected.
- **Import boundary:** No runtime imports from `@/lib/*`, `src/` path climbs, or other concrete `*-connector` packages are permitted. Enforced by `src/__tests__/import-boundary.test.ts`.
- **Type-only imports from providers:** Concrete provider packages must use `import type` for all contract types from this package — enforced by ESLint `consistent-type-imports` rule.

## Anti-Patterns

### Direct connector import from provider packages

**What happens:** A provider package (e.g. `gmail-connector`) adds a runtime import of `@cinatra-ai/email-connector` beyond contract types.
**Why it's wrong:** Reverses the dependency arrow — providers become coupled to the facade, preventing the contract from living solely in `sdk-extensions`.
**Do this instead:** Provider packages must only use `import type { EmailConnector, ... } from "@cinatra-ai/sdk-extensions/email-contract"`. Runtime registration flows through `registerEmailConnector()` called by the host.

### Module-level singleton without globalThis anchoring

**What happens:** Using `export const registry = new Impl()` at module level in a Next.js 16 project.
**Why it's wrong:** Next.js 16 produces separate bundler compilations; each compilation gets its own module instance. The instrumentation compilation registers connectors into one instance while the route handler compilation reads a different empty instance.
**Do this instead:** Anchor singletons on `globalThis` via a namespaced `Symbol.for()` key as done in `src/registry.ts:69-76` and `src/facade.ts:89-99`.

## Error Handling

**Strategy:** Fail-fast for missing configuration; best-effort for optional post-send side effects.

**Patterns:**
- `getDeps()` throws immediately with an actionable message if `configureEmailSystem` was never called (`src/facade.ts:109`)
- `getProvider(id)` throws with the full list of registered connectors if the resolved ID is not registered (`src/facade.ts:121`)
- `saveSentEmailObject` failures are caught and logged as warnings; they never fail the send (`src/facade.ts:182-187`)

## Cross-Cutting Concerns

**Logging:** `console.warn` for registry override and best-effort persistence failures; no structured logger dependency.
**Validation:** Zod schemas for MCP tool input in both `src/register.ts` and `src/mcp/module.ts`.
**Authentication:** Actor resolution is host-injected — via `ctx.authSession.getActor()` in the SDK path, or via a host-provided `EmailSendActorResolver` function in the legacy MCP path. The facade never reads MCP SDK `extra` for actor data.

---

*Architecture analysis: 2026-06-09*
