import { decodeFile } from "../decode.ts";

export function detectVersion(fileBytes: Uint8Array): number {
	const izl3Header = new Uint8Array([0x49, 0x5a, 0x4c, 0x33]);
	const fileHeader = fileBytes.slice(0, 4);

	if (
		fileHeader.length >= 4 &&
		fileHeader[0] === izl3Header[0] &&
		fileHeader[1] === izl3Header[1] &&
		fileHeader[2] === izl3Header[2] &&
		fileHeader[3] === izl3Header[3]
	) {
		return 3;
	}

	return 0;
}

type DecodeLevelResult = { decoded: ReturnType<typeof decodeFile>; decodeError: null } | { decoded: null; decodeError: string };

export async function decodeLevelFromDisk(dataFolderPath: string, levelId: number, version: number): Promise<DecodeLevelResult> {
	try {
		const fileExtension = `izl${version || 3}`;
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
