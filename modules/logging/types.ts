export type LevelInfo = {
	id: number;
	name: string;
	author: string;
	gameUrl: string;
	backendUrl: string;
};

export type AdminLevelInfo = LevelInfo & {
	editUrl: string;
	deleteUrl: string;
};

export type FeaturedLevelInfo = LevelInfo & {
	featuredAt: number;
};

export type AuditLogEntry = {
	action: "edit" | "delete" | "feature" | "unfeature";
	levelId: number;
	levelName: string;
	author: string;
	changes?: string;
};

export type ReportInfo = {
	levelId: number;
	levelName: string;
	author: string;
	reason: string;
	reporterIp: string;
	editUrl: string;
	deleteUrl: string;
	viewUrl: string;
	mentionUserIds: string[];
	fileAttachment?: {
		content: Uint8Array;
		fileName: string;
	};
};

export interface LoggingProvider {
	readonly name: string;

	/**
	 * initialize the provider (connect to service, authenticate, etc.)
	 * returns true if initialization was successful
	 */
	init(): Promise<boolean>;

	/**
	 * send a new level upload message
	 * returns a provider-specific message ID, or null if failed
	 */
	sendLevelMessage(level: LevelInfo): Promise<string | null>;

	/**
	 * edit an existing level message (e.g., when name/author changes)
	 * returns true if successful
	 */
	editLevelMessage(messageId: string, level: LevelInfo): Promise<boolean>;

	/**
	 * delete a level message (e.g., when level is deleted)
	 * returns true if successful
	 */
	deleteLevelMessage(messageId: string): Promise<boolean>;

	/**
	 * send a report message (e.g., when a user reports a level)
	 * returns true if successful
	 */
	sendReportMessage(report: ReportInfo): Promise<boolean>;
}
