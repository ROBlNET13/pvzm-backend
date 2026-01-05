import pako from "npm:pako";
import { decode as msgpackDecode } from "npm:@msgpack/msgpack";

interface Plant {
	zIndex: number;
	plantRow: number;
	plantCol: number;
	plantName: string;
	// Frontend OLD untinyify does not force these to numbers; keep decode permissive.
	eleLeft?: number | string;
	eleTop?: number | string;
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

const REVERSE_TINYIFIER_MAP: Record<number, string> = Object.fromEntries(
	Object.entries(TINYIFIER_MAP).map(([key, value]) => [value, key]),
);

// Plant names array matching the frontend
const allPlantsStringArray = [
	"oPeashooter",
	"oSunFlower",
	"oCherryBomb",
	"oWallNut",
	"oPotatoMine",
	"oSnowPea",
	"oChomper",
	"oRepeater",
	"oPuffShroom",
	"oSunShroom",
	"oFumeShroom",
	"oGraveBuster",
	"oHypnoShroom",
	"oScaredyShroom",
	"oIceShroom",
	"oDoomShroom",
	"oLilyPad",
	"oSquash",
	"oThreepeater",
	"oTangleKlep",
	"oJalapeno",
	"oSpikeweed",
	"oTorchwood",
	"oTallNut",
	"oCactus",
	"oPlantern",
	"oSplitPea",
	"oStarfruit",
	"oPumpkinHead",
	"oFlowerPot",
	"oCoffeeBean",
	"oGarlic",
	"oSeaShroom",
	"oOxygen",
	"ostar",
	"oTTS",
	"oGun",
	"oSeaAnemone",
	"oGatlingPea",
	"oGloomShroom",
	"oTwinSunflower",
	"oSpikerock",
	"oTenManNut",
	"oSnowRepeater",
	"oCattail",
	"oLotusRoot",
	"oIceFumeShroom",
	"oLaserBean",
	"oBigChomper",
	"oFlamesMushroom",
	"oBalloon",
];

function _packArray(arr: number[]): number {
	if (arr.length < 6 || arr.length > 7) {
		throw new Error(
			"Array must contain 6 or 7 elements, got " + arr.length,
		);
	}

	let packed = 0;
	for (let i = 0; i < arr.length; i++) {
		const value = arr[i];
		if (value < 0 || value > 3) {
			throw new Error(
				`Value at index ${i} must be between 0 and 3, got ${value}`,
			);
		}
		// Shift the value to its position and OR it with the packed result
		packed |= value << (i * 2);
	}

	// Store the length in the highest bits (bits 14-15 for 6 or 7 elements)
	// 6 elements = 0, 7 elements = 1
	const lengthBits = (arr.length - 6) << 14;
	packed |= lengthBits;

	return packed;
}

function unpackToArray(packed: number): number[] {
	// Extract the length from bits 14-15
	const lengthBits = (packed >> 14) & 3;
	const length = lengthBits + 6; // 0 -> 6, 1 -> 7

	const arr: number[] = [];
	for (let i = 0; i < length; i++) {
		// Extract 2 bits at position i*2 using mask 0b11 (3 in decimal)
		const value = (packed >> (i * 2)) & 3;
		arr.push(value);
	}
	return arr;
}

function padBase64(unpadded: string): string {
	const mod = unpadded.length % 4;
	return mod === 0 ? unpadded : unpadded + "=".repeat(4 - mod);
}

function decompressString(compressedBase64: string): string {
	const compressed = Uint8Array.from(
		atob(padBase64(compressedBase64)),
		(c) => c.charCodeAt(0),
	);
	const decompressed = pako.inflate(compressed);
	return new TextDecoder().decode(decompressed);
}

function compressString(input: string): string {
	const inputUTF8 = new TextEncoder().encode(input);
	const compressed = pako.deflate(inputUTF8, { level: 9 });
	// match frontend: btoa(String.fromCharCode(...compressed))
	const compressedBase64 = btoa(String.fromCharCode(...compressed));
	return compressedBase64.replaceAll("=", "");
}

function decompressStringToBytes(compressedBase64: string): Uint8Array {
	const compressed = Uint8Array.from(
		atob(padBase64(compressedBase64)),
		(c) => c.charCodeAt(0),
	);
	return pako.inflate(compressed);
}

function decompressStringFromBytes(
	compressed: Uint8Array | ArrayBuffer | number[],
): string {
	const inputData = Array.isArray(compressed)
		? new Uint8Array(compressed)
		: (compressed instanceof ArrayBuffer
			? new Uint8Array(compressed)
			: compressed);

	const decompressed = pako.inflate(inputData);
	return new TextDecoder().decode(decompressed);
}

function maybeInflateZlibBytes(bytes: Uint8Array): Uint8Array {
	// zlib-wrapped deflate commonly starts with 0x78 (e.g. 0x78 0x9C / 0xDA / 0x01 / 0x5E)
	if (bytes.length >= 2 && bytes[0] === 0x78) {
		try {
			return pako.inflate(bytes);
		} catch {
			// Not actually zlib/deflate; treat as already-uncompressed msgpack.
		}
	}
	return bytes;
}

function reverseKeys(obj: any): any {
	if (obj instanceof Map) {
		// msgpack decode may produce Maps depending on options/inputs
		const result: any = {};
		for (const [k, v] of obj.entries()) {
			const keyStr = String(k);
			const mapped = REVERSE_TINYIFIER_MAP[Number(keyStr)] ?? keyStr;

			if (mapped === "plantName" && typeof v === "number") {
				result[mapped] = allPlantsStringArray[v] || v;
			} else {
				result[mapped] = reverseKeys(v);
			}
		}
		return result;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => reverseKeys(item));
	} else if (obj !== null && typeof obj === "object") {
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			// frontend does REVERSE_TINYIFIER_MAP[key]; ensure numeric-string keys map correctly
			const mapped = REVERSE_TINYIFIER_MAP[Number(key)] ?? key;

			if (mapped === "plantName" && typeof value === "number") {
				result[mapped] = allPlantsStringArray[value] || value;
			} else {
				result[mapped] = reverseKeys(value);
			}
		}
		return result;
	}
	return obj;
}

function untinyifyClone(tinyBytes: Uint8Array): Clone {
	// Be tolerant: some paths may still pass deflated bytes.
	const msgpackBytes = maybeInflateZlibBytes(tinyBytes);

	const obj = msgpackDecode(msgpackBytes);
	const reversed = reverseKeys(obj);

	if (
		reversed.lfValue !== undefined && typeof reversed.lfValue === "number"
	) {
		reversed.lfValue = unpackToArray(reversed.lfValue);
	}
	return reversed;
}

function untinyifyClone_OLD(tinyString: string): Clone {
	const originalClone: Partial<Clone> = {};
	const pairs = tinyString.split("\uE006");

	for (const pair of pairs) {
		const [tinyKey, tinyValue] = pair.split("\uE005");
		const originalKey = REVERSE_TINYIFIER_MAP[parseInt(tinyKey, 10)];

		if (!originalKey) continue;

		if (originalKey === "plants") {
			const plants: Plant[] = [];
			const plantStrings = tinyValue.split("\uE003");
			for (const plantString of plantStrings) {
				if (!plantString) continue;

				const plantObj: Record<string, any> = {};
				const plantData = plantString.slice(1, -1).split("\uE002");

				for (const plantPair of plantData) {
					const [plantTinyKey, plantValueStr] = plantPair.split(
						"\uE004",
					);
					const plantOriginalKey = REVERSE_TINYIFIER_MAP[
						parseInt(plantTinyKey, 10)
					] as keyof Plant;

					if (!plantOriginalKey) continue;

					// match frontend OLD behavior: only these are forced numeric
					if (
						["zIndex", "plantRow", "plantCol"].includes(
							plantOriginalKey,
						)
					) {
						plantObj[plantOriginalKey] = parseInt(
							plantValueStr,
							10,
						);
					} else {
						plantObj[plantOriginalKey] = plantValueStr;
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
			originalClone[originalKey as keyof Clone] = tinyValue as any;
		}
	}
	return originalClone as Clone;
}

function parseClone(stringifiedData: string): Clone {
	const levelData = JSON.parse(
		decompressString(stringifiedData.split(";")[0]),
	);
	const screenshot = stringifiedData.split(";")[1];
	if (screenshot) {
		levelData.screenshot = "data:image/webp;base64," + screenshot;
	}
	return levelData;
}

function parseCloneTiny_OLD(stringifiedData: string): Clone {
	if (stringifiedData[0] === "=") {
		return untinyifyClone_OLD(decompressString(stringifiedData.slice(1)));
	}
	throw new Error("Invalid data format");
}

function parseCloneTiny(stringifiedData: string): Clone {
	if (stringifiedData[0] === "|") {
		// New format - decompress and deserialize msgpack
		const compressed = decompressStringToBytes(stringifiedData.slice(1));
		return untinyifyClone(compressed);
	} else if (stringifiedData[0] === "=") {
		// Backwards compatibility with old format
		return untinyifyClone_OLD(decompressString(stringifiedData.slice(1)));
	}
	throw new Error("Invalid data format");
}

export function decodeFile(
	compressedData: Uint8Array | ArrayBuffer | number[],
): Clone {
	const fileBytes = Array.isArray(compressedData)
		? new Uint8Array(compressedData)
		: new Uint8Array(compressedData);

	// check if first 4 bytes are "IZL3" (49 5A 4C 33)
	const izl3Header = new Uint8Array([0x49, 0x5A, 0x4C, 0x33]);
	const fileHeader = fileBytes.slice(0, 4);

	if (
		fileHeader.length >= 4 &&
		fileHeader[0] === izl3Header[0] &&
		fileHeader[1] === izl3Header[1] &&
		fileHeader[2] === izl3Header[2] &&
		fileHeader[3] === izl3Header[3]
	) {
		// IZL3 format - compressed msgpack bytes after the header.
		// Decode directly from bytes (no base64 roundtrip).
		const payload = fileBytes.slice(4);

		// Most IZL3 payloads are deflated msgpack, but tolerate already-msgpack payloads too.
		const maybeMsgpack = maybeInflateZlibBytes(payload);
		return untinyifyClone(maybeMsgpack);
	}

	// Frontend: if first byte is 0x78, treat as deflate old-format (no extra heuristics)
	if (fileBytes.length >= 2 && fileBytes[0] === 0x78) {
		const decompressedString = decompressStringFromBytes(fileBytes);
		const stringified = "=" + compressString(decompressedString);
		return parseCloneTiny_OLD(stringified);
	}

	// Old format - treat as string data
	const decompressedString = decompressStringFromBytes(fileBytes);
	const cloneData = untinyifyClone_OLD(decompressedString);
	return cloneData;
}

export function decodeLevelData(stringifiedData: string): Clone {
	// Handle different formats based on prefix
	if (stringifiedData[0] === "|") {
		// New MessagePack format
		return parseCloneTiny(stringifiedData);
	} else if (stringifiedData[0] === "=") {
		// Old tinyified format
		return parseCloneTiny_OLD(stringifiedData);
	} else if (
		stringifiedData.includes(";") || stringifiedData.startsWith("eJ")
	) {
		// Original JSON format (with or without screenshot)
		return parseClone(stringifiedData);
	} else {
		throw new Error("Unknown level data format");
	}
}
