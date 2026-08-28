import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveCompanionConfig } from "../src/config.js";

async function configFile(config: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kepos-hindsight-config-"));
  const path = join(directory, "coding-agent.json");
  await writeFile(path, JSON.stringify(config));
  return path;
}

describe("resolveCompanionConfig", () => {
  it("uses the most-specific workspace map and leaves missions untouched", async () => {
    const path = await configFile({
      apiUrl: "http://memory.test/",
      mapPathToBank: {
        "/work": "general",
        "/work/yuki": "yuki-bank"
      },
      harnesses: {
        dsh: {
          companion: {
            activePresets: ["yuki", "mika"],
            recall: { contextTurns: 3, topK: 4 }
          }
        }
      },
      banks: {
        "yuki-bank": {
          retain_mission: "not read or changed by the plugin",
          disabled: false
        }
      }
    });

    const config = resolveCompanionConfig({ configPath: path }, "/work/yuki/chat");

    expect(config).toMatchObject({
      enabled: true,
      apiUrl: "http://memory.test",
      bankId: "yuki-bank",
      activePresets: ["yuki", "mika"]
    });
    expect(config.recall).toMatchObject({ contextTurns: 3, topK: 4, budget: "low" });
  });

  it("honors shared and bank-level disable switches", async () => {
    const sharedDisabled = await configFile({ disabled: true });
    const bankDisabled = await configFile({
      bankId: "yuki-bank",
      banks: { "yuki-bank": { disabled: true } }
    });

    expect(resolveCompanionConfig({ configPath: sharedDisabled }).enabled).toBe(false);
    expect(resolveCompanionConfig({ configPath: bankDisabled }).enabled).toBe(false);
  });
});
