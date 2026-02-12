import type { ServerConfig } from "./config.ts";
import { createCanvas, Image } from "@gfx/canvas";
import { izombiePlantsMap } from "./levels_io.ts";
import type { PlantData } from "./plantImages.ts";

const PUMPKIN_HEAD_INDEX = izombiePlantsMap.indexOf("oPumpkinHead");

async function loadImage(url: string): Promise<Image> {
	const res = await fetch(url);
	const buf = await res.arrayBuffer();
	const img = new Image();
	img.src = new Uint8Array(buf);
	return img;
}

export async function renderThumbnailCanvas(
	thumb: number[][],
	isWater: boolean,
	plantImages: { [key: string]: PlantData },
	config: ServerConfig,
): Promise<Uint8Array> {
	const gameUrl = config.gameUrl.endsWith("/")
		? config.gameUrl.slice(0, -1)
		: config.gameUrl;
	const baseUrl = `${gameUrl}/game/`;

	const canvas = createCanvas(900, 600);
	const ctx = canvas.getContext("2d");

	// draw background
	const bgPath = isWater ? "images/interface/background4.jpg" : "images/interface/background2.jpg";
	const bgImg = await loadImage(`${baseUrl}${bgPath}`);
	ctx.drawImage(bgImg, -115, 0, 1400, 600);

	// sort by zindex (plant[5])
	thumb.sort((a, b) => a[5] - b[5]);

	// preload all plant images + shadow
	const shadowImg = await loadImage(`${baseUrl}images/interface/plantshadow32.png`);
	const images = await Promise.all(
		thumb.map((plant) => {
			const plantName = izombiePlantsMap[plant[0]];
			const data = plantImages[plantName];
			const src = plant[0] !== PUMPKIN_HEAD_INDEX ? data.PicArr[1] : data.PicArr[8];
			return loadImage(`${baseUrl}${src}`);
		})
	);

	// draw plants (game renders at 0.9 scale, so scale from center)
	const gameScale = 0.9;
	thumb.forEach((plant, i) => {
		const w = plant[3] / gameScale;
		const h = plant[4] / gameScale;
		const x = plant[1] + (plant[3] - w) / 2;
		const y = plant[2] + (plant[4] - h) / 2;

		// draw shadow using per-plant getShadow CSS style
		const plantName = izombiePlantsMap[plant[0]];
		const data = plantImages[plantName];
		const style = data.shadowStyle;
		if (!style.includes("display:none") && !style.includes("display: none")) {
			const leftMatch = style.match(/left:\s*(-?[\d.]+)px/);
			const topMatch = style.match(/top:\s*(-?[\d.]+)px/);
			const shadowLeft = leftMatch ? parseFloat(leftMatch[1]) : 0;
			const shadowTop = topMatch ? parseFloat(topMatch[1]) : 0;
			ctx.drawImage(shadowImg, x + shadowLeft / gameScale, y + shadowTop / gameScale);
		}

		ctx.drawImage(images[i], x, y, w, h);
	});

	return canvas.encode("png");
}
