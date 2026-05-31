// ---------------------------------------------------------------------------
// @cinatra-ai/email-connector — public surface.
//
// Contract types: EmailConnector capability interface +
// EmailSystemMessage / EmailSendReceipt / EmailReplyMatch /
// EmailConnectorStatusResult / EmailConnectorId. Re-exports the metadata
// descriptor from sdk-extensions for convenience.
//
// Runtime facade: registerEmailConnector, configureEmailSystem,
// sendEmailThroughSystem, findReplyThroughSystem,
// listInstalledEmailConnectors, EmailSystemDeps. Host wires concrete
// dev-mode override + routing impls at boot via
// `src/lib/register-email-providers.ts`.
//
// Consumption rule: provider packages (e.g. @cinatra-ai/gmail-connector)
// import EmailConnector / EmailSystemMessage / EmailSendReceipt /
// EmailReplyMatch as `import type` only. The ESLint
// `consistent-type-imports` rule enforces this for connector-* packages
// (both packages/connector-*/ LLM providers and
// extensions/cinatra-ai/*-connector/ transport providers).
// ---------------------------------------------------------------------------

// ── Contract types ────────────────────────────────────────────────────────

export type {
  EmailConnector,
  EmailConnectorId,
  EmailConnectorStatusResult,
  EmailReplyMatch,
  EmailSendReceipt,
  EmailSystemMessage,
} from "./contract";

export type { EmailConnectorDefinition } from "@cinatra-ai/sdk-extensions";

// ── Runtime facade ────────────────────────────────────────────────────────

export {
  registerEmailConnector,
  listInstalledEmailConnectors,
  emailConnectorRegistry,
} from "./registry";

export {
  configureEmailSystem,
  sendEmailThroughSystem,
  findReplyThroughSystem,
} from "./facade";

export type { EmailSystemDeps } from "./facade";
