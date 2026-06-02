import { describe, it, expect, vi, beforeEach } from "vitest";

// `mcp/module.ts` imports `server-only`, which throws outside a Next bundle.
vi.mock("server-only", () => ({}));

// Mock the facade so we can assert WHAT the email_send handler passes to it —
// specifically that the trusted user/org from the host-injected resolver
// (NOT the MCP SDK `extra`, which carries no actor) reach sendEmailThroughSystem.
const sendSpy = vi.fn(async (..._args: unknown[]) => ({
  providerId: "test",
  providerMessageId: "m1",
  sentAt: "2026-01-01T00:00:00.000Z",
}));
vi.mock("../facade", () => ({ sendEmailThroughSystem: (...args: unknown[]) => sendSpy(...args) }));

import { registerEmailPrimitives, type EmailSendActorResolver } from "../mcp/module";

type Captured = { name: string; handler: (input: unknown, extra: unknown) => unknown };

function recordingServer(captured: Captured[]) {
  return {
    registerTool(name: string, _config: unknown, handler: (input: unknown, extra: unknown) => unknown) {
      captured.push({ name, handler });
    },
  };
}

describe("email_send static handler — trusted actor resolution", () => {
  beforeEach(() => sendSpy.mockClear());

  const baseInput = { to: ["x@y.com"], subject: "s", textBody: "b" };

  it("passes the host-resolved userId/orgId to sendEmailThroughSystem (NOT from extra)", async () => {
    const captured: Captured[] = [];
    const resolveActor: EmailSendActorResolver = async () => ({ userId: "u-123", orgId: "o-456" });
    registerEmailPrimitives(recordingServer(captured) as never, resolveActor);

    const tool = captured.find((c) => c.name === "email_send");
    expect(tool).toBeTruthy();
    // Pass an `extra` carrying a DIFFERENT/garbage actor to prove it is ignored.
    await tool!.handler(baseInput, { actor: { userId: "SHOULD-BE-IGNORED", orgId: "IGNORED" } });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const opts = sendSpy.mock.calls[0][1] as { userId?: string; orgId?: string };
    expect(opts.userId).toBe("u-123");
    expect(opts.orgId).toBe("o-456");
  });

  it("treats blank resolved ids as absent (no doomed ownerId='' lookup)", async () => {
    const captured: Captured[] = [];
    const resolveActor: EmailSendActorResolver = async () => ({ userId: "   ", orgId: "" });
    registerEmailPrimitives(recordingServer(captured) as never, resolveActor);
    await captured[0].handler(baseInput, {});
    const opts = sendSpy.mock.calls[0][1] as { userId?: string; orgId?: string };
    expect(opts.userId).toBeUndefined();
    expect(opts.orgId).toBeUndefined();
  });

  it("with NO resolver injected, passes no user/org (does not crash on missing extra.actor)", async () => {
    const captured: Captured[] = [];
    registerEmailPrimitives(recordingServer(captured) as never);
    await captured[0].handler(baseInput, undefined);
    const opts = sendSpy.mock.calls[0][1] as { userId?: string; orgId?: string };
    expect(opts.userId).toBeUndefined();
    expect(opts.orgId).toBeUndefined();
  });
});
