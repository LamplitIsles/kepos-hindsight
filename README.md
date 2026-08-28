# kepos-hindsight

A small [Hindsight](https://github.com/vectorize-io/hindsight) adapter for a
companion-style DSH agent. It replaces only DSH's official *coding-agent*
adapter. Codex can keep using the official coding-agent hooks and the same
`~/.hindsight/coding-agent.json` file.

## What it does

- Runs raw Hindsight recall on every direct user turn, with the current message
  and a small amount of prior user context.
- Injects recalled facts as explicitly untrusted historical context. Retrieval
  failures time out and never block a reply.
- Retains each completed DSH turn asynchronously as a stable Hindsight
  document: `dsh:<session-id>:turn:<turn>`.
- Exposes two deliberate read-only tools:
  - `hindsight_recall` — raw fact retrieval, no LLM call.
  - `hindsight_reflect` — bank-defined synthesis for a question that raw facts
    cannot answer.

It does **not** seed a codebase, create knowledge pages, auto-reflect, import
a bank template, or enable subagents.

## Bank strategies and prompts

The adapter has no opinion about the bank's `retain_mission`,
`observations_mission`, or `reflect_mission`.

It never calls `/import`, does not send a Hindsight `strategy`, and does not
send a retain `context`. Configure those missions in Hindsight for the target
bank, through its normal UI or bank-config API. This keeps each companion's
memory policy entirely user-owned and prevents a DSH plugin update from
overwriting it.

The short wrapper around recalled facts is a prompt-injection boundary, not a
Hindsight strategy: recalled history is evidence, never an instruction.

## Install as a local DSH bundle

```bash
pnpm install
pnpm build
dsh plugin --profile web add file:/absolute/path/to/kepos-hindsight
```

The bundle disables the official DSH row named `hindsight`, then mounts
`kepos-hindsight`. It does not alter the official Codex integration. Confirm
the composition before starting DSH:

```bash
dsh --profile web --dump-config
```

The output should include a disabled `hindsight` row and an enabled
`kepos-hindsight` row. A running DSH host must be restarted after changing its
bundle list.

## Configuration

Endpoint, credentials, bank selection, and the global `disabled` flag stay in
the normal shared Hindsight config, `~/.hindsight/coding-agent.json`. The
adapter respects `bankId` and `mapPathToBank`; if neither selects a bank, it
uses `coding-agent::workspace`.

It runs only for the `yuki` DSH preset by default. The optional
`harnesses.dsh.companion` extension configures adapter behavior; the official
coding-agent adapter ignores this extension.

```json
{
  "harnesses": {
    "dsh": {
      "companion": {
        "activePresets": ["yuki"],
        "recall": {
          "budget": "low",
          "maxTokens": 900,
          "types": ["observation", "world", "experience"],
          "preferObservations": true,
          "topK": 6,
          "contextTurns": 2,
          "maxQueryChars": 800,
          "timeoutMs": 4000
        }
      }
    }
  }
}
```

This example is optional: the values shown are the defaults. `low` recall is
retrieval rather than a Reflect LLM request. Raise its budget only after
checking that a real conversation needs broader retrieval.

## Yuki lives in DSH live config

This repository deliberately ships no Yuki persona or preset. Create and keep
the preset locally under `$DSH_HOME/.agent-presets/yuki/`, preferably by copying
DSH's current `standard` preset through DSH's preset UI and then editing the
copy. Disable or remove its `delegation` group for a single-session companion. The
workspace's own `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, and `USER.md` remain the
source of truth for personality and relationship behavior.

## Development

```bash
pnpm check
pnpm test
pnpm build
```

The tests use fake Hindsight HTTP responses and test-owned temporary config
directories; they never read or modify a live bank.
