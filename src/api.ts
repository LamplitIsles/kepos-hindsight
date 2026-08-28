import { createHash } from "node:crypto";

import type { RecallSettings, RecalledMemory, TranscriptTurn } from "./types.js";

export type FetchImplementation = typeof fetch;

export class HindsightClient {
  constructor(
    private readonly apiUrl: string,
    private readonly bankId: string,
    private readonly apiToken?: string,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  private url(path: string): string {
    return `${this.apiUrl}/v1/default/banks/${encodeURIComponent(this.bankId)}${path}`;
  }

  private headers(): HeadersInit {
    return {
      "content-type": "application/json",
      ...(this.apiToken ? { authorization: `Bearer ${this.apiToken}` } : {})
    };
  }

  private async request(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await this.fetchImplementation(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) throw new Error(`Hindsight ${path} returned ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  async recall(query: string, settings: RecallSettings, signal?: AbortSignal): Promise<RecalledMemory[]> {
    const response = await this.request("/memories/recall", {
      query,
      budget: settings.budget,
      max_tokens: settings.maxTokens,
      types: settings.types,
      prefer_observations: settings.preferObservations
    }, signal);
    const results = isRecord(response) && Array.isArray(response.results) ? response.results : [];
    return results
      .map(toMemory)
      .filter((memory): memory is RecalledMemory => memory !== undefined)
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, settings.topK);
  }

  async reflect(query: string, signal?: AbortSignal): Promise<string> {
    const response = await this.request("/reflect", { query, budget: "low" }, signal);
    return isRecord(response) && typeof response.text === "string" ? response.text.trim() : "";
  }

  /** Retain one completed DSH turn as an idempotent, asynchronous document. */
  async retain(sessionId: string, turn: number, turns: TranscriptTurn[]): Promise<void> {
    if (!turns.length) return;
    const content = JSON.stringify(turns);
    const documentId = `dsh:${sessionId}:turn:${turn}`;
    const operationId = deterministicOperationId(`${this.bankId}\n${documentId}\n${content}`);
    await this.request("/memories", {
      async: true,
      operation_id: operationId,
      items: [{
        content,
        document_id: documentId,
        tags: ["source:chat", "harness:dsh", "mode:companion"],
        metadata: {
          source: "chat",
          harness: "dsh",
          session_id: sessionId,
          turn
        }
      }]
    });
  }
}

/**
 * Hindsight expects a UUID operation ID. Keep it deterministic so retrying a
 * completed turn remains idempotent without keeping another local state file.
 */
function deterministicOperationId(value: string): string {
  const bytes = createHash("sha1").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toMemory(value: unknown): RecalledMemory | undefined {
  if (!isRecord(value)) return undefined;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text) return undefined;
  return {
    ...value,
    text,
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(typeof value.score === "number" ? { score: value.score } : {})
  };
}
