import denoJson from "../../deno.json" with { type: "json" };

import { config } from "../config.ts";

export function registerRootRoute(app: any) {
	app.get("/", (_req: any, res: any) => {
		if (config.useTestUI) {
			res.redirect("/index.html");
		} else if (config.useAdminUI) {
			res.redirect("/admin.html");
		} else {
			res.status(404).send("No UI interfaces are enabled");
		}
	});

	app.get("/api/health", (_req: any, res: any) => {
		res.json({ status: "ok", timestamp: new Date().toISOString(), version: denoJson.version });
	});
}
