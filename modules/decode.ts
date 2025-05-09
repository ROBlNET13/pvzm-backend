import pako from "pako";

interface Plant {
	zIndex: number;
	plantRow: number;
	plantCol: number;
	plantName: string;
	eleLeft: number;
	eleTop: number;
}

interface Clone {
	plants: Plant[];
	music: string;
	sun: number;
	name: string;
	lfValue: number[];
	stripeCol: number;
	screenshot?: string;
}

const TINYIFIER_MAP = {
	// main
	lfValue: 1,
	music: 2,
	name: 3,
	plants: 4,
	screenshot: 5,
	stripeCol: 6,
	sun: 7,
	// plants
	plantCol: 8,
	plantName: 9,
	plantRow: 10,
	zIndex: 11,
	eleLeft: 12,
	eleTop: 13,
};

function decompressStringFromBytes(
	compressed: Uint8Array | ArrayBuffer | number[],
): string {
	const inputData = Array.isArray(compressed)
		? new Uint8Array(compressed)
		: compressed;
	const decompressed = pako.inflate(inputData);
	const decompressedString = new TextDecoder().decode(decompressed);
	return decompressedString;
}

function untinyifyClone(tinyString: string): Clone {
	const REVERSE_TINYIFIER_MAP: Record<number, string> = Object.fromEntries(
		Object.entries(TINYIFIER_MAP).map(([key, value]) => [value, key]),
	);
	const originalClone: Partial<Clone> = {};
	const pairs = tinyString.split("\uE006");

	for (const pair of pairs) {
		const [tinyKey, tinyValue] = pair.split("\uE005");
		const originalKey = REVERSE_TINYIFIER_MAP[parseInt(tinyKey, 10)];

		if (!originalKey) {
			continue;
		} // skip if key not found

		if (originalKey === "plants") {
			const plants: Plant[] = [];
			const plantStrings = tinyValue.split("\uE003");
			for (const plantString of plantStrings) {
				if (!plantString) {
					continue;
				}
				const plantObj: Partial<Plant> = {};
				const plantData = plantString
					.slice(1, -1) // remove start/end markers \ue001
					.split("\uE002");
				for (const plantPair of plantData) {
					const [plantTinyKey, plantValueStr] = plantPair.split(
						"\uE004",
					);
					const plantOriginalKey = REVERSE_TINYIFIER_MAP[
						parseInt(plantTinyKey, 10)
					] as keyof Plant;
					if (plantOriginalKey) {
						// convert numeric values back to numbers
						if (
							[
								"zIndex",
								"plantRow",
								"plantCol",
								"eleLeft",
								"eleTop",
							].includes(plantOriginalKey)
						) {
							const numericKey = plantOriginalKey as
								| "zIndex"
								| "plantRow"
								| "plantCol"
								| "eleLeft"
								| "eleTop";
							plantObj[numericKey] = parseInt(plantValueStr, 10);
						} else if (plantOriginalKey === "plantName") {
							plantObj[plantOriginalKey] = plantValueStr;
						}
					}
				}
				plants.push(plantObj as Plant);
			}
			originalClone[originalKey] = plants;
		} else if (originalKey === "lfValue") {
			originalClone[originalKey] = tinyValue.split("\uE000").map(Number);
		} else if (["sun", "stripeCol"].includes(originalKey)) {
			originalClone[originalKey as "sun" | "stripeCol"] = parseInt(
				tinyValue,
				10,
			);
		} else {
			originalClone[originalKey as keyof Clone] = tinyValue as any; // keep as string for name, music, screenshot
		}
	}
	return originalClone as Clone;
}

export function decodeFile(
	compressedData: Uint8Array | ArrayBuffer | number[],
): Clone {
	const decompressedString = decompressStringFromBytes(compressedData);
	const cloneData = untinyifyClone(decompressedString);
	return cloneData;
}
