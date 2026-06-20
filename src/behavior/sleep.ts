import { config, type SleepSchedule } from "../config.js";

function parseTime(t: string): number {
	const [h, m] = t.split(":").map(Number);
	return h * 60 + m;
}

function isInWindow(now: number, start: number, end: number): boolean {
	if (start <= end) {
		return now >= start && now < end;
	}
	return now >= start || now < end;
}

export function getSleepBehavior(): SleepSchedule["behavior"] | null {
	if (!config.sleepSchedule.enabled) {
		return null;
	}

	const tz = config.sleepSchedule.timezone;

	const now = new Date();
	const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
	const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();

	const startMinutes = parseTime(config.sleepSchedule.start);
	const endMinutes = parseTime(config.sleepSchedule.end);

	if (!isInWindow(currentMinutes, startMinutes, endMinutes)) {
		return null;
	}

	return config.sleepSchedule.behavior;
}
