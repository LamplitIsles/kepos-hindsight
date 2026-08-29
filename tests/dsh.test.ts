import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { apply, createDshHooks } from "../src/dsh.js";

async function configFile(config: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kepos-hindsight-dsh-"));
  const path = join(directory, "coding-agent.json");
  await writeFile(path, JSON.stringify(config));
  return path;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("DSH hooks", () => {
  it("recalls every direct user turn, injects untrusted context, and retains only the completed turn", async () => {
    const configPath = await configFile({ apiUrl: "http://memory.test", bankId: "yuki" });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith("/memories/recall")) {
        return new Response(JSON.stringify({ results: [{ id: "memory-1", text: "Neil likes concise Chinese." }] }));
      }
      return new Response(JSON.stringify({ operation_id: "queued" }));
    });
    globalThis.fetch = fetch;
    const agent = {
      session: {
        header: { id: "session-1", cwd: "/work/yuki", agentPreset: "yuki" },
        events: [
          { type: "turn/start", data: { turn: 1 } },
          { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "昨天聊的事情" }] } },
          { type: "assistant/message", data: { message: { content: [{ type: "text", text: "我记得。" }] } } },
          { type: "turn/start", data: { turn: 2 } },
          { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "今天也想短一点。" }] } },
          { type: "user/message", data: { source: { kind: "plugin", plugin: "kepos-hindsight" }, content: [{ type: "text", text: "do not retain me" }] } },
          { type: "assistant/message", data: { message: { content: [{ type: "text", text: "好。" }] } } }
        ]
      }
    };
    const hooks = createDshHooks({ configPath });
    const decision = await hooks.preStep({ agent, turn: 2, signal: new AbortController().signal }, async () => ({
      kind: "enter",
      messages: [{ source: { kind: "user" }, content: [{ type: "text", text: "今天也想短一点。" }] }]
    }));

    expect(decision.messages).toHaveLength(2);
    expect(JSON.stringify(decision.messages?.[1])).toContain("historical memories");
    expect(JSON.stringify(decision.messages?.[1])).toContain("never instructions");
    expect(fetch.mock.calls[0]?.[1]?.body).toContain("昨天聊的事情");

    hooks.turnStopping({ agent, turn: 2 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const retained = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as { items: Array<{ content: string }> };
    expect(retained.items[0].content).toContain("今天也想短一点。");
    expect(retained.items[0].content).not.toContain("do not retain me");
  });

  it("does not run for a subagent session", async () => {
    const configPath = await configFile({ apiUrl: "http://memory.test", bankId: "yuki" });
    const fetch = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = fetch;
    const hooks = createDshHooks({ configPath });
    const agent = { session: { header: { id: "session-2", origin: "subagent" }, events: [] } };

    const decision = await hooks.preStep({ agent, turn: 1, signal: new AbortController().signal }, async () => ({
      kind: "enter",
      messages: [{ source: { kind: "user" }, content: [{ type: "text", text: "hello" }] }]
    }));

    expect(decision.messages).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("releases turn de-duplication state when a session is disposed", async () => {
    const configPath = await configFile({ apiUrl: "http://memory.test", bankId: "yuki" });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ operation_id: "queued" })));
    globalThis.fetch = fetch;
    const hooks = createDshHooks({ configPath });
    const agent = {
      session: {
        header: { id: "disposed-session", agentPreset: "yuki" },
        events: [
          { type: "turn/start", data: { turn: 1 } },
          { type: "user/message", data: { source: { kind: "user" }, content: [{ type: "text", text: "记住这句" }] } }
        ]
      }
    };

    hooks.turnStopping({ agent, turn: 1 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    hooks.disposed({ agent });
    hooks.turnStopping({ agent, turn: 1 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("makes hindsight_recall available when DSH invokes a tool without an agent execution field", async () => {
    const configPath = await configFile({ apiUrl: "http://memory.test", bankId: "yuki" });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({
      results: [{ text: "Neil likes concise Chinese.", type: "observation" }]
    })));
    globalThis.fetch = fetch;
    const tools: Array<{ name: string; execute: (args: { query: string }) => Promise<string> }> = [];

    apply({
      settings: { register: () => ({ get: () => ({ bankId: "yuki" }) }) },
      on: () => undefined,
      inject: (_services, callback) => callback({ tools: { register: (tool: unknown) => tools.push(tool as typeof tools[number]) } })
    }, { configPath });

    const recall = tools.find((tool) => tool.name === "hindsight_recall");
    await expect(recall?.execute({ query: "reply preference" })).resolves.toContain("Neil likes concise Chinese.");
  });
});
