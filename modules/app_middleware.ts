import cors from "cors";
import express from "express";
import msgpack from "express-msgpack";
import { decode as msgpackDecode, encode as msgpackEncode } from "@std/msgpack";
import { Buffer } from "node:buffer";

import { config } from "./config.ts";

export function createExpressApp(): any {
	const app = express() as any;

	app.disable("x-powered-by");
	app.use((_req: any, res: any, next: any) => {
		res.setHeader("X-Powered-By", "Braaaains...");
		next();
	});

	app.use(
		msgpack({
			encoder: (data: any) => {
				const encoded = msgpackEncode(data);
				return Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
			},
			decoder: msgpackDecode,
		})
	);

	return app;
}

export function setupCors(app: any) {
	if (config.corsEnabled) {
		const corsOptions = {
			origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
				if (!origin) return callback(null, true);
				return callback(null, config.allowedOrigins.includes(origin));
			},
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Accept", "Authorization"],
			credentials: true,
		};

		app.use(cors(corsOptions));
		console.log(`CORS enabled for origins: ${config.allowedOrigins.join(", ") || "none"}`);
	} else {
		app.use(cors());
		console.log("CORS disabled - allowing all origins");
	}
}

export function setupBodyParsers(app: any) {
	app.use(express.json());
	app.use(
		express.raw({
			type: "application/octet-stream",
			limit: "10mb",
		})
	);
}
