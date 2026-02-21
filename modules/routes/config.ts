import { config } from "../config.ts";

export function registerConfigRoute(app: any) {
	app.get("/api/config", (_req: any, res: any) => {
		res.json({
			turnstileEnabled: config.useTurnstile,
			turnstileSiteKey: config.useTurnstile ? Deno.env.get("TURNSTILE_SITE_KEY") : null,
			moderationEnabled: config.useOpenAIModeration,
		});
	});
}
