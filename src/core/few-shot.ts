/**
 * Few-shot Priming Module
 * Fournit des exemples de conversations pour guider le modèle LLM
 * vers un style et un ton cohérents dans ses réponses
 */

export interface FewShotExample {
	user: string;
	assistant: string;
}

export interface FewShotConfig {
	enabled: boolean;
	examples: FewShotExample[];
}

/**
 * Formate les exemples de few-shot en messages pour la conversation
 * @param examples - Les exemples de few-shot
 * @param username - Nom d'utilisateur optionnel
 * @returns Array de messages formatés
 */
export function formatFewShotExamples(
	examples: FewShotExample[],
	username: string = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
	const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

	for (const example of examples) {
		messages.push({
			role: "user",
			content: `${username}: ${example.user}`,
		});
		messages.push({
			role: "assistant",
			content: example.assistant,
		});
	}

	return messages;
}

/**
 * Insère les exemples de few-shot au début de la conversation
 * (après le system prompt)
 * @param messages - Le tableau de messages courant
 * @param fewShotMessages - Les messages de few-shot formatés
 * @returns Array de messages avec few-shot inséré
 */
export function injectFewShotIntoConversation(
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	fewShotMessages: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
	// Trouve le système prompt (toujours à l'index 0)
	if (messages.length === 0) {
		return [...fewShotMessages] as Array<{
			role: "system" | "user" | "assistant";
			content: string;
		}>;
	}

	const systemMessage = messages[0];
	const userMessages = messages.slice(1);

	// Construit le nouvel array : system + few-shot + reste de la conversation
	return [
		systemMessage,
		...fewShotMessages,
		...userMessages,
	] as Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

/**
 * Limite le nombre de messages pour éviter de dépasserle contexte
 * @param messages - Array de messages
 * @param maxMessages - Nombre maximum de messages à conserver
 * @returns Array limité de messages (garde toujours le système prompt)
 */
export function limitMessageHistory(
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	maxMessages: number
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
	if (messages.length <= maxMessages) {
		return messages;
	}

	// Garde le système prompt + les N derniers messages
	const systemMessage = messages[0];
	const recentMessages = messages.slice(-(maxMessages - 1));

	return [systemMessage, ...recentMessages];
}
