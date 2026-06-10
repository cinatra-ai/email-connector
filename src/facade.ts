import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/email-connector — provider-agnostic transport facade.
//
// The facade is the single chokepoint every outbound email goes through:
//
//   caller → sendEmailThroughSystem(msg, opts)
//     → resolve provider via routing chain
//     → apply dev-mode override (lifted from connector-gmail to here)
//     → delegate to provider.send(msg, opts)
//     → return receipt
//
// Today the routing chain is simple — explicit `connectorId` OR the first
// registered connector. The routing API accepts sender identity, user, and org
// inputs so host code can implement richer policies such as sender-identity
// object → user primary → org default → first connected. Single-provider
// deployments can keep resolving to the first registered connector.
//
// Dev-mode override centralization: the facade owns recipient rewriting so
// every provider receives the same sanitized message before send. This prevents
// per-connector drift and keeps provider packages focused on transport.
// ---------------------------------------------------------------------------

import type {
  EmailConnector,
  EmailReplyMatch,
  EmailSendReceipt,
  EmailSystemMessage,
} from "./contract";
import { emailConnectorRegistry } from "./registry";

// ---------------------------------------------------------------------------
// Host-side persistence hooks (DI — host injects via configureEmailSystem)
// ---------------------------------------------------------------------------

/**
 * Host-side persistence + routing dependencies. The facade is provider-
 * neutral; it knows NOTHING about which DB shape stores email events or
 * which routing policy resolves sender identity → connector. Host wires
 * concrete impls at boot via `configureEmailSystem`.
 */
export interface EmailSystemDeps {
  /** Resolve which registered connector to use for this send. Returns null
   *  when no explicit/identity routing step resolves — the facade then falls
   *  back to the FIRST registered connector (the registry-fallback step lives
   *  here, not host-side, so the host names no provider). */
  resolveConnectorId: (opts: {
    explicitConnectorId?: string;
    senderIdentityId?: string;
    userId?: string;
    orgId?: string;
  }) => Promise<string | null>;

  /**
   * Dev-mode override: if dev mode is enabled, rewrite to/cc/bcc to the
   * override recipient before any provider call. The host reads
   * `email-system-development` from its connector_config store.
   */
  applyDevModeOverride: (msg: EmailSystemMessage) => EmailSystemMessage;

  /**
   * OPTIONAL: after a successful provider.send(), persist a
   * `@cinatra-ai/email:sent-email` object as the semantic record. The
   * facade calls this best-effort; failure logs a warning but does NOT
   * fail the send (the email was already delivered). Host wires this to
   * objectsClient.save({ typeHint: "@cinatra-ai/email:sent-email", rawData })
   * with optional idempotencyKey for dedupe.
   */
  saveSentEmailObject?: (input: {
    msg: EmailSystemMessage;
    receipt: EmailSendReceipt;
    routing: {
      connectorId: string;
      senderIdentityId?: string;
      userId?: string;
      orgId?: string;
    };
  }) => Promise<void>;

  /**
   * OPTIONAL (transport-registration cutover): lazy source of connectors that self-registered behind the
   * `email-send` capability (a provider extension's serverEntry doing
   * `ctx.capabilities.registerProvider("email-send", …)`). Forwarded to the
   * registry's external resolver so BOTH read paths (get-by-id and listAll)
   * merge capability providers — neither the facade nor the host imports a
   * provider package, and a capability teardown is reflected immediately.
   */
  resolveConnectorProviders?: () => readonly EmailConnector[];
}

// CROSS-COMPILATION SINGLETON: same hazard as emailConnectorRegistry —
// Next.js 16 produces SEPARATE bundler compilations for instrumentation,
// route handlers, RSC, etc. Each compilation gets its own copy of this
// module file, so a plain module-level `let _deps` produces a DIFFERENT
// per-compilation slot. configureEmailSystem(deps) runs in instrumentation
// and writes ITS _deps; getDeps() runs in route handlers and reads its own
// _deps that's still null → "email system not configured" on every send.
// Anchoring the deps slot on globalThis via a namespaced+versioned
// Symbol.for() key makes the configuration visible across every
// compilation in the same Node process.
const EMAIL_SYSTEM_DEPS_KEY = Symbol.for(
  "@cinatra-ai/email-connector:facade-deps/v1",
);
type DepsHolder = { [k: symbol]: EmailSystemDeps | null | undefined };
const _depsHolder = globalThis as unknown as DepsHolder;
function _readDeps(): EmailSystemDeps | null {
  return _depsHolder[EMAIL_SYSTEM_DEPS_KEY] ?? null;
}
function _writeDeps(deps: EmailSystemDeps | null): void {
  _depsHolder[EMAIL_SYSTEM_DEPS_KEY] = deps;
}

/**
 * Wire host-side persistence + routing into the facade. Called once at
 * boot from `src/lib/register-email-providers.ts`.
 */
export function configureEmailSystem(deps: EmailSystemDeps): void {
  _writeDeps(deps);
  // Forward the optional capability-provider resolver to the registry so both
  // read paths merge capability-registered connectors lazily (blog model).
  emailConnectorRegistry.setExternalResolver(deps.resolveConnectorProviders ?? null);
}

function getDeps(): EmailSystemDeps {
  const deps = _readDeps();
  if (!deps) {
    throw new Error(
      "@cinatra-ai/email-connector: email system not configured. " +
        "Call configureEmailSystem(deps) at boot (typically from " +
        "src/lib/register-email-providers.ts).",
    );
  }
  return deps;
}

/** Routing-chain fallback: the FIRST registered connector. */
function firstRegisteredConnectorId(): string {
  const first = emailConnectorRegistry.listAll()[0];
  if (!first) {
    throw new Error(
      "@cinatra-ai/email-connector: no email connector is registered. " +
        "A provider extension registers one behind the `email-send` capability " +
        "from its serverEntry (or via registerEmailConnector at boot).",
    );
  }
  return first.definition.connectorId;
}

function getProvider(id: string): EmailConnector {
  const connector = emailConnectorRegistry.get(id);
  if (!connector) {
    const known = emailConnectorRegistry
      .listAll()
      .map((c) => c.definition.connectorId)
      .join(", ");
    throw new Error(
      `@cinatra-ai/email-connector: no email connector registered for id "${id}". ` +
        `Registered: [${known || "<none>"}]. ` +
        `Add a registerEmailConnector(...) call in src/lib/register-email-providers.ts.`,
    );
  }
  return connector;
}

// ---------------------------------------------------------------------------
// Public facade
// ---------------------------------------------------------------------------

/**
 * Send an email through the registered transport for the resolved
 * connector. Provider-agnostic — caller passes a generic
 * `EmailSystemMessage`; the facade picks the connector via routing chain
 * + applies dev-mode override + delegates.
 *
 * Throws if (a) no email connector is registered, (b) routing chain
 * cannot resolve to a registered provider, (c) the provider's `send`
 * throws (dev-mode-misconfig / network / auth — provider-specific).
 */
export async function sendEmailThroughSystem(
  msg: EmailSystemMessage,
  opts?: {
    connectorId?: string;
    senderIdentityId?: string;
    userId?: string;
    orgId?: string;
  },
): Promise<EmailSendReceipt> {
  const deps = getDeps();
  const connectorId =
    (await deps.resolveConnectorId({
      explicitConnectorId: opts?.connectorId,
      senderIdentityId: opts?.senderIdentityId,
      userId: opts?.userId,
      orgId: opts?.orgId,
    })) ?? firstRegisteredConnectorId();
  const connector = getProvider(connectorId);
  const msgWithOverride = deps.applyDevModeOverride(msg);
  const receipt = await connector.send(msgWithOverride, { userId: opts?.userId });

  // Best-effort sent-email object write. The send already succeeded;
  // failure here is logged but never thrown.
  if (deps.saveSentEmailObject) {
    void deps.saveSentEmailObject({
      msg: msgWithOverride,
      receipt,
      routing: {
        connectorId,
        senderIdentityId: opts?.senderIdentityId,
        userId: opts?.userId,
        orgId: opts?.orgId,
      },
    }).catch((err) => {
      console.warn(
        `[email-connector] sent-email object write failed (send succeeded): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  return receipt;
}

/**
 * Look for a reply on the given thread for the given recipient. Same
 * routing chain as `sendEmailThroughSystem`.
 */
export async function findReplyThroughSystem(opts: {
  providerThreadId?: string;
  recipientEmail: string;
  sentAfter?: string;
  connectorId?: string;
  senderIdentityId?: string;
  userId?: string;
  orgId?: string;
}): Promise<EmailReplyMatch | null> {
  const deps = getDeps();
  const connectorId =
    (await deps.resolveConnectorId({
      explicitConnectorId: opts.connectorId,
      senderIdentityId: opts.senderIdentityId,
      userId: opts.userId,
      orgId: opts.orgId,
    })) ?? firstRegisteredConnectorId();
  const connector = getProvider(connectorId);
  return connector.findReply({
    providerThreadId: opts.providerThreadId,
    recipientEmail: opts.recipientEmail,
    sentAfter: opts.sentAfter,
    userId: opts.userId,
  });
}
