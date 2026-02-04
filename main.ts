import { createExpressApp, setupBodyParsers, setupCors } from "./modules/app_middleware.ts";
import { ensureAuthenticated, ensureAuthenticatedOrConsumeTokenForLevelParam, setupGithubAuth, setupSession } from "./modules/auth.ts";
import { loadConfig } from "./modules/config.ts";
import { ensureDataFolder, initDatabase } from "./modules/db.ts";
import { DiscordLoggingProvider, BlueskyLoggingProvider, LoggingManager } from "./modules/logging/index.ts";
import { initModeration } from "./modules/moderation.ts";
import { setupPublicFolder } from "./modules/public_folder.ts";
import { registerAdminRoutes } from "./modules/routes/admin.ts";
import { registerConfigRoute } from "./modules/routes/config.ts";
import { registerLevelRoutes } from "./modules/routes/levels.ts";
import { registerRootRoute } from "./modules/routes/root.ts";
import { initTurnstile } from "./modules/turnstile.ts";
import { initPostHog, shutdownPostHog } from "./modules/posthog.ts";

const config = loadConfig();

const app = createExpressApp();
setupCors(app, config);
setupBodyParsers(app);

setupSession(app, config);
setupGithubAuth(app, config);

setupPublicFolder(app, config);
ensureDataFolder(config);

const dbCtx = initDatabase(config);
const validateTurnstile = initTurnstile(config);
const moderateContent = initModeration(config);
const postHogClient = initPostHog(config);

async function startServer() {
	// initialize logging providers
	const loggingManager = new LoggingManager();

	if (config.useUploadLogging || config.useReporting) {
		loggingManager.addProvider(
			new DiscordLoggingProvider({
				enabled: config.discordProviderEnabled,
				botToken: config.discordBotToken,
				channelId: config.discordUploadChannelId,
				adminChannelId: config.discordAdminUploadChannelId,
				reportChannelId: config.discordReportChannelId,
				auditChannelId: config.discordAuditChannelId,
			})
		);
		loggingManager.addProvider(
			new BlueskyLoggingProvider({
				enabled: config.blueskyProviderEnabled,
				pds: config.blueskyPds,
				identifier: config.blueskyIdentifier,
				password: config.blueskyPassword,
			})
		);
		// add more providers here in the future:
		// loggingManager.addProvider(new SlackLoggingProvider({ ... }));
		// loggingManager.addProvider(new BlueskyLoggingProvider({ ... }));
	}

	await loggingManager.initAll();

	registerRootRoute(app, config);
	registerConfigRoute(app, config);
	registerLevelRoutes(app, config, dbCtx, {
		validateTurnstile,
		moderateContent,
		loggingManager,
	});

	const ensureAuth = ensureAuthenticated(config);
	const ensureAuthOrToken = ensureAuthenticatedOrConsumeTokenForLevelParam(config, dbCtx.consumeOneTimeTokenForLevel);
	registerAdminRoutes(app, config, dbCtx, {
		ensureAuthenticated: ensureAuth,
		ensureAuthenticatedOrConsumeTokenForLevelParam: ensureAuthOrToken,
		loggingManager,
	});

	console.log(`UI Status - Test UI: ${config.useTestUI ? "enabled" : "disabled"}, Admin UI: ${config.useAdminUI ? "enabled" : "disabled"}`);

	app.listen(config.port, () => {
		console.log(`HTTP server running on http://localhost:${config.port}`);
	});
}

startServer();

Deno.addSignalListener("SIGINT", () => {
	console.log("Shutting down...");
	shutdownPostHog(postHogClient);
	Deno.exit();
});
