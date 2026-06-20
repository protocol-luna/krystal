import { config } from "../config.js";

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

export type SleepBehavior = "sleep" | "slow" | "short" | null;

export function getSleepBehavior(): SleepBehavior {
	const schedules = config.timeSchedules;
	if (!Array.isArray(schedules) || schedules.length === 0) {
		return null;
	}

	const tz = config.timezone;

	const now = new Date();
	const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
	const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();

	for (const entry of schedules) {
		const startMinutes = parseTime(entry.start);
		const endMinutes = parseTime(entry.end);
		if (isInWindow(currentMinutes, startMinutes, endMinutes)) {
			return entry.behavior ?? null;
		}
	}

	return null;
}
