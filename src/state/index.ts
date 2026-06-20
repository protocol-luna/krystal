export {
	isPaused,
	setPaused,
	isOnCooldown,
	markReplied,
	markBotActivity,
	isRecentBotActivity,
	trackSpeaker,
	canFollowUp,
	isInConversation,
	clearCooldown,
	dumpState,
	restoreState,
	MAX_FOLLOWUPS,
	FOLLOWUP_WINDOW,
} from "./state.js";

export {
	evaluateMessage,
	type TriggerResult,
} from "./trigger.js";

export {
	type PendingEntry,
	type PersistedState,
	loadState,
	persistState,
	buildPending,
	scheduleSave,
} from "./persistence.js";
