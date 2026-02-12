import type { ServerConfig } from "./config.ts";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

export type PlantData = {
	PicArr: string[];
	width: number;
	height: number;
	shadowStyle: string;
};

export async function getPlantImages(config: ServerConfig): Promise<{ [key: string]: PlantData }> {
	const gameUrl = config.gameUrl.endsWith("/") ? config.gameUrl.slice(0, -1) : config.gameUrl;

	// snapshot existing keys so we can clean up after import
	const keysBefore = new Set(Object.keys(g));

	// set up dummy globals so plant files can be imported
	const defaultGetShadow = (a: { width: number; height: number }) => "left:" + (a.width * 0.5 - 48) + "px;top:" + (a.height - 22) + "px";
	g.InheritO = (_base: unknown, data: Record<string, unknown>) => {
		return {
			prototype: {
				PicArr: data?.PicArr ?? [],
				width: data?.width ?? 0,
				height: data?.height ?? 0,
				getShadow: data?.getShadow ?? defaultGetShadow,
			},
		};
	};
	g.CPlants = { prototype: { PicArr: [], getShadow: defaultGetShadow } };
	g.$User = {
		Visitor: {
			TimeStep: 0,
		},
		Browser: {
			IE6: false,
		},
		Client: {
			Mobile: false,
		},
	};
	g.$Random = "";
	g.window = g;

	try {
		// dynamic import resolves all plant file imports via the game URL
		await import(`${gameUrl}/game/js/CPlants.js`);

		// CPlants.js sets window[plantName] for each plant.
		// In Deno, window === globalThis, so they're on g now.
		const plantImages: { [key: string]: PlantData } = {};
		for (const key of Object.keys(g)) {
			const val = g[key];
			if (val?.prototype?.PicArr && Array.isArray(val.prototype.PicArr)) {
				const w = val.prototype.width ?? 0;
				const h = val.prototype.height ?? 0;
				const getShadow = val.prototype.getShadow ?? defaultGetShadow;
				plantImages[key] = {
					PicArr: val.prototype.PicArr,
					width: w,
					height: h,
					shadowStyle: getShadow({ width: w, height: h }),
				};
			}
		}

		return plantImages;
	} finally {
		// remove all keys added during import
		for (const key of Object.keys(g)) {
			if (!keysBefore.has(key)) {
				delete g[key];
			}
		}
	}
}
