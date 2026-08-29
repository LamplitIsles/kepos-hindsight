import { describe, expect, it } from "vitest";

import { decodeSettings, saveSetting } from "../src/client.js";
import {
  DEFAULT_BANK_ID,
  normalizeCompanionSettings,
  SETTINGS_NAMESPACE
} from "../src/settings.js";

describe("companion bank settings", () => {
  it("accepts only a non-empty explicit bank and defaults to coding-agent::workspace", () => {
    expect(normalizeCompanionSettings(undefined)).toEqual({ bankId: DEFAULT_BANK_ID });
    expect(decodeSettings({ bankId: "  neil::companion  ", ignored: true })).toEqual({
      bankId: "neil::companion"
    });
    expect(decodeSettings({ bankId: "   " })).toEqual({ bankId: DEFAULT_BANK_ID });
    expect(SETTINGS_NAMESPACE).toBe("kepos-hindsight");
  });

  it("persists only the selected bank", async () => {
    const calls: Array<{ field: string; value: unknown }> = [];
    await saveSetting(
      { set: async (field, value) => void calls.push({ field, value }) },
      "bankId",
      "neil::companion"
    );
    expect(calls).toEqual([{ field: "bankId", value: "neil::companion" }]);
  });
});
