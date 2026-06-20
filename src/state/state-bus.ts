import { TypedBus } from "../core/bus.js";

// biome-ignore lint/style/useConsistentTypeDefinitions: type required for EventMap constraint
export type StateEvents = {
	"state:changed": [];
};

export const stateBus = new TypedBus<StateEvents>();
