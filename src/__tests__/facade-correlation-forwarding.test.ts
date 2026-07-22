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

  it("threads the test-delivery submissionId / draftId to persistence (#35, cinatra#1947)", async () => {
    // The run-scoped test-delivery send carries (submissionId, draftId) so the
    // crash-reconciliation on the cinatra side (email_test_delivery_run_send's
    // lease-expiry reconcile) can query the persisted sent-email objects for THIS
    // submission and confirm every expected draft landed. If the facade dropped
    // either id, reconciliation could never confirm and every crashed send would
    // resolve to `previous_send_unknown`. This asserts they survive the forward.
    await sendEmailThroughSystem(
      { to: ["qa@example.test"], subject: "s", textBody: "t" },
      {
        userId: "u-1",
        correlation: {
          campaignId: "camp-1",
          submissionId: "sub-abc-123",
          draftId: "draft-9",
        },
      },
    );
    await Promise.resolve();
    expect(saveCalls).toHaveLength(1);
    // The whole envelope survives — the campaign id AND the test-delivery pair.
    expect(saveCalls[0]).toMatchObject({
      correlation: { campaignId: "camp-1", submissionId: "sub-abc-123", draftId: "draft-9" },
    });
    // Explicitly pin the reconciliation-critical pair (a partial forward that
    // kept campaignId but dropped these would still match a looser assertion).
    const corr =
      (saveCalls[0] as { correlation?: Record<string, unknown> }).correlation ?? {};
    expect(corr.submissionId).toBe("sub-abc-123");
    expect(corr.draftId).toBe("draft-9");
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
