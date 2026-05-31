import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/email-connector MCP module — exposes the `email_send`
// primitive. Wired into the Cinatra MCP server registry from
// `src/lib/mcp-server.ts` alongside the other createXModule() helpers.
//
// Current email outreach sends flow through
// `email_outreach_send_initial_start` (orchestrated, batch). `email_send` is
// the one-shot transactional primitive for chat and ad-hoc agents that just
// want to send a single email.
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { McpRuntimeToolServer } from "@cinatra-ai/mcp-server";
import { sendEmailThroughSystem } from "../facade";

const emailSendInputSchema = z.object({
  to: z.array(z.string().min(1)).min(1),
  subject: z.string().min(1),
  textBody: z.string().min(1),
  cc: z.array(z.string().min(1)).optional(),
  bcc: z.array(z.string().min(1)).optional(),
  replyTo: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
  // Routing overrides. Defined precedence is not mutually-exclusive-enforced
  // because precedence is a friendlier API than a hard reject: the facade's
  // resolveConnectorId checks `explicitConnectorId` FIRST, so if BOTH are
  // passed `connectorId` wins and `senderIdentityId` is ignored. Callers
  // should pass at most one; passing both is not an error, just redundant.
  connectorId: z.string().optional(),
  senderIdentityId: z.string().optional(),
});

export function registerEmailPrimitives(server: McpRuntimeToolServer): void {
  server.registerTool(
    "email_send",
    {
      title: "email_send",
      description:
        "Send a single transactional email via the user's primary email connector " +
        "(or an explicit connectorId / senderIdentityId override). Provider-agnostic " +
        "wrapper around the @cinatra-ai/email-connector facade — works with Gmail today " +
        "and any future provider (SMTP, SES, Outlook) the operator registers.",
      inputSchema: emailSendInputSchema,
    },
    async (rawInput, extra) => {
      const input = emailSendInputSchema.parse(rawInput);
      const actor = (extra as { actor?: Record<string, unknown> })?.actor;
      // Treat ""/whitespace as absent so a blank actor.userId/orgId doesn't
      // run a doomed sender-identity lookup with ownerId="" (which finds
      // nothing and just wastes a round-trip before falling through).
      const nonEmpty = (v: unknown): string | undefined =>
        typeof v === "string" && v.trim().length > 0 ? v : undefined;
      const userId = nonEmpty(actor?.userId);
      const orgId = nonEmpty(actor?.orgId);

      const receipt = await sendEmailThroughSystem(
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(receipt),
          },
        ],
        structuredContent: receipt as unknown as Record<string, unknown>,
      };
    },
  );
}

/**
 * Factory matching the createXModule() naming used by the other connector
 * modules (createGmailModule, createWordPressModule, etc.). The host imports
 * this from `@cinatra-ai/email-connector/mcp-module` and wires it in
 * `src/lib/mcp-server.ts`.
 */
export function createEmailModule() {
  return {
    registerCapabilities: registerEmailPrimitives,
  };
}
