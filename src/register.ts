// The email-connector's `register(ctx)` server entry.
//
// Transport-registration cutover: this facade CONFIGURES ITSELF at activation — the host no longer
// imports this package to call `configureEmailSystem`:
//   - the host-side routing impls (sender-identity resolution, dev-mode
//     override, sent-email writer) are resolved from the
//     `@cinatra-ai/host:email-routing` capability the host publishes at boot;
//   - the provider source merges the registry with the live `email-send`
//     capability providers via the captured ctx (lazy on every read);
//   - the routing chain's final fallback (first registered provider) lives in
//     the facade itself.
//
// It also registers the `email_send` MCP primitive through the host `ctx`
// ports: `ctx.mcp.registerTool` registers the tool, `ctx.authSession` resolves
// the trusted actor, and delivery flows through the provider-neutral facade.
//
// SDK imports here are TYPE-ONLY (host-peer value-import gate): the host
// routing impls arrive as DATA through `ctx.capabilities`.

import "server-only";
import { z } from "zod";
import type {
  ExtensionHostContext,
  HostEmailRoutingService,
} from "@cinatra-ai/sdk-extensions";
import { configureEmailSystem, sendEmailThroughSystem, type EmailSystemDeps } from "./facade";
import type { EmailConnector, EmailSystemMessage } from "./contract";

const PACKAGE_NAME = "@cinatra-ai/email-connector";

// Structural guard: a capability impl is `unknown` by contract — validate the
// EmailConnector shape before the registry trusts it.
function isEmailConnector(impl: unknown): impl is EmailConnector {
  if (typeof impl !== "object" || impl === null) return false;
  const candidate = impl as {
    definition?: { connectorId?: unknown; name?: unknown };
    send?: unknown;
    findReply?: unknown;
    getStatus?: unknown;
  };
  return (
    typeof candidate.definition?.connectorId === "string" &&
    typeof candidate.definition?.name === "string" &&
    typeof candidate.send === "function" &&
    // findReply is REQUIRED by the contract and called unconditionally by the
    // facade's reply lookup — a provider without it must never pass the guard.
    typeof candidate.findReply === "function" &&
    typeof candidate.getStatus === "function"
  );
}

function hostEmailRouting(ctx: ExtensionHostContext): HostEmailRoutingService | null {
  const provider = ctx.capabilities.resolveProviders("@cinatra-ai/host:email-routing")[0];
  return (provider?.impl as HostEmailRoutingService | undefined) ?? null;
}

const emailSendInputSchema = z.object({
  to: z.array(z.string().min(1)).min(1),
  subject: z.string().min(1),
  textBody: z.string().min(1),
  cc: z.array(z.string().min(1)).optional(),
  bcc: z.array(z.string().min(1)).optional(),
  replyTo: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
  connectorId: z.string().optional(),
  senderIdentityId: z.string().optional(),
});

const nonEmpty = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v : undefined;

export function register(ctx: ExtensionHostContext): void {
  // Self-configure the facade. The host routing service is REQUIRED on a
  // cutover host (it is published by a boot import well before activation);
  // fail loud if absent so a mis-wired boot can't silently mis-route mail.
  const routing = hostEmailRouting(ctx);
  if (!routing) {
    throw new Error(
      `${PACKAGE_NAME}: host service "@cinatra-ai/host:email-routing" is not registered — ` +
        `the host boot wiring (register-email-providers) must run before activation.`,
    );
  }
  const deps: EmailSystemDeps = {
    resolveConnectorId: (opts) => routing.resolveConnectorId(opts),
    applyDevModeOverride: (msg) => routing.applyDevModeOverride<EmailSystemMessage>(msg),
    // Lazy capability-provider source: providers that registered behind the
    // `email-send` capability surface to both registry read paths.
    resolveConnectorProviders: () =>
      ctx.capabilities
        .resolveProviders("email-send")
        .map((p) => p.impl)
        .filter(isEmailConnector),
  };
  // The routing service's writer takes the msg/receipt as `unknown` (the host
  // service contract is shape-agnostic), so the facade's typed input is
  // directly assignable.
  const saveSentEmailObject = routing.saveSentEmailObject?.bind(routing);
  if (saveSentEmailObject) {
    deps.saveSentEmailObject = (input) => saveSentEmailObject(input);
  }
  configureEmailSystem(deps);

  // Lazy/guarded host-access cutover: the host's trigger-email-send path
  // (src/lib/trigger-email-send-use-cases.ts) resolves the provider-neutral
  // send facade through the capability registry instead of dynamic-importing
  // this package. The impl delegates to the SAME facade configured above
  // (routing chain + dev-mode recipient override preserved); provider absence
  // degrades the trigger send with a descriptive error.
  ctx.capabilities.registerProvider("email-system", {
    packageName: PACKAGE_NAME,
    impl: {
      sendEmail: (
        message: Parameters<typeof sendEmailThroughSystem>[0],
        opts: Parameters<typeof sendEmailThroughSystem>[1],
      ) => sendEmailThroughSystem(message, opts),
    },
  });

  ctx.mcp.registerTool({
    name: "email_send",
    description:
      "Send a single transactional email via the user's primary email connector " +
      "(or an explicit connectorId / senderIdentityId override). Provider-agnostic " +
      "wrapper around the email-send capability — works with Gmail today and any " +
      "future provider (SMTP, SES, Outlook) the operator registers.",
    inputSchema: emailSendInputSchema,
    handler: async (rawInput) => {
      const input = emailSendInputSchema.parse(rawInput);
      // Resolve the actor from the TRUSTED request/run context (never from
      // input). Treat blank ids as absent so a doomed sender-identity lookup
      // with ownerId="" is skipped.
      const actor = await ctx.authSession.getActor();
      const userId = nonEmpty(actor?.userId);
      const orgId = nonEmpty(actor?.organizationId);

      // The host wraps a plain handler result into the MCP envelope; return the
      // receipt directly.
      return sendEmailThroughSystem(
        {
          to: input.to,
          subject: input.subject,
          textBody: input.textBody,
          cc: input.cc,
          bcc: input.bcc,
          replyTo: input.replyTo,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
        },
        {
          connectorId: input.connectorId,
          senderIdentityId: input.senderIdentityId,
          userId,
          orgId,
        },
      );
    },
  });
}
