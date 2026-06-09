# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- TypeScript 5.x (ES2023 target) - All source and test files under `src/`

**Secondary:**
- Not applicable

## Runtime

**Environment:**
- Node.js 24 (specified in `.github/workflows/ci.yml` via `actions/setup-node`)
- ESM-only package (`"type": "module"` in `package.json`)

**Package Manager:**
- pnpm (via corepack, `corepack enable` + `corepack pnpm` in CI)
- Lockfile: not committed (CI uses `--no-frozen-lockfile` for standalone installs)
- `.npmrc` file present (contents not read)

## Frameworks

**Core:**
- None — this is a framework-agnostic connector library, not an application

**Testing:**
- Vitest ^4.1.6 — test runner; config in `vitest.config.ts`; node environment

**Build/Dev:**
- TypeScript compiler (`tsc`) — compiles to `dist/` with declaration maps and source maps
- `tsconfig.json` uses `moduleResolution: bundler`, `module: ESNext`, `target: ES2023`

## Key Dependencies

**Critical:**
- `zod` ^4.4.3 — input validation for the `email_send` MCP tool schema (`src/register.ts`, `src/mcp/module.ts`)
- `server-only` 0.0.1 — marks all server-side modules as server-only; prevents accidental client import (`src/register.ts`, `src/facade.ts`, `src/registry.ts`, `src/mcp/module.ts`)

**Peer (optional):**
- `@cinatra-ai/sdk-extensions` * — provides `ExtensionHostContext`, `EmailConnectorDefinition`, and the email contract types re-exported from `@cinatra-ai/sdk-extensions/email-contract`; declared optional peer so the package can be extracted as a source mirror without a standalone registry

**Infrastructure:**
- None (no DB client, HTTP client, or cloud SDK in direct deps)

## Configuration

**Environment:**
- No environment variables read directly by this package; host injects configuration via `configureEmailSystem(deps)` at boot (`src/facade.ts`)
- `.env` file existence not confirmed (not read per policy)

**Build:**
- `tsconfig.json` — standalone strict TS config; outputs to `dist/`, includes `src/**/*.ts` and `src/**/*.tsx`
- `vitest.config.ts` — includes `src/**/*.test.ts`, node environment

## Package Exports

Three named exports defined in `package.json`:
- `.` → `./src/index.ts` — main public API (types + runtime facade)
- `./register` → `./src/register.ts` — SDK-style server entry (`register(ctx)`)
- `./mcp-module` → `./src/mcp/module.ts` — host-static MCP module factory (`createEmailModule`)

## Cinatra Extension Metadata

Declared in `package.json` under `"cinatra"`:
- `apiVersion`: `cinatra.ai/v1`
- `kind`: `connector`
- `serverEntry`: `./register`
- `requestedHostPorts`: `["mcp", "authSession"]`
- `sdkAbiRange`: `^2`

## Platform Requirements

**Development:**
- Node.js 24+, pnpm via corepack
- Resolved only inside the Cinatra monorepo (host-internal `@cinatra-ai/*` peers are not published to a public registry)

**Production:**
- Deployed as part of the Cinatra monorepo host; the host wires providers and calls `configureEmailSystem()` at boot
- Compatible with Next.js 16 multi-compilation architecture (registry and deps anchored on `globalThis` via `Symbol.for`)

---

*Stack analysis: 2026-06-09*
