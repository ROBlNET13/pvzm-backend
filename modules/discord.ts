import { WebhookClient } from "discord.js";

import type { ServerConfig } from "./config.ts";

export type DiscordClients = {
	reportWebhookClient?: WebhookClient;
	uploadWebhookClient?: WebhookClient;
};

export function createDiscordClients(config: ServerConfig): DiscordClients {
	let reportWebhookClient: WebhookClient | undefined;
	if (config.useReporting && config.discordReportWebhookUrl) {
		reportWebhookClient = new WebhookClient({
			url: config.discordReportWebhookUrl,
		});
	}

	let uploadWebhookClient: WebhookClient | undefined;
	if (config.useUploadLogging && config.discordUploadWebhookUrl) {
		uploadWebhookClient = new WebhookClient({
			url: config.discordUploadWebhookUrl,
		});
	}

	return { reportWebhookClient, uploadWebhookClient };
}

export async function trySendDiscordWebhook(client: WebhookClient | undefined, payload: any) {
	if (!client) return;
	try {
		await client.send(payload);
	} catch (error) {
		console.error("Error sending Discord webhook:", error);
	}
}
