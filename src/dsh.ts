import { randomUUID } from "node:crypto";

import { HindsightClient } from "./api.js";
import { resolveCompanionConfig } from "./config.js";
import { composeRecallQuery, renderMemoryContext } from "./context.js";
import { recentUserText, textOf, transcriptForTurn } from "./transcript.js";
import type { DshPluginConfig, RecalledMemory, ResolvedCompanionConfig } from "./types.js";

export const name = "kepos-hindsight";
export const inject = ["agents"];

type AgentLike = {
  session: {
    header: {
      id: string;
      cwd?: string;
      origin?: string;
      agentPreset?: string;
    };
    events?: unknown[];
  };
};

type PreStepDecision = { kind: string; messages?: unknown[] };
type ToolContext = { tools: { register: (tool: unknown) => void } };

const seenMemories = new Map<string, Map<string, number>>();
const retainedTurns = new Map<string, Set<number>>();

function runtimeFor(agent: AgentLike, pluginConfig: DshPluginConfig): ResolvedCompanionConfig | undefined {
  if (agent.session.header.origin === "subagent") return undefined;
  const config = resolveCompanionConfig(pluginConfig, agent.session.header.cwd ?? process.cwd());
  const preset = agent.session.header.agentPreset;
  if (!config.enabled || !preset || !config.activePresets.includes(preset)) return undefined;
  return config;
}

function clientFor(config: ResolvedCompanionConfig): HindsightClient {
  return new HindsightClient(config.apiUrl, config.bankId, config.apiToken);
}

function timeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function directUserPrompt(messages: unknown[] | undefined): string {
  return (messages ?? [])
    .filter((message) => isDirectUserMessage(message))
    .map(textOf)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isDirectUserMessage(message: unknown): boolean {
  return typeof message === "object" && message !== null
    && "source" in message
    && typeof (message as { source?: unknown }).source === "object"
    && (message as { source: { kind?: unknown } }).source.kind === "user";
}

function unseenMemories(sessionId: string, turn: number, memories: RecalledMemory[]): RecalledMemory[] {
  const seen = seenMemories.get(sessionId) ?? new Map<string, number>();
  seenMemories.set(sessionId, seen);
  const fresh = memories.filter((memory) => {
    const key = memory.id ?? memory.text;
    const lastTurn = seen.get(key);
    seen.set(key, turn);
    return lastTurn === undefined || turn - lastTurn >= 3;
  });
  for (const [key, lastTurn] of seen) if (turn - lastTurn > 12) seen.delete(key);
  return fresh;
}

function injection(text: string): unknown {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: name, form: "recall" }
  };
}

export function createDshHooks(pluginConfig: DshPluginConfig = {}) {
  return {
    async preStep(payload: { agent: AgentLike; turn: number; signal: AbortSignal }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision> {
      const decision = await next();
      if (decision.kind !== "enter" || payload.signal.aborted) return decision;
      const config = runtimeFor(payload.agent, pluginConfig);
      if (!config) return decision;
      const prompt = directUserPrompt(decision.messages);
      if (!prompt) return decision;
      try {
        const history = recentUserText(payload.agent.session.events as never[] | undefined, config.recall.contextTurns);
        // DSH normally records the direct message after pre-step, but resumed
        // or test adapters can already expose it. Avoid querying that message twice.
        const prior = history.at(-1) === prompt ? history.slice(0, -1) : history;
        const previous = prior.slice(-Math.max(0, config.recall.contextTurns - 1));
        const query = composeRecallQuery(previous, prompt, config.recall.maxQueryChars);
        const memories = await clientFor(config).recall(query, config.recall, timeoutSignal(payload.signal, config.recall.timeoutMs));
        const context = renderMemoryContext(unseenMemories(payload.agent.session.header.id, payload.turn, memories));
        return context ? { ...decision, messages: [...(decision.messages ?? []), injection(context)] } : decision;
      } catch {
        // Retrieval is supplementary; a slow or unavailable memory service never blocks conversation.
        return decision;
      }
    },

    turnStopping(payload: { agent: AgentLike; turn: number }): void {
      const config = runtimeFor(payload.agent, pluginConfig);
      if (!config || !config.retainSessions) return;
      const sessionId = payload.agent.session.header.id;
      const turns = retainedTurns.get(sessionId) ?? new Set<number>();
      retainedTurns.set(sessionId, turns);
      if (turns.has(payload.turn)) return;
      turns.add(payload.turn);
      const transcript = transcriptForTurn(payload.agent.session.events as never[] | undefined, payload.turn);
      void clientFor(config).retain(sessionId, payload.turn, transcript).catch(() => {
        retainedTurns.get(sessionId)?.delete(payload.turn);
      });
    },

    disposed(payload: { agent: AgentLike }): void {
      const sessionId = payload.agent.session.header.id;
      seenMemories.delete(sessionId);
      retainedTurns.delete(sessionId);
    }
  };
}

function toolParameters(required = true): unknown {
  return {
    type: "object",
    properties: {
      query: { type: "string", description: "The memory question or topic to look up" }
    },
    ...(required ? { required: ["query"] } : {})
  };
}

function textOutput(value: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text: value }];
}

function registerTools(toolContext: ToolContext, pluginConfig: DshPluginConfig): void {
  toolContext.tools.register({
    name: "hindsight_recall",
    description: "Look up raw historical memories relevant to a question. Use it for a specific past fact or preference; it does not call an LLM or change the bank.",
    parameters: toolParameters(),
    output: { schema: { type: "string" }, render: (_args: unknown, value: string) => textOutput(value) },
    async execute(args: { query: string }, execution: { agent?: AgentLike }) {
      const config = execution.agent ? runtimeFor(execution.agent, pluginConfig) : undefined;
      if (!config) return "Hindsight companion memory is unavailable in this session.";
      const memories = await clientFor(config).recall(args.query, config.recall, timeoutSignal(undefined, config.recall.timeoutMs));
      return memories.length
        ? memories.map((memory) => `- ${memory.type ? `[${memory.type}] ` : ""}${memory.text}`).join("\n")
        : "No relevant memory was found.";
    }
  });

  toolContext.tools.register({
    name: "hindsight_reflect",
    description: "Deliberately synthesize a question across long-term memory. Slower than hindsight_recall; use only for patterns, retrospectives, or a question raw facts cannot answer.",
    parameters: toolParameters(),
    output: { schema: { type: "string" }, render: (_args: unknown, value: string) => textOutput(value) },
    async execute(args: { query: string }, execution: { agent?: AgentLike }) {
      const config = execution.agent ? runtimeFor(execution.agent, pluginConfig) : undefined;
      if (!config) return "Hindsight companion memory is unavailable in this session.";
      return (await clientFor(config).reflect(args.query, timeoutSignal(undefined, 30_000))) || "No memory synthesis was returned.";
    }
  });
}

export function apply(ctx: { on: (event: string, listener: unknown, options?: unknown) => void; inject: (services: string[], callback: (context: ToolContext) => void) => void }, pluginConfig: DshPluginConfig = {}): void {
  const hooks = createDshHooks(pluginConfig);
  ctx.on("agent/pre-step", hooks.preStep, { prepend: true });
  ctx.on("agent/turn-stopping", hooks.turnStopping);
  ctx.on("agent/disposed", hooks.disposed);
  ctx.inject(["tools"], (toolContext) => registerTools(toolContext, pluginConfig));
}

export default { name, inject, apply };
