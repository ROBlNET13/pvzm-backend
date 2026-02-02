import { AtpAgent, RichText } from "@atproto/api";
import type { LevelInfo, LoggingProvider } from "./types.ts";

export type BlueskyProviderConfig = {
	enabled?: boolean;
	pds: string;
	identifier: string;
	password: string;
};

export class BlueskyLoggingProvider implements LoggingProvider {
	readonly name = "bluesky";

	private agent: AtpAgent | null = null;
	private config: BlueskyProviderConfig;

	constructor(config: BlueskyProviderConfig) {
		this.config = config;
	}

	async init(): Promise<boolean> {
		if (this.config.enabled === false) {
			console.log("Bluesky logging provider: disabled in config, skipping");
			return false;
		}

		if (!this.config.pds || !this.config.identifier || !this.config.password) {
			console.log("Bluesky logging provider: missing credentials, skipping");
			return false;
		}

		try {
			this.agent = new AtpAgent({
				service: this.config.pds,
			});

			await this.agent.login({
				identifier: this.config.identifier,
				password: this.config.password,
			});

			console.log("Bluesky logging provider: bot logged in");
			return true;
		} catch (error) {
			console.error("Bluesky logging provider: init failed:", error);
			return false;
		}
	}

	async sendLevelMessage(level: LevelInfo): Promise<string | null> {
		if (!this.agent) return null;

		try {
			const playUrl = `${level.gameUrl}/?izl_id=${level.id}`;
			const message = `New I, Zombie level uploaded!\n\n"${level.name}" by ${level.author}\n\n${playUrl}`;

			const rt = new RichText({ text: message });
			await rt.detectFacets(this.agent);

			const response = await this.agent.post({
				text: rt.text,
				facets: rt.facets,
			});

			// return the post URI as the message ID
			return response.uri;
		} catch (error) {
			console.error("Bluesky logging provider: sendLevelMessage failed:", error);
			return null;
		}
	}

	async editLevelMessage(_messageId: string, _level: LevelInfo): Promise<boolean> {
		// bluesky doesn't support editing posts
		return false;
	}

	async deleteLevelMessage(messageId: string): Promise<boolean> {
		if (!this.agent || !messageId) return false;

		try {
			await this.agent.deletePost(messageId);
			return true;
		} catch (error) {
			console.error("Bluesky logging provider: deleteLevelMessage failed:", error);
			return false;
		}
	}

	async sendReportMessage(): Promise<boolean> {
		// reports not supported on Bluesky
		return false;
	}
}
