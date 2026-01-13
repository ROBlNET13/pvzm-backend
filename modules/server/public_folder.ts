import express from "express";

import type { ServerConfig } from "./config.ts";

export function setupPublicFolder(app: any, config: ServerConfig) {
	if (!config.usePublicFolder) return;

	try {
		Deno.mkdirSync(config.publicFolderPath, { recursive: true });
		console.log(`Created public folder at: ${config.publicFolderPath}`);
	} catch (error) {
		if (error instanceof Deno.errors.AlreadyExists) {
			// no-op
		} else {
			console.error(`Error creating public folder: ${(error as Error).message}`);
		}
	} // add conditional route handlers BEFORE static file serving
	if (!config.useTestUI) {
		app.get("/index.html", (_req: any, res: any) => {
			res.status(404).send("Test UI is disabled");
		});
	}

	if (!config.useAdminUI) {
		app.get("/admin.html", (_req: any, res: any) => {
			res.status(404).send("Admin UI is disabled");
		});
	}

	app.use(express.static(config.publicFolderPath));
}
