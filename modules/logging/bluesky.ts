import { AtpAgent, RichText } from "@atproto/api";
import type { FeaturedLevelInfo, LevelInfo, LoggingProvider } from "./types.ts";

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

	private async uploadImageEmbed(png: Uint8Array, alt: string) {
		if (!this.agent) return undefined;
		const uploadResponse = await this.agent.uploadBlob(png, { encoding: "image/png" });
		return {
			$type: "app.bsky.embed.images" as const,
			images: [
				{
					alt,
					image: uploadResponse.data.blob,
					aspectRatio: { width: 900, height: 600 },
				},
			],
		};
	}

	async sendLevelMessage(level: LevelInfo): Promise<string | null> {
		if (!this.agent) return null;

		try {
			const playUrl = `${level.gameUrl}/?izl_id=${level.id}`;
			const message = `New I, Zombie level uploaded!\n\n"${level.name}" by ${level.author}\n\n${playUrl}`;

			const rt = new RichText({ text: message });
			await rt.detectFacets(this.agent);

			const embed = level.thumbnail ? await this.uploadImageEmbed(level.thumbnail, level.name) : undefined;

			const response = await this.agent.post({
				text: rt.text,
				facets: rt.facets,
				embed,
			});

			// return the post uri as the message id
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
			console.warn(`Bluesky logging provider: delete failed for post ${messageId}:`, (error as Error).message);
			return false;
		}
	}

	async sendReportMessage(): Promise<boolean> {
		// reports not supported on bluesky
		return false;
	}

	async sendFeaturedMessage(level: FeaturedLevelInfo): Promise<string | null> {
		if (!this.agent) return null;

		try {
			const playUrl = `${level.gameUrl}/?izl_id=${level.id}`;
			const message = `Newly featured level!\n\n"${level.name}" by ${level.author}\n\n${playUrl}`;

			const rt = new RichText({ text: message });
			await rt.detectFacets(this.agent);

			const response = await this.agent.post({
				text: rt.text,
				facets: rt.facets,
			});

			return response.uri;
		} catch (error) {
			console.error("Bluesky logging provider: sendFeaturedMessage failed:", error);
			return null;
		}
	}

	async deleteFeaturedMessage(messageId: string): Promise<boolean> {
		if (!this.agent || !messageId) return false;

		try {
			await this.agent.deletePost(messageId);
			return true;
		} catch (error) {
			console.warn(`Bluesky logging provider: featured delete failed for post ${messageId}:`, (error as Error).message);
			return false;
		}
	}
}
