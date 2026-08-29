import { createElement, useEffect, useState } from "react";
import type { ClientContext, SettingsScope } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";

import {
  DEFAULT_BANK_ID,
  normalizeCompanionSettings,
  SETTINGS_NAMESPACE
} from "./settings.js";
import type { CompanionSettings } from "./settings.js";

export const inject = ["settingsScope", "slots"] as const;

type ClientSettingsScope = SettingsScope<Partial<CompanionSettings>>;

export function decodeSettings(value: unknown): Partial<CompanionSettings> {
  const settings = normalizeCompanionSettings(value);
  return {
    bankId: settings.bankId
  };
}

export async function saveSetting(
  scope: Pick<ClientSettingsScope, "set">,
  field: keyof CompanionSettings,
  value: CompanionSettings[keyof CompanionSettings]
): Promise<void> {
  await scope.set(field, value as never);
}

const cardStyle = {
  borderLeft: "4px solid var(--dsh-color-accent, #16a085)",
  padding: "18px 20px",
  background: "linear-gradient(120deg, color-mix(in srgb, var(--dsh-color-accent, #16a085) 8%, transparent), transparent 42%)"
} as const;

function SettingsCard({ scope }: { scope: ClientSettingsScope }) {
  const [snapshot, setSnapshot] = useState(scope.getSnapshot());
  const [draft, setDraft] = useState(DEFAULT_BANK_ID);
  const [status, setStatus] = useState<string>();
  const settings = normalizeCompanionSettings(snapshot.value);

  useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope]);
  useEffect(() => setDraft(settings.bankId), [settings.bankId]);

  const save = async (field: keyof CompanionSettings, value: CompanionSettings[keyof CompanionSettings]) => {
    setStatus(undefined);
    try {
      await saveSetting(scope, field, value);
      setStatus("Saved — applies to the next turn.");
    } catch {
      setStatus("This setting could not be saved from this connection.");
    }
  };
  const saveBank = () => void save("bankId", draft.trim() || DEFAULT_BANK_ID);

  return createElement(
    "section",
    { "aria-labelledby": "kepos-hindsight-settings-title", style: cardStyle },
    createElement("p", { style: { margin: 0, letterSpacing: "0.08em", fontSize: "0.75rem", fontWeight: 700, opacity: 0.72 } }, "COMPANION MEMORY"),
    createElement("h2", { id: "kepos-hindsight-settings-title", style: { margin: "4px 0 8px" } }, "Hindsight memory"),
    createElement("p", { style: { margin: "0 0 16px", maxWidth: "58ch", opacity: 0.82 } }, "One fixed bank for every direct DSH session. Raw recall and completed-turn retain always use this bank; session preset and workspace never change the routing."),
    createElement(
      "label",
      { htmlFor: "kepos-hindsight-bank", style: { display: "block", fontWeight: 650 } },
      "Memory bank",
      createElement("input", {
        id: "kepos-hindsight-bank",
        value: draft,
        onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
        style: { display: "block", width: "min(100%, 38rem)", marginTop: "6px" }
      })
    ),
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "12px", margin: "8px 0 16px" } },
      createElement("button", { type: "button", onClick: saveBank }, "Save bank"),
      createElement("small", { style: { opacity: 0.72 } }, "Default: coding-agent::workspace")
    ),
    status ? createElement("p", { role: "status", style: { margin: "14px 0 0" } }, status) : null
  );
}

export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<Partial<CompanionSettings>>({
    namespace: SETTINGS_NAMESPACE,
    decode: decodeSettings
  });
  ctx.slots.inject("settings.plugin.item", () =>
    ctx.slots.register(
      {
        name: "settings.plugin.item",
        key: SETTINGS_NAMESPACE,
        inject: () => ({})
      } as never,
      (() => createElement(SettingsCard, { scope })) as never
    )
  );
}
