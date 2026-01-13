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

	discordReportWebhookUrl: string;
	discordUploadWebhookUrl: string;
	useReporting: boolean;
	useUploadLogging: boolean;
	discordMentionUserIds: string[];

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
};

function splitCsv(value: string): string[] {
	if (!value) return [];
	return value.split(",");
}

export function loadConfig(): ServerConfig {
	const port = Number(Deno.env.get("PORT") || 3000);
	const corsEnabled = (Deno.env.get("CORS_ENABLED") ?? "true") === "true";
	const allowedOriginsString =
		Deno.env.get("ALLOWED_ORIGINS") ??
		"https://pvzm.net,https://backend.pvzm.net";
	const allowedOrigins = allowedOriginsString ? splitCsv(allowedOriginsString) : [];

	const useGithubAuth = (Deno.env.get("USE_GITHUB_AUTH") ?? "true") === "true";
	const githubClientID = Deno.env.get("GITHUB_CLIENT_ID") || "";
	const githubClientSecret = Deno.env.get("GITHUB_CLIENT_SECRET") || "";
	const allowedUsersString = Deno.env.get("GITHUB_ALLOWED_USERS") || "";
	const allowedUsers = allowedUsersString ? splitCsv(allowedUsersString) : [];
	const sessionSecret = Deno.env.get("SESSION_SECRET") || "default-secret";

	const useTestUI = (Deno.env.get("USE_TEST_UI") ?? "true") === "true";
	const useAdminUI = (Deno.env.get("USE_ADMIN_UI") ?? "true") === "true";

	const usePublicFolder =
		(Deno.env.get("USE_PUBLIC_FOLDER") ?? "true") === "true";
	const publicFolderPath = Deno.env.get("PUBLIC_FOLDER_PATH") || "./public";

	const discordReportWebhookUrl = Deno.env.get("DISCORD_REPORT_WEBHOOK_URL") || "";
	const discordUploadWebhookUrl = Deno.env.get("DISCORD_UPLOAD_WEBHOOK_URL") || "";
	const useReporting = Deno.env.get("USE_REPORTING") !== "false";
	const useUploadLogging = Deno.env.get("USE_UPLOAD_LOGGING") === "true";
	const discordMentionUserIdsString = Deno.env.get("DISCORD_MENTION_USER_IDS") || "";
	const discordMentionUserIds = discordMentionUserIdsString ? splitCsv(discordMentionUserIdsString) : [];

	const gameUrl = Deno.env.get("GAME_URL") || "https://pvzm.net";
	const backendUrl = Deno.env.get("BACKEND_URL") || "https://backend.pvzm.net";

	const dbPath = Deno.env.get("DB_PATH") || "./database.db";
	const dataFolderPath = Deno.env.get("DATA_FOLDER_PATH") || "./data";
	const createDataFolder =
		(Deno.env.get("CREATE_DATA_FOLDER") ?? "true") === "true";

	const useTurnstile = (Deno.env.get("USE_TURNSTILE") ?? "true") === "true";
	const turnstileSecret = Deno.env.get("TURNSTILE_SECRET") || null;
	const turnstileTesting = Deno.env.get("TURNSTILE_TESTING") === "true";

	const useOpenAIModeration =
		(Deno.env.get("USE_OPENAI_MODERATION") ?? "true") === "true";
	const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || null;
	const turnstileSiteKey = Deno.env.get("TURNSTILE_SITE_KEY") || null;

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

		discordReportWebhookUrl,
		discordUploadWebhookUrl,
		useReporting,
		useUploadLogging,
		discordMentionUserIds,

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
	};
}
