import type { LevelInfo, AdminLevelInfo, FeaturedLevelInfo, LoggingProvider, ReportInfo, AuditLogEntry } from "./types.ts";

/**
 * unified logging data structure stored as JSON in the database.
 * each provider has its own object with message IDs for different contexts.
 * example:
 * {
 *   "discord": { "public": "123", "admin": "456" },
 *   "bluesky": { "public": "uri", "featured": "uri" }
 * }
 */
export type ProviderMessageData = {
	public?: string;
	admin?: string;
	featured?: string;
};
export type LoggingData = Record<string, ProviderMessageData>;

export class LoggingManager {
	private providers: LoggingProvider[] = [];

	addProvider(provider: LoggingProvider): void {
		this.providers.push(provider);
	}

	async initAll(): Promise<void> {
		const results = await Promise.allSettled(
			this.providers.map(async (provider) => {
				const success = await provider.init();
				return { name: provider.name, success };
			})
		);

		for (const result of results) {
			if (result.status === "rejected") {
				console.error("Logging provider init rejected:", result.reason);
			}
		}

		// filter out providers that failed to initialize
		const successfulProviders: LoggingProvider[] = [];
		for (let i = 0; i < this.providers.length; i++) {
			const result = results[i];
			if (result.status === "fulfilled" && result.value.success) {
				successfulProviders.push(this.providers[i]);
			}
		}
		this.providers = successfulProviders;

		console.log(`Logging manager: ${this.providers.length} provider(s) active: ${this.providers.map((p) => p.name).join(", ") || "(none)"}`);
	}

	/**
	 * parse logging data from JSON string, returns empty object on failure
	 */
	private parseLoggingData(json: string | null): LoggingData {
		if (!json) return {};
		try {
			return JSON.parse(json);
		} catch {
			return {};
		}
	}

	/**
	 * stringify logging data to JSON, returns null if empty
	 */
	private stringifyLoggingData(data: LoggingData): string | null {
		if (Object.keys(data).length === 0) return null;
		return JSON.stringify(data);
	}

	/**
	 * send a level message to all providers
	 * returns updated logging data JSON string
	 */
	async sendLevelMessage(level: LevelInfo, existingDataJson: string | null = null): Promise<string | null> {
		if (this.providers.length === 0) return existingDataJson;

		const data = this.parseLoggingData(existingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = await provider.sendLevelMessage(level);
				if (messageId) {
					if (!data[provider.name]) data[provider.name] = {};
					data[provider.name].public = messageId;
				}
			})
		);

		return this.stringifyLoggingData(data);
	}

	/**
	 * send an admin level message to all providers
	 * returns updated logging data JSON string
	 */
	async sendAdminLevelMessage(level: AdminLevelInfo, existingDataJson: string | null = null): Promise<string | null> {
		if (this.providers.length === 0) return existingDataJson;

		const data = this.parseLoggingData(existingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				if ("sendAdminLevelMessage" in provider) {
					const messageId = await (provider as any).sendAdminLevelMessage(level);
					if (messageId) {
						if (!data[provider.name]) data[provider.name] = {};
						data[provider.name].admin = messageId;
					}
				}
			})
		);

		return this.stringifyLoggingData(data);
	}

	/**
	 * send a featured level message to all providers
	 * returns updated logging data JSON string
	 */
	async sendFeaturedMessage(level: FeaturedLevelInfo, existingDataJson: string | null = null): Promise<string | null> {
		if (this.providers.length === 0) return existingDataJson;

		const data = this.parseLoggingData(existingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				if ("sendFeaturedMessage" in provider) {
					const messageId = await (provider as any).sendFeaturedMessage(level);
					if (messageId) {
						if (!data[provider.name]) data[provider.name] = {};
						data[provider.name].featured = messageId;
					}
				}
			})
		);

		return this.stringifyLoggingData(data);
	}

	/**
	 * edit a level message across all providers
	 */
	async editLevelMessage(loggingDataJson: string | null, level: LevelInfo): Promise<void> {
		if (!loggingDataJson || this.providers.length === 0) return;

		const data = this.parseLoggingData(loggingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = data[provider.name]?.public;
				if (messageId) {
					await provider.editLevelMessage(messageId, level);
				}
			})
		);
	}

	/**
	 * edit an admin level message across all providers
	 */
	async editAdminLevelMessage(loggingDataJson: string | null, level: AdminLevelInfo): Promise<void> {
		if (!loggingDataJson || this.providers.length === 0) return;

		const data = this.parseLoggingData(loggingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = data[provider.name]?.admin;
				if (messageId && "editAdminLevelMessage" in provider) {
					await (provider as any).editAdminLevelMessage(messageId, level);
				}
			})
		);
	}

	/**
	 * delete a level message across all providers
	 * returns updated logging data JSON string with public message IDs removed
	 */
	async deleteLevelMessage(loggingDataJson: string | null): Promise<string | null> {
		if (!loggingDataJson || this.providers.length === 0) return loggingDataJson;

		const data = this.parseLoggingData(loggingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = data[provider.name]?.public;
				if (messageId) {
					await provider.deleteLevelMessage(messageId);
					delete data[provider.name].public;
					// clean up empty provider objects
					if (Object.keys(data[provider.name]).length === 0) {
						delete data[provider.name];
					}
				}
			})
		);

		return this.stringifyLoggingData(data);
	}

	/**
	 * Delete an admin level message across all providers
	 * Returns updated logging data JSON string with admin message IDs removed
	 */
	async deleteAdminLevelMessage(loggingDataJson: string | null): Promise<string | null> {
		if (!loggingDataJson || this.providers.length === 0) return loggingDataJson;

		const data = this.parseLoggingData(loggingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = data[provider.name]?.admin;
				if (messageId && "deleteAdminLevelMessage" in provider) {
					await (provider as any).deleteAdminLevelMessage(messageId);
					delete data[provider.name].admin;
					// clean up empty provider objects
					if (Object.keys(data[provider.name]).length === 0) {
						delete data[provider.name];
					}
				}
			})
		);

		return this.stringifyLoggingData(data);
	}

	/**
	 * Delete a featured level message across all providers
	 * Returns updated logging data JSON string with featured message IDs removed
	 */
	async deleteFeaturedMessage(loggingDataJson: string | null): Promise<string | null> {
		if (!loggingDataJson || this.providers.length === 0) return loggingDataJson;

		const data = this.parseLoggingData(loggingDataJson);

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = data[provider.name]?.featured;
				if (messageId && "deleteFeaturedMessage" in provider) {
					await (provider as any).deleteFeaturedMessage(messageId);
					delete data[provider.name].featured;
					// clean up empty provider objects
					if (Object.keys(data[provider.name]).length === 0) {
						delete data[provider.name];
					}
				}
			})
		);

		return this.stringifyLoggingData(data);
	}

	/**
	 * Send a report message to all providers
	 */
	async sendReportMessage(report: ReportInfo): Promise<void> {
		if (this.providers.length === 0) return;

		await Promise.allSettled(this.providers.map((provider) => provider.sendReportMessage(report)));
	}

	/**
	 * Send an audit log entry to all providers
	 */
	async sendAuditLog(entry: AuditLogEntry): Promise<void> {
		if (this.providers.length === 0) return;

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				if ("sendAuditLog" in provider) {
					await (provider as any).sendAuditLog(entry);
				}
			})
		);
	}

	get hasProviders(): boolean {
		return this.providers.length > 0;
	}
}
