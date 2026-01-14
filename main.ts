import { createExpressApp, setupBodyParsers, setupCors } from "./modules/app_middleware.ts";
import { ensureAuthenticated, ensureAuthenticatedOrConsumeTokenForLevelParam, setupGithubAuth, setupSession } from "./modules/auth.ts";
import { loadConfig } from "./modules/config.ts";
import { createDiscordClients } from "./modules/discord.ts";
import { ensureDataFolder, initDatabase } from "./modules/db.ts";
import { initModeration } from "./modules/moderation.ts";
import { setupPublicFolder } from "./modules/public_folder.ts";
import { registerAdminRoutes } from "./modules/routes/admin.ts";
import { registerConfigRoute } from "./modules/routes/config.ts";
import { registerLevelRoutes } from "./modules/routes/levels.ts";
import { registerRootRoute } from "./modules/routes/root.ts";
import { initTurnstile } from "./modules/turnstile.ts";

const config = loadConfig();

const app = createExpressApp();
setupCors(app, config);
setupBodyParsers(app);

setupSession(app, config);
setupGithubAuth(app, config);

setupPublicFolder(app, config);
ensureDataFolder(config);

const dbCtx = initDatabase(config);
const { reportWebhookClient, uploadWebhookClient } = createDiscordClients(config);
const validateTurnstile = initTurnstile(config);
const moderateContent = initModeration(config);

registerRootRoute(app, config);
registerConfigRoute(app, config);
registerLevelRoutes(app, config, dbCtx, {
	validateTurnstile,
	moderateContent,
	reportWebhookClient,
	uploadWebhookClient,
});

const ensureAuth = ensureAuthenticated(config);
const ensureAuthOrToken = ensureAuthenticatedOrConsumeTokenForLevelParam(config, dbCtx.consumeOneTimeTokenForLevel);
registerAdminRoutes(app, dbCtx, {
	ensureAuthenticated: ensureAuth,
	ensureAuthenticatedOrConsumeTokenForLevelParam: ensureAuthOrToken,
});

console.log(`UI Status - Test UI: ${config.useTestUI ? "enabled" : "disabled"}, Admin UI: ${config.useAdminUI ? "enabled" : "disabled"}`);

app.listen(config.port, () => {
	console.log(`HTTP server running on http://localhost:${config.port}`);
});
