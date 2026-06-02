// The email-connector's `register(ctx)` server entry.
//
// Registers the `email_send` MCP primitive through the host `ctx` ports instead
// of importing host MCP internals: `ctx.mcp.registerTool` registers the tool,
// `ctx.authSession` resolves the trusted actor, and delivery flows through the
// connector's own provider-neutral facade (`sendEmailThroughSystem`), whose
// concrete providers register behind the `email-send` capability.
//
// ADDITIVE: the legacy host-side registration (`createEmailModule` wired in
// `src/lib/mcp-server.ts`) still runs and remains the production-serving path
// the runtime loader is responsible for activating server entries in production; the
// host's registerAllCapabilities dedupes by tool name, so this registration is
// a no-op-if-already-claimed. This entry is what makes the connector SDK-only
// and ready to SERVE via `ctx` once the static path is retired (the host→connector cutover).

import "server-only";
import { z } from "zod";
import type { ExtensionHostContext } from "@cinatra-ai/sdk-extensions";
import { sendEmailThroughSystem } from "./facade";

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
