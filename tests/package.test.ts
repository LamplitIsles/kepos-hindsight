import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("DSH bundle manifest", () => {
  it("uses the package root for the host bundle so DSH can discover its Web client", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, unknown>;
      dsh: { client?: { platform?: string; inject?: string[] } };
    };
    expect(manifest.exports["."]).toEqual({
      types: "./dist/dsh.d.ts",
      default: "./dist/dsh.js"
    });
    expect(manifest.exports["./client"]).toEqual({
      types: "./dist/client.d.cts",
      default: "./dist/client.js"
    });
    expect(manifest.dsh.client).toMatchObject({ platform: "web" });
  });
});
