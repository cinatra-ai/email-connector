// ---------------------------------------------------------------------------
// @cinatra-ai/email-connector — transport CONTRACT (types only).
//
// Provider-neutral email transport interface. Concrete providers
// (@cinatra-ai/gmail-connector today; future @cinatra-ai/smtp-connector,
// @cinatra-ai/ses-connector, etc.) implement `EmailConnector` and register
// themselves with the facade. Providers MUST import these symbols via
// `import type { ... }` only — the `consistent-type-imports` ESLint rule
// enforces this so providers never pull the registry runtime in just to
// satisfy the type checker.
//
// Types-only contract. Facade implementation lives outside this module.
// ---------------------------------------------------------------------------

import type { EmailConnectorDefinition } from "@cinatra-ai/sdk-extensions";

/**
 * Discriminator for which transport actually sent / received a message.
 * Provider-neutral by design — `"gmail"` today; expected to widen to
 * `"smtp" | "ses" | "outlook" | ...` as new providers register. Keep `string`
 * so the contract package doesn't enumerate concrete providers.
 */
export type EmailConnectorId = string;

/**
 * Provider-agnostic outbound message envelope. Mirrors RFC 5322 minus
 * provider-specific transport flags. Both gmail (Gmail API) and a future
 * SMTP / SES / Outlook connector accept this shape.
 */
export type EmailSystemMessage = {
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  providerThreadId?: string;
  inReplyTo?: string;
  references?: string[];
};

/**
 * Provider-agnostic send receipt. The exact set of provider-side IDs varies
 * (Gmail returns a `messageId` + `threadId` + an `internetMessageId` header;
 * SES returns a MessageId only). The contract preserves all three optional
 * slots so each provider can fill what it knows.
 */
export type EmailSendReceipt = {
  providerId: EmailConnectorId;
  providerMessageId: string;
  providerThreadId?: string;
  internetMessageId?: string;
  sentAt: string;
};

/**
 * Provider-agnostic reply match. Returned by `EmailConnector.findReply`
 * when the connector observes an inbound message that resolves to a thread
 * we sent earlier.
 */
export type EmailReplyMatch = {
  providerId: EmailConnectorId;
  providerMessageId: string;
  providerThreadId?: string;
  internetMessageId?: string;
  fromEmail: string;
  subject: string;
  snippet?: string;
  receivedAt: string;
};

/**
 * Provider-agnostic connection status. `connected` = ready to send;
 * `incomplete` = configured but not ready (e.g. OAuth pending verification);
 * `not_connected` = no credentials.
 */
export type EmailConnectorStatusResult = {
  status: "connected" | "incomplete" | "not_connected";
  accountEmail?: string;
  detail?: string;
};

/**
 * The capability contract that every transport-email connector implements.
 * Providers expose a singleton conforming to this shape (e.g.
 * `gmailEmailConnector: EmailConnector`) which the facade registers at boot.
 *
 * The interface is intentionally NARROW — anything provider-specific
 * (Gmail aliases, SES configuration sets, SMTP credentials) stays inside
 * the provider package and is NOT part of this contract.
 *
 * This module is types only; the facade registry and `sendEmailThroughSystem`
 * live outside it.
 */
export interface EmailConnector {
  /** Provider metadata descriptor (id, name, slug, settingsHref, capability bits). */
  readonly definition: EmailConnectorDefinition;

  /** Send a message via this provider; return a normalized receipt. */
  send(
    msg: EmailSystemMessage,
    opts?: { userId?: string },
  ): Promise<EmailSendReceipt>;

  /** Look for a reply in the given thread newer than `sentAfter`, if any. */
  findReply(opts: {
    providerThreadId?: string;
    recipientEmail: string;
    sentAfter?: string;
    userId?: string;
  }): Promise<EmailReplyMatch | null>;

  /** Connection status — used by the host's `listInstalledEmailConnectors` UI. */
  getStatus(opts?: { userId?: string }): Promise<EmailConnectorStatusResult>;

  /**
   * OPTIONAL: list From-addresses this provider can send as (Gmail aliases,
   * SES verified identities, etc.). Connectors that don't support multiple
   * From-addresses omit this and the facade falls back to the connected
   * account address.
   */
  listFromAddresses?(opts?: {
    userId?: string;
  }): Promise<Array<{ email: string; displayName?: string }>>;
}
