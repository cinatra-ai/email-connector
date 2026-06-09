# Codebase Concerns

**Analysis Date:** 2026-06-09

## Tech Debt

**Dual registration paths (legacy static + new SDK-native):**
- Issue: The `email_send` MCP tool is registered twice — once via the legacy host-side `createEmailModule` / `registerEmailPrimitives` path (`src/mcp/module.ts`) and again via the new SDK-native `register(ctx)` entry point (`src/register.ts`). The code comment in `src/register.ts` explicitly acknowledges the host's `registerAllCapabilities` must dedupe by tool name to avoid a conflict. This is a maintenance hazard: changes to the tool schema, description, or actor-resolution logic must be kept in sync across both files or they silently diverge.
- Files: `src/register.ts`, `src/mcp/module.ts`
- Impact: Schema or behaviour drift between the two registration paths; a bug fix in one path may not be applied to the other. Runtime deduplication masks the problem rather than eliminating the root cause.
- Fix approach: Once the host→connector cutover retires the legacy static path, delete `src/mcp/module.ts` and its `createEmailModule` / `registerEmailPrimitives` exports. Until then, add a shared helper that both entry points delegate to.

**`emailConnectorRegistry` exposed on the public API surface:**
- Issue: `emailConnectorRegistry` (the internal `EmailConnectorRegistryImpl` instance) is re-exported from `src/index.ts`, giving host code direct access to `_clearForTests()` and the raw `Map`. This was intended as an internal detail.
- Files: `src/index.ts`, `src/registry.ts`
- Impact: External callers can accidentally (or intentionally) mutate registry state, including calling `_clearForTests()` in production code.
- Fix approach: Remove `emailConnectorRegistry` from the `src/index.ts` public surface. Callers that need the list should use `listInstalledEmailConnectors()`; tests should import directly from `src/registry.ts`.

**`globalThis` singleton pattern for cross-compilation sharing:**
- Issue: Both `emailConnectorRegistry` and the facade deps slot are anchored on `globalThis` via `Symbol.for(...)` keys to survive Next.js multi-compilation. This is a known workaround for a framework limitation (documented in comments), not a clean architectural solution.
- Files: `src/registry.ts` (lines 69–76), `src/facade.ts` (lines 89–99)
- Impact: Any future version mismatch (e.g., two versions of the package loaded in the same process) will silently share state across versions. Version bumping the Symbol key (`/v1` → `/v2`) is a manual process with no enforcement.
- Fix approach: Long-term, rely on a host-level DI container or a stable singleton module the framework guarantees to evaluate once. Short-term, add a version-mismatch guard that logs a warning if the existing globalThis entry was written by a different package version.

**`strict: true` + `noImplicitAny: false` inconsistency:**
- Issue: `tsconfig.json` enables `strict` (which sets `noImplicitAny: true`) but then explicitly overrides it with `noImplicitAny: false`. This weakens type safety: implicit `any` is silently permitted in all source files.
- Files: `tsconfig.json`
- Impact: Type holes that `noImplicitAny` would catch are invisible to the compiler. The permissive `registerTool(...args: any[])` structural type in `src/mcp/module.ts` is a visible symptom.
- Fix approach: Remove the `noImplicitAny: false` override and fix any resulting errors. The `registerTool` structural type can be typed more precisely with a union of supported overload signatures.

## Known Bugs

**`saveSentEmailObject` failure is silently swallowed:**
- Symptoms: If the host's `saveSentEmailObject` implementation throws, the error is caught, a `console.warn` is emitted, and the send receipt is returned as though nothing went wrong. The sent-email audit record is silently lost.
- Files: `src/facade.ts` (lines 172–188)
- Trigger: Any transient or persistent failure in the host's objectsClient (network error, quota exceeded, schema validation failure).
- Workaround: None — the caller has no way to detect the failure or retry. The design is intentional ("best-effort") but the silent data loss is undocumented to callers.

## Security Considerations

**Input validation performed twice with potential divergence:**
- Risk: `src/mcp/module.ts` calls `emailSendInputSchema.parse(rawInput)` on the already-parsed input that the MCP SDK passes to the handler, and `src/register.ts` does the same inside its handler. If the schema in the two files is ever updated independently, the validation applied to each registration path can differ.
- Files: `src/mcp/module.ts` (lines 71–72), `src/register.ts` (lines 46–47)
- Current mitigation: Schema objects are identical in both files at present.
- Recommendations: Extract `emailSendInputSchema` to a shared internal module and import it in both registration files to guarantee schema parity.

**`fromEmail` / `fromName` accepted without validation:**
- Risk: The `email_send` tool accepts caller-supplied `fromEmail` and `fromName` fields with no format validation (no `.email()` refinement on `fromEmail`). A malformed address passed through could cause provider-level errors with opaque messages, or in misconfigured providers, sender spoofing.
- Files: `src/mcp/module.ts` (lines 38–40), `src/register.ts` (lines 28–30)
- Current mitigation: Provider packages validate at transport time; exact behaviour is provider-specific.
- Recommendations: Add `z.string().email()` refinement for `fromEmail` in `emailSendInputSchema` in both files (or the shared schema once extracted).

**.npmrc present:**
- `.npmrc` file exists at repo root. Contents not read (may contain registry tokens). Verify it does not contain credentials that should be in CI secrets instead.
- Files: `.npmrc`

## Performance Bottlenecks

**`resolveConnectorId` called on every send with no caching:**
- Problem: The facade calls `deps.resolveConnectorId(...)` on every `sendEmailThroughSystem` invocation. In single-provider deployments the result is always the same connector ID.
- Files: `src/facade.ts` (lines 161–166)
- Cause: No request-level or process-level cache of the resolution result.
- Improvement path: For single-provider deployments the host's `resolveConnectorId` implementation can short-circuit immediately. For multi-provider, a short-lived per-request cache could avoid repeated DB reads in batch scenarios.

## Fragile Areas

**`globalThis` singleton identity relies on Symbol key versioning:**
- Files: `src/registry.ts`, `src/facade.ts`
- Why fragile: If two different versions of `@cinatra-ai/email-connector` are loaded in the same Node process (e.g., during a deployment overlap or a misconfigured monorepo workspace), they share the same `Symbol.for(...)` key and will read/write each other's registry or deps slot, silently mixing incompatible shapes.
- Safe modification: Always bump the `/v1` suffix in the `Symbol.for` key strings when the registry or deps shapes change in a breaking way.
- Test coverage: No test covers the multi-version or multi-compilation scenario; the import-boundary test (`src/__tests__/import-boundary.test.ts`) only checks dependency direction, not runtime singleton identity.

**`_clearForTests()` escape hatch on the registry:**
- Files: `src/registry.ts` (line 59)
- Why fragile: The method is marked `@internal Only for tests` but is accessible to any code that imports `emailConnectorRegistry` (which is currently on the public API surface). A call in production code empties the live registry mid-flight, silently dropping all subsequent sends.
- Safe modification: Remove `emailConnectorRegistry` from public exports (see Tech Debt above).
- Test coverage: Tests use `_clearForTests()` via `beforeEach`; the method is not tested to be absent from production bundles.

## Scaling Limits

**In-memory registry:**
- Current capacity: All registered connectors held in a `Map` in process memory.
- Limit: No hard limit, but the registry is process-local. Horizontal scaling across multiple Node processes (e.g., serverless cold starts) means each process registers connectors independently at boot — consistent as long as boot code always runs `registerEmailConnector`.
- Scaling path: Not a concern for typical deployments; the pattern matches other connector registries in the system.

## Dependencies at Risk

**`zod ^4.4.3` (Zod v4):**
- Risk: Zod v4 is a major version with breaking API changes from v3. The rest of the host codebase may pin Zod v3; mixing versions in the same bundle can cause schema-instance incompatibilities (`z.ZodObject` from v3 not recognised by v4 validators).
- Impact: Runtime validation errors if the host passes a Zod v3 schema instance to a v4 validator, or bundle bloat from duplicating both Zod versions.
- Migration plan: Confirm the host and all other connector packages are aligned on the same Zod major version; if not, pin `zod ^3.x` until the host upgrades.

**`server-only: 0.0.1` (pinned to exact minor):**
- Risk: The `server-only` package is pinned at `0.0.1` with no range. This is intentional (the package has no meaningful releases), but means automatic updates via renovate/dependabot will never apply.
- Impact: Low — the package is a guard shim with no logic; unlikely to have security issues.
- Migration plan: No action required; confirm the pin is intentional in lockfile reviews.

## Missing Critical Features

**No `findReply` coverage in tests:**
- Problem: `findReplyThroughSystem` in `src/facade.ts` is entirely untested. The test suite only covers `sendEmailThroughSystem` actor routing (`src/__tests__/email-send-actor-resolution.test.ts`).
- Blocks: Regressions in reply-matching routing (connector resolution, missing `userId` propagation) would not be caught automatically.

**No test for `configureEmailSystem` / `getDeps` error path:**
- Problem: The `getDeps()` guard in `src/facade.ts` (throws if deps not configured) has no test. A regression that bypasses the guard or changes the error message would not be detected.
- Files: `src/facade.ts` (lines 109–119)

## Test Coverage Gaps

**`findReplyThroughSystem` — untested:**
- What's not tested: Connector resolution, `userId` propagation, null return when no reply found.
- Files: `src/facade.ts` (lines 197–220)
- Risk: Silent regressions in reply-detection routing.
- Priority: Medium

**`configureEmailSystem` / `getDeps` error path — untested:**
- What's not tested: Error thrown when `sendEmailThroughSystem` is called before `configureEmailSystem`.
- Files: `src/facade.ts` (lines 109–119, 151–191)
- Risk: A refactor that accidentally removes the guard would not fail CI.
- Priority: Medium

**`saveSentEmailObject` failure handling — untested:**
- What's not tested: The best-effort catch block that emits `console.warn` and swallows the error.
- Files: `src/facade.ts` (lines 172–188)
- Risk: Swallow-logic could be accidentally removed, promoting a secondary failure to a thrown error that aborts the send response.
- Priority: Low

**`registry.ts` replace-by-id warning — untested:**
- What's not tested: The `console.warn` emitted when the same connector ID is registered twice with a different instance.
- Files: `src/registry.ts` (lines 37–41)
- Risk: Low — guard is defensive logging, not a critical path.
- Priority: Low

---

*Concerns audit: 2026-06-09*
