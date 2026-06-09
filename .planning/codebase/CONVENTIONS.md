# Coding Conventions

**Analysis Date:** 2026-06-09

## Naming Patterns

**Files:**
- `kebab-case` for all source files: `contract.ts`, `registry.ts`, `facade.ts`, `register.ts`
- Test files mirror the module they test with a descriptive suffix: `email-send-actor-resolution.test.ts`, `import-boundary.test.ts`
- Directory `__tests__/` for co-located test suites

**Functions:**
- `camelCase` for all exported functions: `registerEmailConnector`, `configureEmailSystem`, `sendEmailThroughSystem`, `findReplyThroughSystem`, `listInstalledEmailConnectors`
- Factory functions follow `createXModule()` naming convention shared across the monorepo: `createEmailModule`
- Internal/private helpers use `_` prefix for private-by-convention symbols: `_clearForTests`, `_readDeps`, `_writeDeps`, `_globalHolder`, `_depsHolder`

**Variables:**
- `camelCase` for local variables and module-level constants
- `SCREAMING_SNAKE_CASE` for module-level symbol keys: `EMAIL_CONNECTOR_REGISTRY_KEY`, `EMAIL_SYSTEM_DEPS_KEY`

**Types / Interfaces:**
- `PascalCase` for all types and interfaces: `EmailConnector`, `EmailSystemDeps`, `EmailSendActorResolver`, `EmailConnectorRegistryImpl`
- `type` keyword preferred over `interface` for simple object shapes
- `interface` used for DI contracts with multiple method signatures: `EmailSystemDeps` in `src/facade.ts`

**Classes:**
- `PascalCase` with `Impl` suffix for implementation classes not exported directly: `EmailConnectorRegistryImpl`

## Code Style

**Formatting:**
- Not detected (no `.prettierrc` or `biome.json`). TypeScript strict mode enforces correctness.

**Linting:**
- Not detected locally (no `.eslintrc*`). The `src/index.ts` doc comment references an ESLint `consistent-type-imports` rule enforced in the monorepo for connector packages.

**TypeScript Config** (`tsconfig.json`):
- `strict: true`, `noImplicitAny: false` (pragmatic — overridden per-repo)
- `verbatimModuleSyntax: true` — all type-only imports must use `import type { ... }`
- `isolatedModules: true` — no const enums, each file compilable alone
- Target: `ES2023`, module: `ESNext`, resolution: `bundler`

## Import Organization

**Order (observed pattern):**
1. Side-effect imports: `import "server-only";` always first in server files
2. External packages: `import { z } from "zod";`
3. Internal type imports: `import type { ... } from "./contract";`
4. Internal runtime imports: `import { emailConnectorRegistry } from "./registry";`

**Rule — type imports:**
- Provider/consumer packages must use `import type` for contract types. Enforced by lint rule. Example from `src/registry.ts`:
  ```typescript
  import type { EmailConnector } from "./contract";
  ```

**Path Aliases:**
- No `@/` aliases within this package. The `@/` prefix is FORBIDDEN in runtime imports (enforced by `src/__tests__/import-boundary.test.ts`).

## Error Handling

**Patterns:**
- Throw `Error` with fully-qualified, actionable messages that include the package name, what went wrong, and how to fix it:
  ```typescript
  throw new Error(
    "@cinatra-ai/email-connector: email system not configured. " +
      "Call configureEmailSystem(deps) at boot (typically from " +
      "src/lib/register-email-providers.ts).",
  );
  ```
- Best-effort async operations use `void promise.catch(warn)` so transport errors never propagate past the send success:
  ```typescript
  void deps.saveSentEmailObject({...}).catch((err) => {
    console.warn(`[email-connector] sent-email object write failed (send succeeded): ${err...}`);
  });
  ```
- Guard functions (`getDeps`, `getProvider`) centralize precondition checks and throw early; callers stay clean.

## Logging

**Framework:** `console.warn` / `console.warn` (no structured logger dependency)

**Patterns:**
- Warn-on-replace in registry: `console.warn("[emailConnectorRegistry] Replacing existing email connector...")`
- Warn on best-effort failure: `console.warn("[email-connector] sent-email object write failed...")` — bracketed module tag prefix for grep-ability.

## Comments

**When to Comment:**
- Every module has a leading block comment (delimited with `// ---`) explaining: what the file is, why design decisions were made, and cross-cutting hazards (e.g., Next.js cross-compilation singleton problem).
- Inline comments explain non-obvious decisions, not what the code does.
- JSDoc (`/** */`) on every exported public function and interface member.

**JSDoc:**
- Used consistently on exported functions and exported interface members.
- `@internal` JSDoc tag marks symbols not part of the public API but exported for test use: `/** @internal Only for tests. */`

## Function Design

**Size:** Functions are small and focused. Public facade functions are 15–30 lines; they delegate immediately to helpers or the registry.

**Parameters:** Prefer single options object `opts?: { ... }` for functions with 2+ optional parameters. Required positional args kept minimal (0–1).

**Return Values:** `async` functions always typed with explicit `Promise<T>`. Nullable returns use `T | null`, never `undefined` for "not found" returns.

## Module Design

**Exports:**
- `src/index.ts` is the single public barrel for the package's `.` export. It re-exports only from internal modules — never declares logic directly.
- `src/register.ts` and `src/mcp/module.ts` are separate named exports declared in `package.json` `exports` map.
- Implementation classes (`EmailConnectorRegistryImpl`) are NOT exported; only the singleton instance and facade functions are.

**Barrel Files:**
- `src/index.ts` acts as the barrel. Internal modules do not re-export from each other beyond what `index.ts` orchestrates.

## Server-Only Guard

- All files with runtime server side effects begin with `import "server-only";` as the very first statement. This prevents accidental client bundle inclusion. Files: `src/registry.ts`, `src/facade.ts`, `src/register.ts`, `src/mcp/module.ts`.

## Cross-Compilation Singleton Pattern

- Shared mutable singletons (registry, configured deps) are anchored on `globalThis` via `Symbol.for(namespaced+versioned key)` to survive Next.js per-compilation module cache splits.
- Keys follow: `"@cinatra-ai/email-connector:<purpose>/v1"`.
- Type assertion pattern: `const _holder = globalThis as unknown as HolderType;`

---

*Convention analysis: 2026-06-09*
