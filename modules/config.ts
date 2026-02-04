export type ServerConfig = {
	port: number;
	corsEnabled: boolean;
	allowedOrigins: string[];

	useGithubAuth: boolean;
	githubClientID: string;
	githubClientSecret: string;
	allowedUsers: string[];
	sessionSecret: string;

	useTestUI: boolean;
	useAdminUI: boolean;
	usePublicFolder: boolean;
	publicFolderPath: string;

	useReporting: boolean;
	useUploadLogging: boolean;

	discordProviderEnabled: boolean;
	discordBotToken: string;
	discordUploadChannelId: string;
	discordAdminUploadChannelId: string;
	discordReportChannelId: string;
	discordAuditChannelId: string;
	discordMentionUserIds: string[];

	blueskyProviderEnabled: boolean;
	blueskyIdentifier: string;
	blueskyPassword: string;
	blueskyPds: string;

	gameUrl: string;
	backendUrl: string;

	dbPath: string;
	dataFolderPath: string;
	createDataFolder: boolean;

	useTurnstile: boolean;
	turnstileSecret: string | null;
	turnstileTesting: boolean;

	useOpenAIModeration: boolean;
	openAiApiKey: string | null;
	turnstileSiteKey: string | null;

	usePostHogAnalytics: boolean;
	postHogApiKey: string;
	postHogHost: string;
};

function splitCsv(value: string): string[] {
	if (!value) return [];
	return value.split(",");
}

export function loadConfig(): ServerConfig {
	const port = Number(Deno.env.get("PORT") || 3000);
	const corsEnabled = (Deno.env.get("CORS_ENABLED") ?? "true") === "true";
	const allowedOriginsString = Deno.env.get("ALLOWED_ORIGINS") ?? "https://pvzm.net,https://backend.pvzm.net";
	const allowedOrigins = allowedOriginsString ? splitCsv(allowedOriginsString) : [];

	const useGithubAuth = (Deno.env.get("USE_GITHUB_AUTH") ?? "true") === "true";
	const githubClientID = Deno.env.get("GITHUB_CLIENT_ID") || "";
	const githubClientSecret = Deno.env.get("GITHUB_CLIENT_SECRET") || "";
	const allowedUsersString = Deno.env.get("GITHUB_ALLOWED_USERS") || "";
	const allowedUsers = allowedUsersString ? splitCsv(allowedUsersString) : [];
	const sessionSecret = Deno.env.get("SESSION_SECRET") || "default-secret";

	const useTestUI = (Deno.env.get("USE_TEST_UI") ?? "true") === "true";
	const useAdminUI = (Deno.env.get("USE_ADMIN_UI") ?? "true") === "true";

	const usePublicFolder = (Deno.env.get("USE_PUBLIC_FOLDER") ?? "true") === "true";
	const publicFolderPath = Deno.env.get("PUBLIC_FOLDER_PATH") || "./public";

	const useReporting = Deno.env.get("USE_REPORTING") !== "false";
	const useUploadLogging = Deno.env.get("USE_UPLOAD_LOGGING") === "true";

	const discordProviderEnabled = (Deno.env.get("DISCORD_PROVIDER_ENABLED") ?? "true") === "true";
	const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
	const discordUploadChannelId = Deno.env.get("DISCORD_UPLOAD_CHANNEL_ID") || "";
	const discordAdminUploadChannelId = Deno.env.get("DISCORD_ADMIN_UPLOAD_CHANNEL_ID") || "";
	const discordReportChannelId = Deno.env.get("DISCORD_REPORT_CHANNEL_ID") || "";
	const discordAuditChannelId = Deno.env.get("DISCORD_AUDIT_CHANNEL_ID") || "";
	const discordMentionUserIdsString = Deno.env.get("DISCORD_MENTION_USER_IDS") || "";
	const discordMentionUserIds = discordMentionUserIdsString ? splitCsv(discordMentionUserIdsString) : [];

	const blueskyProviderEnabled = (Deno.env.get("BLUESKY_PROVIDER_ENABLED") ?? "true") === "true";
	const blueskyIdentifier = Deno.env.get("BLUESKY_IDENTIFIER") || "";
	const blueskyPassword = Deno.env.get("BLUESKY_PASSWORD") || "";
	const blueskyPds = Deno.env.get("BLUESKY_PDS") || "https://bsky.social";

	const gameUrl = Deno.env.get("GAME_URL") || "https://pvzm.net";
	const backendUrl = Deno.env.get("BACKEND_URL") || "https://backend.pvzm.net";

	const dbPath = Deno.env.get("DB_PATH") || "./database.db";
	const dataFolderPath = Deno.env.get("DATA_FOLDER_PATH") || "./data";
	const createDataFolder = (Deno.env.get("CREATE_DATA_FOLDER") ?? "true") === "true";

	const useTurnstile = (Deno.env.get("USE_TURNSTILE") ?? "true") === "true";
	const turnstileSecret = Deno.env.get("TURNSTILE_SECRET") || null;
	const turnstileTesting = Deno.env.get("TURNSTILE_TESTING") === "true";

	const useOpenAIModeration = (Deno.env.get("USE_OPENAI_MODERATION") ?? "true") === "true";
	const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || null;
	const turnstileSiteKey = Deno.env.get("TURNSTILE_SITE_KEY") || null;

	const usePostHogAnalytics = (Deno.env.get("USE_POSTHOG_ANALYTICS") ?? "false") === "true";
	const postHogApiKey = Deno.env.get("POSTHOG_API_KEY") || "";
	const postHogHost = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";

	return {
		port,
		corsEnabled,
		allowedOrigins,

		useGithubAuth,
		githubClientID,
		githubClientSecret,
		allowedUsers,
		sessionSecret,

		useTestUI,
		useAdminUI,
		usePublicFolder,
		publicFolderPath,

		useReporting,
		useUploadLogging,

		discordProviderEnabled,
		discordBotToken,
		discordUploadChannelId,
		discordAdminUploadChannelId,
		discordReportChannelId,
		discordAuditChannelId,
		discordMentionUserIds,

		blueskyProviderEnabled,
		blueskyIdentifier,
		blueskyPassword,
		blueskyPds,

		gameUrl,
		backendUrl,

		dbPath,
		dataFolderPath,
		createDataFolder,

		useTurnstile,
		turnstileSecret,
		turnstileTesting,

		useOpenAIModeration,
		openAiApiKey,
		turnstileSiteKey,

		usePostHogAnalytics,
		postHogApiKey,
		postHogHost,
	};
}
