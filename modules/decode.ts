import pako from "npm:pako";
import { decode as msgpackDecode } from "npm:@msgpack/msgpack";

interface Plant {
	zIndex: number;
	plantRow: number;
	plantCol: number;
	plantName: string;
	eleLeft?: number;
	eleTop?: number;
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
	Object.entries(TINYIFIER_MAP).map(([key, value]) => [value, key])
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
        throw new Error("Array must contain 6 or 7 elements, got " + arr.length);
    }
    
    let packed = 0;
    for (let i = 0; i < arr.length; i++) {
        const value = arr[i];
        if (value < 0 || value > 3) {
            throw new Error(`Value at index ${i} must be between 0 and 3, got ${value}`);
        }
        // Shift the value to its position and OR it with the packed result
        packed |= (value << (i * 2));
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

function decompressString(compressedBase64: string): string {
	const compressed = Uint8Array.from(atob(compressedBase64), (c) => c.charCodeAt(0));
	const decompressed = pako.inflate(compressed);
	const decompressedString = new TextDecoder().decode(decompressed);
	return decompressedString;
}

function compressString(input: string): string {
	const inputUTF8 = new TextEncoder().encode(input);
	const compressed = pako.deflate(inputUTF8, { level: 9 });
	const compressedBase64 = btoa(String.fromCharCode.apply(null, Array.from(compressed)));
	return compressedBase64.replaceAll("=", "");
}

function decompressStringToBytes(compressedBase64: string): Uint8Array {
	const compressed = Uint8Array.from(atob(compressedBase64), (c) => c.charCodeAt(0));
	const decompressed = pako.inflate(compressed);
	return decompressed;
}

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

function reverseKeys(obj: any): any {
	if (Array.isArray(obj)) {
		// If it's an array, recursively process each element
		return obj.map(item => reverseKeys(item));
	} else if (obj !== null && typeof obj === 'object') {
		// If it's an object, process each key-value pair
		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			// Try to reverse the key if it exists in our map, otherwise keep the original key
			const newKey = REVERSE_TINYIFIER_MAP[key as any] !== undefined ? REVERSE_TINYIFIER_MAP[key as any] : key;
			
			// If this is a plantName and the value is a number, convert back to plant name
			if (newKey === 'plantName' && typeof value === 'number') {
				result[newKey] = allPlantsStringArray[value] || value; // fallback to original if index is invalid
			} else {
				result[newKey] = reverseKeys(value);
			}
		}
		return result;
	}
	return obj;
}

function untinyifyClone(tinyBytes: Uint8Array): Clone {
	// un-messagepack it (no decompression needed, already done)
	const obj = msgpackDecode(tinyBytes);
	// reverse the keys
	const reversed = reverseKeys(obj);
	// unpack lfValue if it exists
	// if lfValue is packed, unpack it
	if (reversed.lfValue !== undefined && typeof reversed.lfValue === "number") {
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

function parseClone(stringifiedData: string): Clone {
	const levelData = JSON.parse(decompressString(stringifiedData.split(";")[0]));
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
	
	if (fileHeader.length >= 4 && 
		fileHeader[0] === izl3Header[0] && 
		fileHeader[1] === izl3Header[1] && 
		fileHeader[2] === izl3Header[2] && 
		fileHeader[3] === izl3Header[3]) {
		// IZL3 format - already compressed msgpack data
		const compressedData = fileBytes.slice(4); // remove the IZL3 header
		const compressedBase64 = btoa(String.fromCharCode.apply(null, Array.from(compressedData)));
		const stringified = "|" + compressedBase64.replaceAll("=", "");
		return parseCloneTiny(stringified);
	}
	
	// Check for deflate header (0x78 followed by various possible second bytes)
	if (fileBytes.length >= 2 && fileBytes[0] === 0x78) {
		// Common deflate headers: 0x789C (default), 0x78DA (best compression), 0x7801 (fast), etc.
		const secondByte = fileBytes[1];
		if ((secondByte === 0x9C) || (secondByte === 0xDA) || (secondByte === 0x01) || 
			(secondByte === 0x5E) || (secondByte === 0x9C) || (secondByte === 0xDA)) {
			// Deflate format detected - treat as old format (already compressed)
			const decompressedString = decompressStringFromBytes(fileBytes);
			const stringified = "=" + compressString(decompressedString);
			return parseCloneTiny_OLD(stringified);
		}
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
	} else if (stringifiedData.includes(";") || stringifiedData.startsWith("eJ")) {
		// Original JSON format (with or without screenshot)
		return parseClone(stringifiedData);
	} else {
		throw new Error("Unknown level data format");
	}
}
