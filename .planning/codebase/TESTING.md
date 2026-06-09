# Testing Patterns

**Analysis Date:** 2026-06-09

## Test Framework

**Runner:**
- Vitest ^4.1.6
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`)

**Run Commands:**
```bash
npm test          # Run all tests (vitest run — no watch)
```

Watch mode and coverage commands are not configured in `package.json` scripts; run directly via:
```bash
npx vitest        # Watch mode
npx vitest --coverage  # Coverage (requires @vitest/coverage-* peer)
```

## Test File Organization

**Location:**
- All tests live in `src/__tests__/` (separate directory, not co-located with source files)

**Naming:**
- `<feature-description>.test.ts` — descriptive kebab-case names, not mirroring the source file name 1:1
- Examples: `import-boundary.test.ts`, `email-send-actor-resolution.test.ts`

**Structure:**
```
src/
  __tests__/
    import-boundary.test.ts
    email-send-actor-resolution.test.ts
```

**Vitest include pattern** (`vitest.config.ts`):
```typescript
include: ["src/**/*.test.ts"]
```
Environment: `node` (no jsdom).

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("<feature> — <scenario description>", () => {
  beforeEach(() => spy.mockClear());

  it("<specific behaviour assertion>", async () => {
    // arrange
    // act
    // assert
    expect(result).toBe(expected);
  });
});
```

**Patterns:**
- `describe` names use em-dash to separate subject from scenario: `"email_send static handler — trusted actor resolution"`
- `it` descriptions are full sentences starting with a verb: `"passes the host-resolved userId/orgId to sendEmailThroughSystem (NOT from extra)"`
- `beforeEach` used to reset spies between tests: `sendSpy.mockClear()`
- Arrange inline within `it` blocks — no shared `let` state between tests except the spy itself

## Mocking

**Framework:** Vitest `vi.mock` / `vi.fn`

**Patterns:**
```typescript
// Mock `server-only` (throws outside Next bundle) before any imports
vi.mock("server-only", () => ({}));

// Mock a module to capture call arguments
const sendSpy = vi.fn(async (..._args: unknown[]) => ({
  providerId: "test",
  providerMessageId: "m1",
  sentAt: "2026-01-01T00:00:00.000Z",
}));
vi.mock("../facade", () => ({ sendEmailThroughSystem: (...args: unknown[]) => sendSpy(...args) }));

// Import the module under test AFTER vi.mock calls
import { registerEmailPrimitives, type EmailSendActorResolver } from "../mcp/module";
```

**What to Mock:**
- `server-only` — always mocked in tests for any server-guarded module
- Facade functions (`sendEmailThroughSystem`) when testing the MCP handler layer in isolation
- External SDK dependencies injected as structural types (no mock needed — use a hand-rolled fake)

**What NOT to Mock:**
- The registry (`emailConnectorRegistry`) — tests interact with it directly via `_clearForTests()` if needed
- Zod schema validation — input is parsed by real schema in tests

**Structural Fakes (preferred over `vi.mock` for interfaces):**
```typescript
function recordingServer(captured: Captured[]) {
  return {
    registerTool(name: string, _config: unknown, handler: ...) {
      captured.push({ name, handler });
    },
  };
}
```
Structural fakes satisfy TypeScript's structural typing and are passed as `as never` to avoid precise type coupling to internal overloads.

## Fixtures and Factories

**Test Data:**
```typescript
const baseInput = { to: ["x@y.com"], subject: "s", textBody: "b" };
```
Minimal inline objects. No shared fixture files or factory helpers — the codebase is small enough that inline construction is used throughout.

**Location:**
- No separate fixtures directory. All test data is inline within test files.

## Coverage

**Requirements:** Not enforced (no coverage threshold config detected)

**View Coverage:**
```bash
npx vitest --coverage
```

## Test Types

**Unit Tests:**
- All tests are unit/integration-in-process. No network calls, no DB.
- `email-send-actor-resolution.test.ts`: tests the MCP handler's actor resolution logic by registering tools onto a fake server and asserting spy call args.
- `import-boundary.test.ts`: static analysis test — walks `src/` with `fs.readdirSync`, parses import specifiers via regex, and asserts no runtime imports from forbidden patterns (`@/`, `src/`, other concrete connector packages).

**Integration Tests:**
- Not applicable — no external service integration tests.

**E2E Tests:**
- Not used.

## Special Test Patterns

**Import-Boundary Test** (`src/__tests__/import-boundary.test.ts`):
- A static analysis regression test that enforces architectural import rules without a linter.
- Walks all `.ts` / `.tsx` source files under `src/` (excluding `__tests__/` and `node_modules/`).
- Skips `import type { ... }` lines (type-only imports are permitted).
- Fails if any runtime `import ... from` or `export ... from` matches a forbidden pattern:
  - `@/` path aliases (app-local host code)
  - `src/` relative climbs
  - Other concrete connector packages (`@cinatra-ai/*-connector`, etc.)
- This test acts as a CI guard preventing the shared contract package from gaining illegal runtime dependencies.

**Async Handler Testing:**
```typescript
// Call the registered handler directly after capturing it from the fake server
const tool = captured.find((c) => c.name === "email_send");
await tool!.handler(baseInput, { actor: { userId: "SHOULD-BE-IGNORED" } });

// Assert on spy call args
const opts = sendSpy.mock.calls[0][1] as { userId?: string; orgId?: string };
expect(opts.userId).toBe("u-123");
```

---

*Testing analysis: 2026-06-09*
