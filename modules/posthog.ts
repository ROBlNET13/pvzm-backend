import { PostHog } from "posthog-node";

import { config } from "./config.ts";

export let postHogClient: PostHog | null = null;

export function initPostHog(): PostHog | null {
	if (!config.usePostHogAnalytics) {
		return null;
	}
	console.log("Initializing PostHog analytics");

	const postHog = new PostHog(config.postHogApiKey, {
		host: config.postHogHost,
	});

	postHogClient = postHog;
	return postHog;
}

export function shutdownPostHog(client: PostHog | null) {
	if (client) {
		client.shutdown();
	}
}
