import { describe, it, expect, vi } from "vitest";

// `mcp/module.ts`, `register.ts` and the facade import `server-only`, which
// throws outside a Next bundle.
vi.mock("server-only", () => ({}));
// The facade is not under test: registration only wires it.
vi.mock("../facade", () => ({
  configureEmailSystem: vi.fn(),
  sendEmailThroughSystem: vi.fn(),
}));

import { registerEmailPrimitives } from "../mcp/module";
import { register } from "../register";

// cinatra#3745: a tool that sends a message on a person's behalf declares
// `outward` on its registration, so the host holds each call of it in an
// agent run for the person's recorded decision. `email_send` takes free text
// and no stored item, so its declaration names no subject: it is exactly `{}`.
// Both registration paths must carry it.
describe("email_send declares that it acts outward (cinatra#3745)", () => {
  it("the host-static module registers email_send with outward: {}", () => {
    const configs = new Map<string, Record<string, unknown>>();
    registerEmailPrimitives({
      registerTool(name: string, config: Record<string, unknown>) {
        configs.set(name, config);
      },
    });

    expect([...configs.keys()]).toEqual(["email_send"]);
    const config = configs.get("email_send")!;
    expect("outward" in config).toBe(true);
    expect(config.outward).toEqual({});
  });

  it("register(ctx) registers email_send with outward: {}", () => {
    const tools: Array<Record<string, unknown>> = [];
    const routing = { resolveConnectorId: vi.fn(), applyDevModeOverride: vi.fn() };
    const ctx = {
      capabilities: {
        resolveProviders: (key: string) =>
          key === "@cinatra-ai/host:email-routing" ? [{ impl: routing }] : [],
        registerProvider: vi.fn(),
      },
      mcp: {
        registerTool: (registration: Record<string, unknown>) => {
          tools.push(registration);
        },
      },
      authSession: { getActor: async () => null },
    };

    register(ctx as never);

    expect(tools.map((t) => t.name)).toEqual(["email_send"]);
    expect("outward" in tools[0]).toBe(true);
    expect(tools[0].outward).toEqual({});
  });
});
