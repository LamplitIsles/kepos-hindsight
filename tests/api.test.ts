import { describe, expect, it } from "vitest";

import { HindsightClient } from "../src/api.js";
import { DEFAULT_RECALL } from "../src/config.js";

describe("HindsightClient", () => {
  it("uses raw recall and sends retain without a plugin-defined strategy or context", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>
      });
      if (String(input).endsWith("/memories/recall")) {
        return new Response(JSON.stringify({ results: [
          { id: "fact-1", text: "Neil prefers short Chinese replies.", type: "observation", score: 0.8 },
          { id: "empty", text: "" }
        ] }));
      }
      return new Response(JSON.stringify({ operation_id: "queued" }));
    };
    const client = new HindsightClient("http://memory.test", "yuki bank", "token", fetcher);

    await expect(client.recall("reply style", DEFAULT_RECALL)).resolves.toEqual([
      { id: "fact-1", text: "Neil prefers short Chinese replies.", type: "observation", score: 0.8 }
    ]);
    await client.retain("session-1", 2, [{ role: "user", content: "记住我喜欢短句" }]);

    expect(requests[0]).toMatchObject({
      url: "http://memory.test/v1/default/banks/yuki%20bank/memories/recall",
      body: {
        query: "reply style",
        budget: "low",
        max_tokens: 900,
        prefer_observations: true
      }
    });
    const retained = requests[1].body.items as Array<Record<string, unknown>>;
    expect(retained[0]).toMatchObject({ document_id: "dsh:session-1:turn:2" });
    expect(retained[0]).not.toHaveProperty("context");
    expect(retained[0]).not.toHaveProperty("strategy");
    expect(requests[1].body.operation_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
