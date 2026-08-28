export { HindsightClient } from "./api.js";
export { DEFAULT_BANK_ID, DEFAULT_RECALL, defaultConfigPath, resolveCompanionConfig } from "./config.js";
export { composeRecallQuery, renderMemoryContext } from "./context.js";
export { createDshHooks } from "./dsh.js";
export { recentUserText, textOf, transcriptForTurn } from "./transcript.js";
export type { DshPluginConfig, RecallSettings, RecalledMemory, ResolvedCompanionConfig, TranscriptTurn } from "./types.js";
