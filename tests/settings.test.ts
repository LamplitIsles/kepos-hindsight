import { describe, expect, it } from "vitest";

import {
  decodeSettings,
  saveSetting,
  syncBankIdDraft
} from "../src/client.js";
import {
  DEFAULT_BANK_ID,
  normalizeCompanionSettings,
  SETTINGS_NAMESPACE
} from "../src/settings.js";

describe("companion bank settings", () => {
  it("accepts only a non-empty explicit bank and defaults to yuki-memory", () => {
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

  it("keeps a staged bank across failed or conflicting snapshot reloads", () => {
    const dirty = { value: "staged-bank", saved: "saved-bank" };
    expect(syncBankIdDraft(dirty, "saved-bank")).toBe(dirty);
    expect(syncBankIdDraft(dirty, "remote-bank")).toEqual({
      value: "staged-bank",
      saved: "remote-bank"
    });
    expect(syncBankIdDraft({ value: "saved-bank", saved: "saved-bank" }, "remote-bank")).toEqual({
      value: "remote-bank",
      saved: "remote-bank"
    });
    expect(syncBankIdDraft({ value: "  saved-bank  ", saved: "saved-bank" }, "remote-bank")).toEqual({
      value: "remote-bank",
      saved: "remote-bank"
    });
  });
});
