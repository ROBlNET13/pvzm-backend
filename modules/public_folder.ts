import express from "express";

import { config } from "./config.ts";

export function setupPublicFolder(app: any) {
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
	}

	// add conditional route handlers BEFORE static file serving
	if (!config.useTestUI) {
		// express.static serves index.html for "/" by default; block that too.
		app.get(["/", "/index.html"], (_req: any, res: any) => {
			res.redirect(config.gameUrl);
		});
	}

	if (!config.useAdminUI) {
		app.get("/admin.html", (_req: any, res: any) => {
			res.status(404).send("Admin UI is disabled");
		});
	}

	app.use(
		express.static(config.publicFolderPath, {
			// prevent "/" from implicitly serving index.html when the test UI is disabled.
			index: config.useTestUI ? "index.html" : false,
		})
	);
}
