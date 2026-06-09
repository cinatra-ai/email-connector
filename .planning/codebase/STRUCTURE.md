# Codebase Structure

**Analysis Date:** 2026-06-09

## Directory Layout

```
email-connector/
├── src/
│   ├── __tests__/                        # Vitest test files
│   │   ├── email-send-actor-resolution.test.ts  # MCP handler trusted-actor tests
│   │   └── import-boundary.test.ts       # Regression: no forbidden runtime imports
│   ├── mcp/
│   │   └── module.ts                     # Legacy static MCP module (createEmailModule)
│   ├── contract.ts                       # Re-exports transport types from sdk-extensions
│   ├── facade.ts                         # Provider-agnostic send/findReply facade (server-only)
│   ├── index.ts                          # Public package entry — types + runtime exports
│   ├── register.ts                       # SDK ExtensionHostContext server entry
│   └── registry.ts                       # globalThis-anchored connector registry (server-only)
├── .github/
│   └── workflows/
│       ├── ci.yml                        # CI pipeline
│       └── release.yml                   # Release workflow
├── .npmrc                                # npm registry config
├── LICENSE                               # Apache-2.0
├── README.md                             # Package documentation
├── package.json                          # Package manifest with cinatra metadata
├── tsconfig.json                         # TypeScript config
└── vitest.config.ts                      # Vitest test runner config
```

## Directory Purposes

**`src/`:**
- Purpose: All source code — contract types, registry, facade, MCP tool registrations
- Contains: TypeScript modules (ESM, `"type": "module"`)
- Key files: `index.ts` (public API), `facade.ts` (core logic), `registry.ts` (singleton store)

**`src/__tests__/`:**
- Purpose: Vitest unit and regression tests
- Contains: Actor-resolution behavioral tests and import-boundary enforcement tests
- Key files: `email-send-actor-resolution.test.ts`, `import-boundary.test.ts`

**`src/mcp/`:**
- Purpose: Legacy static MCP module path — kept until host→connector cutover retires it
- Contains: `module.ts` with `createEmailModule()` factory and `registerEmailPrimitives()`
- Key files: `src/mcp/module.ts`

**`.github/workflows/`:**
- Purpose: CI and release automation
- Contains: `ci.yml`, `release.yml`
- Generated: No
- Committed: Yes

## Key File Locations

**Entry Points:**
- `src/index.ts`: Default package export (`.`) — all public types and runtime functions
- `src/register.ts`: `./register` export — SDK ExtensionHostContext server entry
- `src/mcp/module.ts`: `./mcp-module` export — legacy static MCP factory

**Configuration:**
- `package.json`: Package manifest; declares `cinatra` metadata block with `serverEntry`, `requestedHostPorts`, `sdkAbiRange`
- `tsconfig.json`: TypeScript compiler settings
- `vitest.config.ts`: Test runner configuration
- `.npmrc`: npm registry settings (existence noted; contents not read)

**Core Logic:**
- `src/facade.ts`: `sendEmailThroughSystem`, `findReplyThroughSystem`, `configureEmailSystem`, `EmailSystemDeps`
- `src/registry.ts`: `emailConnectorRegistry`, `registerEmailConnector`, `listInstalledEmailConnectors`
- `src/contract.ts`: Type re-exports from `@cinatra-ai/sdk-extensions/email-contract`

**Testing:**
- `src/__tests__/email-send-actor-resolution.test.ts`: Behavioral tests for trusted-actor DI in MCP handler
- `src/__tests__/import-boundary.test.ts`: AST-level import scanner enforcing no forbidden runtime deps

## Naming Conventions

**Files:**
- kebab-case for all source files: `email-send-actor-resolution.test.ts`, `mcp/module.ts`
- Test files: `<subject>.test.ts` in `src/__tests__/`

**Directories:**
- kebab-case: `__tests__/`, `mcp/`
- Double-underscore prefix for test directory: `__tests__`

**Exports:**
- Named exports only; no default exports anywhere in `src/`
- Type-only re-exports use `export type { ... }` syntax

## Where to Add New Code

**New transport operation (e.g. `scheduleEmailThroughSystem`):**
- Add method to `EmailConnector` interface in `@cinatra-ai/sdk-extensions/email-contract` (external)
- Add facade function to `src/facade.ts` following the pattern of `sendEmailThroughSystem`
- Re-export from `src/index.ts`

**New MCP tool (e.g. `email_draft`):**
- Register via `ctx.mcp.registerTool` in `src/register.ts` (SDK path)
- Optionally mirror in `src/mcp/module.ts` for the legacy static path
- Add Zod input schema inline in the same file

**New test:**
- Place in `src/__tests__/<subject>.test.ts`
- Mock `server-only` with `vi.mock("server-only", () => ({}))`
- Mock `../facade` when testing MCP handler isolation

**Utilities:**
- There is no shared utility directory. Inline helpers in the module that needs them (e.g. `nonEmpty` in `src/register.ts` and `src/mcp/module.ts`).

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents consumed by `/gsd-plan-phase` and `/gsd-execute-phase`
- Generated: Yes (by gsd-map-codebase)
- Committed: Per project convention (not excluded by default)

**`.github/`:**
- Purpose: GitHub Actions CI/CD workflows
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-06-09*
