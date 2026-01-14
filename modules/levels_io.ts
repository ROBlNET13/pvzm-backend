import pako from "pako";
import { decode as msgpackDecode, encode as msgpackEncode } from "@msgpack/msgpack";

export interface Plant {
	zIndex: number;
	plantRow: number;
	plantCol: number;
	plantName: string;
	eleLeft?: number;
	eleTop?: number;
	eleWidth?: number;
	eleHeight?: number;
}

export interface Clone {
	plants: Plant[];
	music: string;
	sun: number;
	name: string;
	lfValue: number[];
	stripeCol?: number;
	screenshot?: string;
}

export type CloneLike = Clone;

export const IZL3_HEADER = new Uint8Array([0x49, 0x5a, 0x4c, 0x33]); // "IZL3"

type DecodeLevelResult =
	| { decoded: ReturnType<typeof decodeFile>; decodeError: null }
	| { decoded: null; decodeError: string };

export async function decodeLevelFromDisk(dataFolderPath: string, levelId: number, version: number): Promise<DecodeLevelResult> {
	try {
		const fileExtension = `izl${version === 1 ? "" : version}`;
		const filePath = `${dataFolderPath}/${levelId}.${fileExtension}`;
		const fileBytes = await Deno.readFile(filePath);
		return { decoded: decodeFile(fileBytes), decodeError: null };
	} catch (error) {
		return {
			decoded: null,
			decodeError: (error as Error).message || String(error),
		};
	}
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
	eleWidth: 14,
	eleHeight: 15,
};

const REVERSE_TINYIFIER_MAP: Record<number, string> = Object.fromEntries(
	Object.entries(TINYIFIER_MAP).map(([key, value]) => [value, key])
);

export const allPlantsStringArray = [
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
	"oILilyPad",
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
];

// Client name for this list (kept as alias for API familiarity)
export const izombiePlantsMap = allPlantsStringArray;

function packFromArray(arr: number[]): number {
	if (arr.length < 6 || arr.length > 9) {
		throw new Error(`lfValue must contain 6-9 elements, got ${arr.length}`);
	}

	let packed = 0;
	for (let i = 0; i < arr.length; i++) {
		const value = arr[i];
		if (!Number.isInteger(value) || value < 0 || value > 3) {
			throw new Error(`lfValue[${i}] must be an integer 0-3, got ${value}`);
		}
		packed |= value << (i * 2);
	}

	const lengthBits = (arr.length - 6) << 14;
	packed |= lengthBits;

	return packed;
}

function unpackToArray(packed: number): number[] {
	const lengthBits = (packed >> 14) & 3;
	const length = lengthBits + 6; // 0 -> 6, 1 -> 7, 2 -> 8, 3 -> 9

	const arr: number[] = [];
	for (let i = 0; i < length; i++) {
		const value = (packed >> (i * 2)) & 3;
		arr.push(value);
	}
	return arr;
}

function tinyifyKeys(obj: any): any {
	if (Array.isArray(obj)) {
		return obj.map((item) => tinyifyKeys(item));
	}

	if (obj !== null && typeof obj === "object") {
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			const mappedKey = (TINYIFIER_MAP as any)[key] ?? key;

			if (key === "lfValue" && Array.isArray(value)) {
				result[mappedKey] = packFromArray(value as number[]);
				continue;
			}

			if (key === "plantName" && typeof value === "string") {
				const plantIndex = allPlantsStringArray.indexOf(value);
				result[mappedKey] = plantIndex !== -1 ? plantIndex : value;
				continue;
			}

			result[mappedKey] = tinyifyKeys(value);
		}
		return result;
	}

	return obj;
}

function reverseKeys(obj: any): any {
	if (obj instanceof Map) {
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
	}
	
	if (obj !== null && typeof obj === "object") {
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
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

function decodeIZL3Bytes(deflatedMsgpack: Uint8Array): CloneLike {
	const msgpackBytes = pako.inflate(deflatedMsgpack);

	const obj = msgpackDecode(msgpackBytes);
	const reversed = reverseKeys(obj);

	if (reversed.lfValue !== undefined && typeof reversed.lfValue === "number") {
		reversed.lfValue = unpackToArray(reversed.lfValue);
	}

	return reversed;
}

function encodeIZL3Payload(levelData: CloneLike): Uint8Array {
	const tinyified = tinyifyKeys(levelData);
	const msgpackBytes = msgpackEncode(tinyified);
	return pako.deflate(msgpackBytes, { level: 9 });
}

export function encodeIZL3File(levelData: CloneLike): Uint8Array {
	const payload = encodeIZL3Payload(levelData);
	const out = new Uint8Array(IZL3_HEADER.length + payload.length);
	out.set(IZL3_HEADER, 0);
	out.set(payload, IZL3_HEADER.length);
	return out;
}

export function encodeIZL3FileToDisk(dataFolderPath: string, levelId: number, levelData: CloneLike): Promise<void> {
	const fileExtension = `izl3`;
	const filePath = `${dataFolderPath}/${levelId}.${fileExtension}`;
	const fileBytes = encodeIZL3File(levelData);
	return Deno.writeFile(filePath, fileBytes);
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return globalThis.btoa(bin);
}

export function encodeIZL3String(levelData: CloneLike): string {
	const payload = encodeIZL3Payload(levelData);
	return "|" + bytesToBase64(payload);
}

function untinyifyClone_IZL2(tinyString: string): CloneLike {
	const originalClone: Record<string, unknown> = {};
	const pairs = tinyString.split("\uE006");

	for (const pair of pairs) {
		const [tinyKey, tinyValue] = pair.split("\uE005");
		const originalKey = REVERSE_TINYIFIER_MAP[Number(tinyKey)];

		if (!originalKey) continue;

		let originalValue: unknown;
		if (originalKey === "plants") {
			const plants: Record<string, unknown>[] = [];
			const plantStrings = (tinyValue ?? "").split("\uE003");
			for (const plantString of plantStrings) {
				if (!plantString) continue;
				const plantObj: Record<string, unknown> = {};
				const plantData = plantString.slice(1, -1).split("\uE002");
				for (const plantPair of plantData) {
					const [plantTinyKey, plantValueStr] = plantPair.split("\uE004");
					const plantOriginalKey = REVERSE_TINYIFIER_MAP[Number(plantTinyKey)];
					if (!plantOriginalKey) continue;
					if (["zIndex", "plantRow", "plantCol"].includes(plantOriginalKey)) {
						plantObj[plantOriginalKey] = parseInt(plantValueStr, 10);
					} else {
						plantObj[plantOriginalKey] = plantValueStr;
					}
				}
				plants.push(plantObj);
			}
			originalValue = plants;
		} else if (originalKey === "lfValue") {
			originalValue = (tinyValue ?? "").split("\uE000").map((n) => Number(n));
		} else if (["sun", "stripeCol"].includes(originalKey)) {
			originalValue = parseInt(tinyValue, 10);
		} else {
			originalValue = tinyValue;
		}

		originalClone[originalKey] = originalValue;
	}

	return originalClone as unknown as CloneLike;
}

function decodeIZL2Bytes(bytes: Uint8Array): CloneLike {
	const decompressed = pako.inflate(bytes);
	const decompressedString = new TextDecoder().decode(decompressed);
	return untinyifyClone_IZL2(decompressedString);
}

function decodeIZLBytes(bytes: Uint8Array): CloneLike {
	const decompressed = pako.inflate(bytes);
	const decompressedString = new TextDecoder().decode(decompressed);
	const data = decompressedString.split(";");

	const levelData = JSON.parse(data[0]) as Record<string, unknown>;
	const screenshot = data[1];
	if (screenshot) {
		levelData.screenshot = "data:image/webp;base64," + screenshot;
	}

	return levelData as unknown as CloneLike;
}

function base64ToBytes(base64: string): Uint8Array {
	const bin = globalThis.atob(base64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function stringToBytesIZL3(str: string): Uint8Array {
	const base64 = str[0] === "|" ? str.slice(1) : str;
	return base64ToBytes(base64);
}

function stringToBytesIZL2(str: string): Uint8Array {
	const base64 = str[0] === "=" ? str.slice(1) : str;
	return base64ToBytes(base64);
}

function stringToBytesIZL(str: string): Uint8Array {
	return base64ToBytes(str);
}

export function detectFileVersion(bytes: Uint8Array): number {
	if (
		bytes.length >= 4 &&
		bytes[0] === IZL3_HEADER[0] &&
		bytes[1] === IZL3_HEADER[1] &&
		bytes[2] === IZL3_HEADER[2] &&
		bytes[3] === IZL3_HEADER[3]
	) {
		return 3;
	}

	if (bytes.length >= 2 && bytes[0] === 0x78) {
		return 2;
	}

	return 1;
}

export function detectStringVersion(str: string): number {
	if (str[0] === "|") return 3;
	if (str[0] === "=") return 2;
	return 1;
}

export function decodeBytes(compressedData: Uint8Array | ArrayBuffer | number[]): CloneLike {
	const bytes = Array.isArray(compressedData) ? new Uint8Array(compressedData) : new Uint8Array(compressedData);
	const version = detectFileVersion(bytes);

	if (version === 3) {
		return decodeIZL3Bytes(bytes.slice(4)); // strip IZL3 header
	}
	if (version === 2) {
		return decodeIZL2Bytes(bytes);
	}
	return decodeIZLBytes(bytes);
}

export function decodeString(str: string): CloneLike {
	const version = detectStringVersion(str);
	if (version === 3) return decodeIZL3Bytes(stringToBytesIZL3(str));
	if (version === 2) return decodeIZL2Bytes(stringToBytesIZL2(str));
	return decodeIZLBytes(stringToBytesIZL(str));
}

export function decodeFile(compressedData: Uint8Array | ArrayBuffer | number[]): Clone {
	return decodeBytes(compressedData) as Clone;
}
