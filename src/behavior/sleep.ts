import { sleepSchedule, type SleepSchedule } from "../config.js";

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
	if (!sleepSchedule.enabled) {
		return null;
	}

	const now = new Date();
	const tz = sleepSchedule.timezone;
	const formatter = new Intl.DateTimeFormat("fr-FR", {
		timeZone: tz,
		hour: "numeric",
		minute: "numeric",
		hourCycle: "h23",
	});
	const parts = formatter.formatToParts(now);
	const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
	const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
	const nowMinutes = hour * 60 + minute;

	const startMinutes = parseTime(sleepSchedule.start);
	const endMinutes = parseTime(sleepSchedule.end);

	if (!isInWindow(nowMinutes, startMinutes, endMinutes)) {
		return null;
	}

	return sleepSchedule.behavior;
}
