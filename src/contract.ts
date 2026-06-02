// ---------------------------------------------------------------------------
// @cinatra-ai/email-connector — transport CONTRACT (types only).
//
// The provider-neutral email transport contract now lives in the SDK
// (`@cinatra-ai/sdk-extensions/email-contract`) so a concrete provider
// (`resend-connector`, `gmail-connector`, a future smtp/ses connector) depends
// only on the SDK for these types and NEVER imports this facade package. This
// module re-exports them so host code that imports the contract from
// `@cinatra-ai/email-connector` keeps working; the facade implementation
// (`sendEmailThroughSystem`, the registry) still lives in this package.
// ---------------------------------------------------------------------------

export type {
  EmailConnectorDefinition,
  EmailConnectorId,
  EmailSystemMessage,
  EmailSendReceipt,
  EmailReplyMatch,
  EmailConnectorStatusResult,
  EmailConnector,
} from "@cinatra-ai/sdk-extensions/email-contract";
