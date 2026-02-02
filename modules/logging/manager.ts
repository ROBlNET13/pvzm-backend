import type { LevelInfo, AdminLevelInfo, LoggingProvider, ReportInfo, AuditLogEntry } from "./types.ts";

/**
 * stores message IDs for each provider as JSON: { "discord": "123", "slack": "456" }
 */
export type ProviderMessageIds = Record<string, string>;

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
	 * send a level message to all providers
	 * returns a JSON string of provider -> messageId mappings
	 */
	async sendLevelMessage(level: LevelInfo): Promise<string | null> {
		if (this.providers.length === 0) return null;

		const messageIds: ProviderMessageIds = {};

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = await provider.sendLevelMessage(level);
				if (messageId) {
					messageIds[provider.name] = messageId;
				}
			})
		);

		if (Object.keys(messageIds).length === 0) return null;
		return JSON.stringify(messageIds);
	}

	/**
	 * send an admin level message to all providers
	 * returns a JSON string of provider -> messageId mappings
	 */
	async sendAdminLevelMessage(level: AdminLevelInfo): Promise<string | null> {
		if (this.providers.length === 0) return null;

		const messageIds: ProviderMessageIds = {};

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				if ("sendAdminLevelMessage" in provider) {
					const messageId = await (provider as any).sendAdminLevelMessage(level);
					if (messageId) {
						messageIds[provider.name] = messageId;
					}
				}
			})
		);

		if (Object.keys(messageIds).length === 0) return null;
		return JSON.stringify(messageIds);
	}

	/**
	 * edit a level message across all providers
	 * messageIdsJson is the JSON string stored in the database
	 */
	async editLevelMessage(messageIdsJson: string | null, level: LevelInfo): Promise<void> {
		if (!messageIdsJson || this.providers.length === 0) return;

		let messageIds: ProviderMessageIds;
		try {
			messageIds = JSON.parse(messageIdsJson);
		} catch {
			return;
		}

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = messageIds[provider.name];
				if (messageId) {
					await provider.editLevelMessage(messageId, level);
				}
			})
		);
	}

	/**
	 * edits an admin level message across all providers
	 * messageIdsJson is the JSON string stored in the database
	 */
	async editAdminLevelMessage(messageIdsJson: string | null, level: AdminLevelInfo): Promise<void> {
		if (!messageIdsJson || this.providers.length === 0) return;

		let messageIds: ProviderMessageIds;
		try {
			messageIds = JSON.parse(messageIdsJson);
		} catch {
			return;
		}

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = messageIds[provider.name];
				if (messageId && "editAdminLevelMessage" in provider) {
					await (provider as any).editAdminLevelMessage(messageId, level);
				}
			})
		);
	}

	/**
	 * delete a level message across all providers
	 * messageIdsJson is the JSON string stored in the database
	 */
	async deleteLevelMessage(messageIdsJson: string | null): Promise<void> {
		if (!messageIdsJson || this.providers.length === 0) return;

		let messageIds: ProviderMessageIds;
		try {
			messageIds = JSON.parse(messageIdsJson);
		} catch {
			return;
		}

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = messageIds[provider.name];
				if (messageId) {
					await provider.deleteLevelMessage(messageId);
				}
			})
		);
	}

	/**
	 * delete an admin level message across all providers
	 * messageIdsJson is the JSON string stored in the database
	 */
	async deleteAdminLevelMessage(messageIdsJson: string | null): Promise<void> {
		if (!messageIdsJson || this.providers.length === 0) return;

		let messageIds: ProviderMessageIds;
		try {
			messageIds = JSON.parse(messageIdsJson);
		} catch {
			return;
		}

		await Promise.allSettled(
			this.providers.map(async (provider) => {
				const messageId = messageIds[provider.name];
				if (messageId && "deleteAdminLevelMessage" in provider) {
					await (provider as any).deleteAdminLevelMessage(messageId);
				}
			})
		);
	}

	/**
	 * send a report message to all providers
	 */
	async sendReportMessage(report: ReportInfo): Promise<void> {
		if (this.providers.length === 0) return;

		await Promise.allSettled(this.providers.map((provider) => provider.sendReportMessage(report)));
	}

	/**
	 * send an audit log entry to all providers
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
