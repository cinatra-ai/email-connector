import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/email-connector — provider registry.
//
// Every EmailConnector implementation registers itself here at boot via
// `registerEmailConnector(c)`. The facade (see `./facade.ts`) reads from
// this registry to route `sendEmailThroughSystem` / `findReplyThroughSystem`
// calls to the right provider.
//
// In-memory singleton. The set is populated at process boot via
// `src/lib/register-email-providers.ts` and persists for the lifetime of
// the process. Re-registration is idempotent (replace-by-id semantics
// matching objectTypeRegistry / objectSyncAdapterRegistry conventions).
//
// CROSS-COMPILATION SINGLETON: Next.js 16 produces SEPARATE bundler
// compilations for instrumentation, route handlers, RSC, edge, etc. Each
// compilation has its own module cache, so a plain
// `export const x = new Impl()` produces a DIFFERENT instance per
// compilation that imports it. That split the email-connector registry —
// `src/lib/register-email-providers.ts` (instrumentation compilation)
// registered connectors into ITS instance, while `src/lib/email-system.ts`
// (route-handler compilation) read its own empty instance and
// `sendPlatformEmail` threw "No connected email provider" on every send.
// Anchoring on `globalThis` via a namespaced+versioned `Symbol.for(...)`
// key makes the registry a true per-process singleton across every
// compilation in the same Node process.
// ---------------------------------------------------------------------------

import type { EmailConnector } from "./contract";

class EmailConnectorRegistryImpl {
  private entries: Map<string, EmailConnector> = new Map();

  register(connector: EmailConnector): void {
    const id = connector.definition.connectorId;
    if (this.entries.has(id) && this.entries.get(id) !== connector) {
      // Replace-by-id; logs the override for debugging boot-time race.
      console.warn(
        `[emailConnectorRegistry] Replacing existing email connector "${id}"`,
      );
    }
    this.entries.set(id, connector);
  }

  get(id: string): EmailConnector | null {
    return this.entries.get(id) ?? null;
  }

  listAll(): readonly EmailConnector[] {
    return Array.from(this.entries.values());
  }

  size(): number {
    return this.entries.size;
  }

  /** @internal Only for tests. */
  _clearForTests(): void {
    this.entries.clear();
  }
}

// Anchor the singleton on globalThis so every Next.js compilation in the
// same Node process shares the same registry instance. The Symbol.for key
// is namespaced + versioned — future shape changes can bump /v1 to /v2 to
// avoid collisions with old code paths still living in memory during a
// rolling restart.
const EMAIL_CONNECTOR_REGISTRY_KEY = Symbol.for(
  "@cinatra-ai/email-connector:registry/v1",
);
type RegistryHolder = { [k: symbol]: EmailConnectorRegistryImpl | undefined };
const _globalHolder = globalThis as unknown as RegistryHolder;
export const emailConnectorRegistry: EmailConnectorRegistryImpl =
  _globalHolder[EMAIL_CONNECTOR_REGISTRY_KEY] ??
  (_globalHolder[EMAIL_CONNECTOR_REGISTRY_KEY] = new EmailConnectorRegistryImpl());

/**
 * Register an email connector at boot. Called once per provider package
 * from `src/lib/register-email-providers.ts`.
 */
export function registerEmailConnector(connector: EmailConnector): void {
  emailConnectorRegistry.register(connector);
}

/**
 * List every registered email connector — used by the host's
 * `listInstalledEmailConnectorStatuses()` UI to surface connection status.
 */
export function listInstalledEmailConnectors(): readonly EmailConnector[] {
  return emailConnectorRegistry.listAll();
}
