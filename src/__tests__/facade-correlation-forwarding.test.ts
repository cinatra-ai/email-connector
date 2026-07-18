import { describe, it, expect, vi, beforeEach } from "vitest";

// The facade imports `server-only` transitively; stub it outside a Next bundle.
vi.mock("server-only", () => ({}));

import {
  configureEmailSystem,
  sendEmailThroughSystem,
  type EmailSystemDeps,
} from "../facade";
import { emailConnectorRegistry } from "../registry";
import type { EmailConnector, EmailSendReceipt } from "../contract";

const RECEIPT: EmailSendReceipt = {
  providerId: "fakemail",
  providerMessageId: "m-1",
  providerThreadId: "t-1",
  sentAt: "2026-07-18T10:00:00.000Z",
};

function fakeConnector(): EmailConnector {
  return {
    definition: {
      connectorId: "fakemail",
      name: "Fakemail",
      slug: "fakemail",
      description: "",
      settingsHref: "/connectors/fakemail",
    },
    send: vi.fn(async () => RECEIPT),
    findReply: vi.fn(async () => null),
    getStatus: vi.fn(async () => ({ status: "connected" as const })),
  };
}

// Capture what the host writer receives.
const saveCalls: Array<Record<string, unknown>> = [];

function baseDeps(): EmailSystemDeps {
  return {
    resolveConnectorId: async () => "fakemail",
    applyDevModeOverride: (msg) => msg,
    saveSentEmailObject: async (input) => {
      saveCalls.push(input as unknown as Record<string, unknown>);
    },
  };
}

beforeEach(() => {
  emailConnectorRegistry._clearForTests();
  emailConnectorRegistry.register(fakeConnector());
  saveCalls.length = 0;
  configureEmailSystem(baseDeps());
});

describe("sendEmailThroughSystem — correlation forwarding (cinatra#1456)", () => {
  it("forwards campaign / contact / run correlation to the sent-email writer", async () => {
    await sendEmailThroughSystem(
      { to: ["a@b.c"], subject: "s", textBody: "t" },
      {
        userId: "u-1",
        correlation: { campaignId: "camp-1", contactId: "c-9", runId: "run-7" },
      },
    );
    // Best-effort write is fire-and-forget; let its microtask settle.
    await Promise.resolve();
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]).toMatchObject({
      receipt: RECEIPT,
      routing: expect.objectContaining({ connectorId: "fakemail", userId: "u-1" }),
      correlation: { campaignId: "camp-1", contactId: "c-9", runId: "run-7" },
    });
  });

  it("omits correlation entirely when the caller supplies none (plain send)", async () => {
    await sendEmailThroughSystem({ to: ["a@b.c"], subject: "s", textBody: "t" }, { userId: "u-1" });
    await Promise.resolve();
    expect(saveCalls).toHaveLength(1);
    expect("correlation" in saveCalls[0]).toBe(false);
  });

  it("still returns the receipt when no writer is wired (older host)", async () => {
    configureEmailSystem({
      resolveConnectorId: async () => "fakemail",
      applyDevModeOverride: (msg) => msg,
      // saveSentEmailObject absent.
    });
    const receipt = await sendEmailThroughSystem(
      { to: ["a@b.c"], subject: "s", textBody: "t" },
      { correlation: { campaignId: "camp-1" } },
    );
    expect(receipt).toEqual(RECEIPT);
  });
});
