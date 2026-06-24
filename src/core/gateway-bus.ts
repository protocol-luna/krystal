import { TypedBus } from "./bus.js";

interface GatewayOp {
	t: string;
	d: Record<string, unknown>;
}

export interface GatewayMessageCreate {
	id: string;
	channel_id: string;
	guild_id?: string;
	author: {
		id: string;
		username: string;
		discriminator?: string;
		bot?: boolean;
	};
	content: string;
	mention_token?: string;
	member?: { nick?: string; roles?: string[] };
	mentions?: Array<{ id: string; username: string }>;
}

export interface GatewayMessageReactionAdd {
	message_id: string;
	channel_id: string;
	guild_id?: string;
	user_id: string;
	emoji: { name: string; id?: string; animated?: boolean };
}

export interface GatewayEvents {
	messageCreate: [GatewayMessageCreate];
	messageReactionAdd: [GatewayMessageReactionAdd];
}

export const gatewayBus = new TypedBus<GatewayEvents>();

export function feedGatewayFrame(raw: string): void {
	try {
		const { t, d } = JSON.parse(raw) as GatewayOp;
		if (!t) {
			return;
		}
		switch (t) {
			case "MESSAGE_CREATE":
				gatewayBus.emit("messageCreate", d as unknown as GatewayMessageCreate);
				break;
			case "MESSAGE_REACTION_ADD":
				gatewayBus.emit(
					"messageReactionAdd",
					d as unknown as GatewayMessageReactionAdd
				);
				break;
			default:
				break;
		}
	} catch {
		// ignore non-JSON frames (heartbeat ack, etc.)
	}
}
