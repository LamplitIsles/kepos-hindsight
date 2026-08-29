import { createElement, useEffect, useState } from "react";
import type { FormEvent } from "react";
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
import styleText from "./HindsightSettings.module.css";

export const inject = ["settingsScope", "slots"] as const;

type ClientSettingsScope = SettingsScope<Partial<CompanionSettings>>;

const css = {
  card: "kepos-hindsight-card",
  eyebrow: "kepos-hindsight-eyebrow",
  title: "kepos-hindsight-title",
  copy: "kepos-hindsight-copy",
  form: "kepos-hindsight-form",
  label: "kepos-hindsight-label",
  input: "kepos-hindsight-input",
  actions: "kepos-hindsight-actions",
  button: "kepos-hindsight-button",
  hint: "kepos-hindsight-hint",
  feedback: "kepos-hindsight-feedback"
} as const;

/** Install the client-bundled, plugin-scoped stylesheet for this fiber only. */
function installStyles(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const style = document.createElement("style");
  style.dataset.dshPlugin = SETTINGS_NAMESPACE;
  style.textContent = styleText;
  document.head.append(style);
  return () => style.remove();
}

/** Read only the explicit, non-secret companion settings from a client snapshot. */
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

function SettingsCard({ scope }: { scope: ClientSettingsScope }) {
  const [snapshot, setSnapshot] = useState(scope.getSnapshot());
  const [draft, setDraft] = useState(DEFAULT_BANK_ID);
  const [status, setStatus] = useState<"saved" | "error">();
  const [saving, setSaving] = useState(false);
  const settings = normalizeCompanionSettings(snapshot.value);

  useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope]);
  useEffect(() => setDraft(settings.bankId), [settings.bankId]);

  const saveBank = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(undefined);
    setSaving(true);
    try {
      await saveSetting(scope, "bankId", draft.trim() || DEFAULT_BANK_ID);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return createElement(
    "section",
    { className: css.card, "aria-labelledby": "kepos-hindsight-settings-title" },
    createElement("p", { className: css.eyebrow }, "COMPANION MEMORY"),
    createElement("h2", { className: css.title, id: "kepos-hindsight-settings-title" }, "Hindsight memory"),
    createElement(
      "p",
      { className: css.copy },
      "One fixed bank for every direct DSH session. Raw recall and session-document retain always use it; preset and workspace never reroute it."
    ),
    createElement(
      "form",
      { className: css.form, onSubmit: saveBank },
      createElement(
        "label",
        { className: css.label, htmlFor: "kepos-hindsight-bank" },
        "Memory bank",
        createElement("input", {
          className: css.input,
          id: "kepos-hindsight-bank",
          value: draft,
          disabled: saving,
          onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
          "aria-describedby": "kepos-hindsight-bank-hint"
        })
      ),
      createElement(
        "div",
        { className: css.actions },
        createElement("button", { className: css.button, type: "submit", disabled: saving }, saving ? "Saving…" : "Save bank"),
        createElement("small", { className: css.hint, id: "kepos-hindsight-bank-hint" }, "Default: coding-agent::workspace")
      )
    ),
    status === "saved"
      ? createElement("p", { className: css.feedback, "data-state": "success", role: "status" }, "Saved — applies to the next turn.")
      : null,
    status === "error"
      ? createElement("p", { className: css.feedback, "data-state": "error", role: "alert" }, "This setting could not be saved from this connection.")
      : null
  );
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => installStyles(), "kepos-hindsight: settings styles");
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
