# Email Sending

One outbound-email path for every Cinatra agent, no matter which mailbox actually sends the message. Agents call `sendEmailThroughSystem` with a plain message object; the connector resolves the right provider for the sender via sender-identity lookup or first-registered fallback, applies a recipient override in development so no test run reaches a real address, and delegates to the provider. Each successful send optionally writes a sent-email record for audit and reply-matching. An `email_send` MCP tool exposes the same path to agents that communicate over the model-context protocol. At activation, `register(ctx)` resolves the host email-routing capability, calls `configureEmailSystem(deps)`, and registers the `email_send` MCP tool. No email reaches a provider before that completes.

Install: this connector is a peer dependency resolved by the Cinatra host application and is not published to a public registry. Provider extensions such as Gmail or Resend depend only on `@cinatra-ai/sdk-extensions` for the shared contract types and register themselves through the `email-send` capability at boot; they never import this facade package directly.

## Works with

- Gmail
- Resend
- Additional email providers installed as extensions

## Capabilities

- Send an email from a Cinatra agent through whichever provider is connected
- Match each send to the right mailbox for the sender using sender-identity, user, or org routing
- Resolve the right provider via explicit connector ID, sender-identity lookup, or first-registered fallback
- Rewrite every recipient to a single override address in development so tests never reach real inboxes
- Persist a sent-email record after delivery for audit; failure is logged and never fails the send
- Find the reply to an email Cinatra has previously sent on a given thread
- Expose an `email_send` MCP tool that resolves the trusted actor from the run context, not from tool input
- Throw a descriptive error when no provider is registered or the system has not been configured
