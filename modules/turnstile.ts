import { TurnstileVerify } from "@mathis/turnstile-verify";

import type { ServerConfig } from "./config.ts";

export interface TurnstileResponse {
	valid: boolean;
	messages?: string[];
}

export function initTurnstile(config: ServerConfig) {
	let turnstile: TurnstileVerify | undefined;
	if (config.useTurnstile) {
		if (config.turnstileSecret) {
			turnstile = new TurnstileVerify({ token: config.turnstileSecret });
			console.log("Turnstile verification enabled");
		} else {
			console.error("TURNSTILE_SECRET not provided, turnstile verification disabled");
		}
	}

	return async function validateTurnstile(response: string, remoteip: string): Promise<TurnstileResponse> {
		if (!config.useTurnstile || !turnstile) return { valid: true };

		const turnstileTesting = Deno.env.get("TURNSTILE_TESTING") === "true";
		if (turnstileTesting && response === "XXXX.DUMMY.TOKEN.XXXX") {
			return { valid: true };
		}

		try {
			const turnstileResponse = await turnstile.validate({
				response,
				remoteip,
			});
			return turnstileResponse;
		} catch (error) {
			console.error("Turnstile validation error:", error);
			return { valid: false, messages: ["Error validating captcha"] };
		}
	};
}
