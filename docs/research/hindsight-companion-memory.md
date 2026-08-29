# Hindsight companion-memory research

Research date: 2026-08-29. This is an evidence note, not a proposed
configuration change.

## Bottom line

Hindsight has official support for the adjacent use case, including an
explicit **Personal AI companions** recipe. Its public examples already cover
per-user banks, a session document that is updated as the conversation grows,
automatic recall before a reply, and extraction of important people and their
relationships. There is also at least one independent open-source companion
application using the official TypeScript SDK in its normal chat loop:
[`CN-PlayerYe/huanshi`](https://github.com/CN-PlayerYe/huanshi).

This is not evidence that Hindsight's stock extraction prompt will reliably
promote every relationship moment to a recallable fact. The official docs say
that a narrow retain mission may legitimately yield no facts while preserving
the raw document; recall and reflect then cannot find that document. A
companion bank therefore needs a deliberately broad-enough retain policy for
relationship context, not merely complete transcript retention.

## Prompt and strategy surfaces

The following are separate controls. They should not be treated as aliases for
one global "memory prompt".

| Layer | Surface | What it affects |
| --- | --- | --- |
| Per retain item | `content` | The source text to be extracted. It is data, not a configurable prompt. |
| Per retain item | `timestamp` | Is injected into extraction so relative dates can be resolved. |
| Per retain item | `context` | A short source/speaker/situation label, **injected directly into the extraction prompt**. This is the most useful caller-owned attribution cue for a transcript. |
| Per retain item | `metadata` | Key/value strings are included in the extraction prompt and are also stored on recalled memories. |
| Per retain request | `strategy` | Chooses a named bank strategy. If omitted, `retain_default_strategy` applies. |
| Bank retain | `retain_mission` | Plain-language focus added alongside the built-in extraction rules. It narrows/steers; it does not replace the extractor. It is ignored in `chunks` mode. |
| Bank retain | `retain_extraction_mode` | `concise` (default), `verbose`, `verbatim`, `chunks`, or `custom`. `verbose` asks for richer facts; `chunks` has no extraction LLM. |
| Bank retain | `retain_custom_instructions` + `retain_extraction_mode: custom` | Replaces the built-in *extraction guidelines*. Hindsight keeps structural requirements such as the output format, temporal handling, and coreference resolution. |
| Bank retain | `retain_strategies` / `retain_default_strategy` | Named overlays. A strategy can override hierarchical retain fields such as mission, mode, chunk sizes, labels, and custom instructions; it lets one bank use different policies for chat and imported documents. |
| Observation consolidation | `observations_mission` | Defines what durable observations should be. Unlike `retain_mission`, it **replaces** the default consolidation definition. It affects later synthesis, not which raw facts the just-submitted transcript produces. |
| Reflect | `reflect_mission` | First-person identity/reasoning framing for the reflect agent only. It does not affect retain or raw recall. |
| Reflect | `disposition_{skepticism,literalism,empathy}` | Soft reasoning/tone modifiers for reflect only. |
| Reflect | directives | Hard rules injected into applicable reflect calls. Untagged directives are global; tagged directives require a matching reflect scope unless `apply_all_directives` is set. |
| Mental models / knowledge pages | `source_query`, name, refresh trigger | Each model's source question is a durable prompt for Hindsight to maintain a synthesized page. This is useful for a stable `Relationship context` or `User profile` page, but it is not an extraction rule. |
| Recall | query, budget, types/tags/token limits | Raw recall has retrieval parameters, not a bank `recall_mission`. The injection preamble/boundary is owned by the calling integration (DSH/OpenClaw/Hermes), not by Hindsight's bank configuration. |

Primary references:

- [Retain API: timestamp, context, metadata, document ID, update mode, strategy](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/retain.mdx#L73-L153)
- [Retain guide: mission, modes, zero-fact outcome, and reprocess](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/retain.md#L183-L250)
- [Configuration: retain custom instructions and named strategies](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/configuration.md#L1585-L1681)
- [Memory banks: retain, observations, reflect, and directives](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memory-banks.mdx#L58-L99) · [observations/reflect](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memory-banks.mdx#L188-L279) · [directives](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memory-banks.mdx#L432-L456)

### Implication for the DSH adapter

The adapter deliberately does **not** own the bank missions, strategies, or
custom instructions. It sends neither a retain `context` nor an explicit
strategy, so it is possible to change the companion policy at the bank level
without a plugin release. It currently provides stable session documents and
caller metadata; selecting a companion default strategy would apply the policy
without putting prompts into the plugin.

This division is important: prompt policy should remain user-configurable, but
source attribution is still an integration responsibility. For conversation
transcripts, Hindsight's own docs recommend a `context` such as "The assistant
is speaking" or "Customer Maria is speaking" to prevent first-person facts
from being attributed to the wrong owner.

### Strategy precedence and coding-agent coexistence

An explicit retain `strategy` is not decorative: it overlays the resolved
bank configuration, including `retain_mission`. The official coding-agent
integration's `conversation` strategy deliberately has a developer-only,
final-state-only mission and enables `verbose` extraction. Its template sets
`retain_default_strategy: "git"` when it creates a new coding bank; when it
touches an existing bank it keeps user-written missions but re-applies the
named strategies because its own writes require them.

Source: [official coding-agent mission and strategy source](https://github.com/vectorize-io/hindsight/blob/main/hindsight-integrations/coding-agents/src/core/missions.ts#L29-L44),
[the `conversation` strategy](https://github.com/vectorize-io/hindsight/blob/main/hindsight-integrations/coding-agents/src/core/missions.ts#L80-L90),
and [existing-bank structure policy](https://github.com/vectorize-io/hindsight/blob/main/hindsight-integrations/coding-agents/src/core/missions.ts#L366-L397).

Consequently, a companion top-level `retain_mission` alone does not protect a
write made with `strategy: "conversation"`; that write intentionally uses the
coding policy. The DSH companion adapter sends no strategy, so a companion
default (or no default plus top-level companion mission) remains selectable
without changing it. Any future shared-bank setup should test the *actual
strategy present on each caller's retain request*, especially migration and
backfill tools.

## Companion and personal-agent evidence

### 1. Official per-user / companion recipe

Hindsight's own [Per-User Memory recipe](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/src/pages/cookbook/recipes/per-user-memory.md)
says the pattern is a good fit for "**Personal AI companions**". It retains
the complete conversation under one `document_id`; a subsequent save with the
same ID replaces/upserts the document so facts are re-extracted from the full
conversation. The recipe's agent loop is recall before response, then save
the updated transcript after response.

This is direct support for the session-document semantic used by the DSH
adapter; it is not an endorsement of per-turn standalone documents.

### 2. Official Personal Assistant bank template

The official
[`personal-assistant.json`](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/src/data/templates/personal-assistant.json)
is especially relevant. Its `retain_mission` explicitly extracts the user's
preferences, routines, commitments, important people, and **those people's
relationship to the user**. Its `observations_mission` includes important
people/relationships and shifting priorities. It also supplies:

- a `User Profile` mental model whose source question asks for important people
  and how the user likes to be helped;
- `Routines & Schedule` and `Active Tasks & Commitments` mental models;
- reflect directives to avoid making the user repeat themselves, act on
  remembered commitments, and respect people in the user's life.

This is official precedent for making relationship context an explicit
retention and observation concern rather than assuming a generic coding or
personal-facts mission will infer it.

The older official [Personal AI Assistant recipe](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/src/pages/cookbook/recipes/personal_assistant.md)
also demonstrates recall on every chat input and retaining the interaction
after the reply, including family, work, preferences, routines, and goals.

### 3. Independent open-source companion app: Huanshi

[`CN-PlayerYe/huanshi`](https://github.com/CN-PlayerYe/huanshi) describes
itself as a local-first private AI assistant with memory and personalities. Its
README advertises Hindsight long-term memory, separate memory/permissions/style
for each persona, voice, images, scheduled outreach, and a phone-accessible
LAN web UI.

Its [Hindsight backend](https://github.com/CN-PlayerYe/huanshi/blob/main/server/memory/hindsight.ts)
uses `@vectorize-io/hindsight-client` directly. It:

- creates a persona-specific bank when an isolated persona is used;
- recalls before chat and injects the results as non-authoritative background;
- retains an asynchronously submitted conversation experience after a reply;
- exposes a deliberate reflect action;
- uses `context: "user preference or fact"` versus
  `"conversation experience"` to steer extraction.

The [chat engine](https://github.com/CN-PlayerYe/huanshi/blob/main/server/agent/engine.ts#L398-L409)
maps `agent.isolatedMemory` to a persona scope for recall, and its successful
response path retains a summary asynchronously
([lines 618–624](https://github.com/CN-PlayerYe/huanshi/blob/main/server/agent/engine.ts#L618-L624)).

It is real, close prior art, but not a drop-in model: it stores one generated
summary per response rather than a full session document, and its current bank
mission is generic personal continuity. It therefore validates the overall
architecture, not that its extraction policy solves relationship-memory loss.

### 4. Independent self-hosted personal-agent workflow

[`jscholz/hermes-agent-workflow`](https://github.com/jscholz/hermes-agent-workflow)
is an Apache-2.0 public template for a self-hosted personal assistant stack
with Hermes, a phone-oriented PWA, voice bridge, daily encrypted snapshots, and
a Hindsight bank dump. Its
[example Hindsight config](https://github.com/jscholz/hermes-agent-workflow/blob/main/hindsight.config.example.json)
uses `memory_mode: "hybrid"`, `auto_recall`, `auto_retain`, and asynchronous
retain every turn. Its persona lives in `SOUL.md`, rather than in a custom
Hindsight retain prompt. This supports the operational pattern, but is not
evidence for a relationship-aware extraction strategy.

### 5. Official always-on agent lifecycle, but not a relationship policy

The [Hindsight/Hermes integration announcement](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/blog/2026-04-06-hermes-native-memory-provider.md)
documents the same lifecycle: relevant recall before every turn, background
retain after every response, and a `hybrid` mode combining automatic injection
with explicit retain/recall/reflect tools. That is useful lifecycle precedent
for a messaging/personal agent, but its default docs do not provide a
companion-relationship retain strategy as specific as the Personal Assistant
template.

## What the search did not establish

I found direct official personal-assistant/companion support and the Huanshi
implementation above. I did **not** find a separately documented, mature
Hindsight integration whose published strategy explicitly preserves fictional
or intimate relationship rituals (shared names, in-jokes, symbolic places,
relationship milestones) as first-class companion memories. That gap is a
reason to tailor the bank policy and measure recall on representative
conversations; it is not evidence that the raw transcript was lost.

## Sources consulted

All Hindsight claims above use the upstream `vectorize-io/hindsight`
repository and its docs/templates. Huanshi claims use that application's
public README and implementation source, not a third-party review.
