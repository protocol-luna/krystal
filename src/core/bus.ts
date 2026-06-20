type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
	private listeners = new Map<
		keyof Events,
		Set<(...args: unknown[]) => void>
	>();

	on<K extends keyof Events>(
		event: K,
		listener: (...args: Events[K]) => void
	): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
	}

	off<K extends keyof Events>(
		event: K,
		listener: (...args: Events[K]) => void
	): void {
		this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
	}

	once<K extends keyof Events>(
		event: K,
		listener: (...args: Events[K]) => void
	): void {
		const wrapper = (...args: unknown[]) => {
			this.off(event, wrapper as (...args: unknown[]) => void);
			(listener as (...args: unknown[]) => void)(...args);
		};
		this.on(event, wrapper as (...args: Events[K]) => void);
	}

	emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
		this.listeners.get(event)?.forEach((fn) => {
			fn(...args);
		});
	}

	removeAll(): void {
		this.listeners.clear();
	}
}
