import { TypedBus } from "./bus.js";

// biome-ignore lint/style/useConsistentTypeDefinitions: type required for EventMap constraint
export type LLMEvents = {
	token: [chunk: string];
	done: [fullText: string];
	error: [err: Error];
	crash: [code: number | null];
	ready: [];
	reset: [];
	flush: [];
};

export const llmBus = new TypedBus<LLMEvents>();
